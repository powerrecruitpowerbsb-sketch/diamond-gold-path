import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import {
  METRIC_DEFS,
  METRIC_SOURCE_LABEL,
  parseHeightInput,
  type MetricSource,
} from "@/lib/athlete-metrics";
import { findHeader, parseCsv } from "@/lib/csv";
import { importTestingDay, listMatchableAthletes } from "@/lib/testing-day.functions";

export const Route = createFileRoute("/_authenticated/roster/testing")({
  head: () => ({
    meta: [
      { title: "Testing day import — Curve Recruit" },
      { name: "description", content: "Load a whole testing day of measurables from CSV as coach-verified numbers." },
      { property: "og:title", content: "Testing day import — Curve Recruit" },
      { property: "og:description", content: "Bulk-load combine and testing results for hundreds of players at once." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TestingDay,
});

const FIELD_CLASS =
  "touch-target rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";

type Athlete = { id: string; name: string; gradYear: number | null; position: string | null };
type Row = {
  index: number;
  name: string;
  gradYear: number | null;
  values: { key: string; value: number }[];
  bad: string[];
  candidates: Athlete[];
  athleteId: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Guess which CSV column holds which measurable. */
function guessMetric(header: string): string {
  const h = norm(header);
  const hints: Record<string, string[]> = {
    sixty_yard: ["60", "sixty"],
    ten_yard: ["10yd", "10yard", "tenyard"],
    twenty_yard: ["20yd", "20yard"],
    exit_velo: ["exitvelo", "ev", "exitvelocity"],
    max_exit_velo: ["maxev", "maxexit"],
    fastball_velo: ["fb", "fastball", "fbvelo"],
    of_velo: ["of", "ofvelo", "outfield"],
    if_velo: ["if", "ifvelo", "infield"],
    catcher_velo: ["c", "cvelo", "catcher"],
    pop_time: ["pop", "poptime"],
    home_to_first: ["h1", "hometofirst"],
  };
  for (const [key, list] of Object.entries(hints)) if (list.includes(h)) return key;
  const def = METRIC_DEFS.find((m) => norm(m.label) === h || norm(m.key) === h);
  if (def) return def.key;
  const partial = METRIC_DEFS.find((m) => h.includes(norm(m.label)) || h.includes(norm(m.key)));
  return partial?.key ?? "";
}

function TestingDay() {
  const listFn = useServerFn(listMatchableAthletes);
  const importFn = useServerFn(importTestingDay);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: athletes = [] } = useQuery({ queryKey: ["matchable-athletes"], queryFn: () => listFn() });

  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<string[][]>([]);
  const [nameCol, setNameCol] = useState("");
  const [yearCol, setYearCol] = useState("");
  const [metricCols, setMetricCols] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [recordedOn, setRecordedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventName, setEventName] = useState("");
  const [source, setSource] = useState<MetricSource>("other");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "problem">("all");

  async function onFile(file: File | null) {
    setRows(null);
    setError(null);
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setError("This CSV has no data rows.");
    const head = (parsed[0] ?? []).map((h) => h.trim());
    setHeaders(head);
    setRaw(parsed.slice(1));
    const name = findHeader(head, ["name", "player", "athlete", "full name"]);
    const year = findHeader(head, ["grad year", "grad", "class", "year"]);
    setNameCol(name);
    setYearCol(year);
    const guess: Record<string, string> = {};
    for (const h of head) if (h !== name && h !== year) guess[h] = guessMetric(h);
    setMetricCols(guess);
  }

  function preview() {
    const ni = headers.indexOf(nameCol);
    if (ni < 0) return setError("Pick the column with the player's name.");
    const yi = headers.indexOf(yearCol);
    const byName = new Map<string, Athlete[]>();
    for (const a of athletes) {
      const k = norm(a.name);
      byName.set(k, [...(byName.get(k) ?? []), a]);
    }
    const mapped = Object.entries(metricCols).filter(([, k]) => k);
    setRows(
      raw.map((cells, i) => {
        const name = (cells[ni] ?? "").trim();
        const yRaw = yi >= 0 ? (cells[yi] ?? "").match(/\d{4}/)?.[0] : undefined;
        const gradYear = yRaw ? Number(yRaw) : null;
        let candidates = byName.get(norm(name)) ?? [];
        if (gradYear && candidates.length > 1) {
          const narrowed = candidates.filter((c) => c.gradYear === gradYear);
          if (narrowed.length) candidates = narrowed;
        }
        const values: Row["values"] = [];
        const bad: string[] = [];
        for (const [col, key] of mapped) {
          const text = (cells[headers.indexOf(col)] ?? "").trim();
          if (!text) continue;
          const n = key === "height" ? parseHeightInput(text) : Number(text.replace(/[^\d.-]/g, ""));
          if (n == null || !Number.isFinite(n) || n <= 0) bad.push(`${col} "${text}"`);
          else values.push({ key, value: n });
        }
        return {
          index: i + 2,
          name,
          gradYear,
          values,
          bad,
          candidates,
          athleteId: candidates.length === 1 ? candidates[0]!.id : "",
        };
      }),
    );
  }

  const counts = useMemo(() => {
    const r = rows ?? [];
    const ready = r.filter((x) => x.athleteId && x.values.length);
    return {
      ready: ready.length,
      numbers: ready.reduce((s, x) => s + x.values.length, 0),
      unmatched: r.filter((x) => !x.candidates.length).length,
      ambiguous: r.filter((x) => x.candidates.length > 1 && !x.athleteId).length,
    };
  }, [rows]);

  async function commit() {
    if (!rows) return;
    setSaving(true);
    try {
      const entries = rows
        .filter((r) => r.athleteId)
        .flatMap((r) => r.values.map((v) => ({ athleteId: r.athleteId, metricKey: v.key, value: v.value })));
      const res = await importFn({ data: { entries, recordedOn, eventName, source } });
      await queryClient.invalidateQueries();
      if (res.failures.length) toast.error(`Some numbers failed: ${res.failures[0]}`);
      toast.success(`Saved ${res.saved} verified numbers`);
      if (!res.failures.length) navigate({ to: "/roster" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const shown = (rows ?? []).filter((r) => filter === "all" || !r.athleteId || r.bad.length);

  return (
    <AppShell right={<AuthButton />}>
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary">
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>
      <div className="mt-4 max-w-5xl">
        <h1 className="font-display text-3xl font-bold text-graphite">Testing day</h1>
        <p className="mt-1 text-sm text-steel">
          Load a whole combine sheet at once. Numbers you import are saved as green "Coach verified". Nothing is saved until you confirm.
        </p>

        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-graphite">Upload</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="font-mono text-[11px] text-steel uppercase">Date tested</span>
              <input type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} className={`mt-1 w-full ${FIELD_CLASS}`} />
            </label>
            <label className="text-sm">
              <span className="font-mono text-[11px] text-steel uppercase">Event</span>
              <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Fall combine" className={`mt-1 w-full ${FIELD_CLASS}`} />
            </label>
            <label className="text-sm">
              <span className="font-mono text-[11px] text-steel uppercase">Tested by</span>
              <select value={source} onChange={(e) => setSource(e.target.value as MetricSource)} className={`mt-1 w-full ${FIELD_CLASS}`}>
                {Object.entries(METRIC_SOURCE_LABEL)
                  .filter(([k]) => k !== "manual")
                  .map(([k, label]) => (
                    <option key={k} value={k}>{k === "other" ? "Our staff / other" : label}</option>
                  ))}
              </select>
            </label>
          </div>
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border bg-chalk px-4 py-3 text-sm font-semibold text-graphite">
            <Upload className="size-4" aria-hidden /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </label>
          {headers.length ? <p className="mt-2 font-mono text-xs text-steel">{raw.length} row(s)</p> : null}
          {error ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-seam-red/30 bg-seam-red-tint p-3 text-sm text-seam-red">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          ) : null}
        </section>

        {headers.length ? (
          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-bold text-graphite">Columns</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[["Player name *", nameCol, setNameCol], ["Grad year", yearCol, setYearCol]].map(([label, value, set]) => (
                <label key={label as string} className="text-sm">
                  <span className="font-mono text-[11px] text-steel uppercase">{label as string}</span>
                  <select value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className={`mt-1 w-full ${FIELD_CLASS}`}>
                    <option value="">— none —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {headers.filter((h) => h !== nameCol && h !== yearCol).map((h) => (
                <label key={h} className="text-sm">
                  <span className="font-mono text-[11px] text-steel uppercase">{h}</span>
                  <select
                    value={metricCols[h] ?? ""}
                    onChange={(e) => setMetricCols((p) => ({ ...p, [h]: e.target.value }))}
                    className={`mt-1 w-full ${FIELD_CLASS}`}
                  >
                    <option value="">— ignore —</option>
                    {METRIC_DEFS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} ({m.unit}){m.sports.length === 1 ? ` · ${m.sports[0]}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" disabled={!nameCol} onClick={preview} className="touch-target mt-4 rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground disabled:opacity-60">
              Match players
            </button>
          </section>
        ) : null}

        {rows ? (
          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-bold text-graphite">Review</h2>
            <p className="mt-1 font-mono text-xs text-steel">
              {counts.ready} players ready · {counts.numbers} numbers · {counts.ambiguous} need a pick · {counts.unmatched} not on roster
            </p>
            <div className="mt-3 flex gap-2">
              {(["all", "problem"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${filter === f ? "border-org-primary bg-org-primary text-org-primary-foreground" : "border-border text-steel"}`}>
                  {f === "all" ? "All" : "Problems"}
                </button>
              ))}
            </div>
            <div className="mt-4 max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-chalk font-mono text-[11px] text-steel uppercase">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Sheet name</th><th className="px-3 py-2">Roster match</th><th className="px-3 py-2">Numbers</th></tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.index} className={`border-t border-border/70 ${!r.athleteId ? "bg-seam-red-tint" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs text-steel">{r.index}</td>
                      <td className="px-3 py-2 font-semibold text-graphite">{r.name || "—"}{r.gradYear ? ` · ${r.gradYear}` : ""}</td>
                      <td className="px-3 py-2">
                        <select
                          value={r.athleteId}
                          onChange={(e) => setRows((p) => (p ?? []).map((x) => (x.index === r.index ? { ...x, athleteId: e.target.value } : x)))}
                          className={FIELD_CLASS}
                        >
                          <option value="">{r.candidates.length ? "— pick —" : "— skip —"}</option>
                          {(r.candidates.length ? r.candidates : athletes).map((a) => (
                            <option key={a.id} value={a.id}>{a.name}{a.gradYear ? ` · ${a.gradYear}` : ""}{a.position ? ` · ${a.position}` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-diamond-green">{r.values.length} number(s)</span>
                        {r.bad.length ? <span className="ml-2 text-seam-red">unreadable: {r.bad.join(", ")}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" disabled={saving || !counts.numbers} onClick={() => void commit()} className="touch-target mt-5 rounded-xl bg-seam-red px-5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : `Save ${counts.numbers} numbers for ${counts.ready} players`}
            </button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
