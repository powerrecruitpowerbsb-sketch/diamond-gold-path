import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Radar, Upload } from "lucide-react";
import { toast } from "sonner";

import { parseCsv, findHeader } from "@/lib/csv";
import { GOVERNING_BODIES } from "@/lib/admin-schemas";
import { importSeedRows, previewSeedRows, type RawSeedRow } from "@/lib/seed-import.functions";
import { runUrlDiscoveryBatch } from "@/lib/discovery.functions";
import { SectionCard } from "@/components/admin/form-kit";

export const Route = createFileRoute("/_authenticated/admin/seed-import")({
  head: () => ({
    meta: [
      { title: "Bulk import programs — Power Recruit" },
      {
        name: "description",
        content:
          "Seed school and program skeleton records in bulk from a CSV, then hand them to URL discovery.",
      },
      { property: "og:title", content: "Bulk import programs — Power Recruit" },
      {
        property: "og:description",
        content: "Upload a CSV of schools and sports to create program skeletons in one pass.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeedImport,
});

const COLUMNS = [
  { key: "universityName", label: "School name", hints: ["university_name", "school", "university", "name"] },
  { key: "state", label: "State", hints: ["state", "st"] },
  { key: "sport", label: "Sport", hints: ["sport"] },
  { key: "governingBody", label: "Governing body", hints: ["governing_body", "governing", "association", "body"] },
  { key: "division", label: "Division", hints: ["division", "div"] },
  { key: "conference", label: "Conference", hints: ["conference", "league"] },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

type PreviewRow = RawSeedRow & {
  errors: string[];
  schoolAction: "new" | "existing";
  programAction: "create" | "update";
  matchedSchoolName: string | null;
};

type ImportResult = {
  schoolsCreated: number;
  programsCreated: number;
  programsUpdated: number;
  imported: number;
  skipped: { index: number; label: string; reason: string }[];
  universityIds: string[];
};

const TEMPLATE = `university_name,state,sport,governing_body,division,conference
Coastal Carolina University,SC,baseball,NCAA,D1,Sun Belt`;

function SeedImport() {
  const previewFn = useServerFn(previewSeedRows);
  const importFn = useServerFn(importSeedRows);
  const discoverFn = useServerFn(runUrlDiscoveryBatch);
  const queryClient = useQueryClient();

  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<ColumnKey, string>>({
    universityName: "",
    state: "",
    sport: "",
    governingBody: "",
    division: "",
    conference: "",
  });
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const rows = useMemo<RawSeedRow[]>(() => {
    const columnIndex = (key: ColumnKey) => headers.indexOf(mapping[key]);
    return rawRows.map((cells, index) => {
      const read = (key: ColumnKey) => {
        const i = columnIndex(key);
        return i >= 0 ? String(cells[i] ?? "").trim() : "";
      };
      return {
        index,
        universityName: read("universityName"),
        state: read("state"),
        sport: read("sport"),
        governingBody: read("governingBody"),
        division: read("division"),
        conference: read("conference"),
      };
    });
  }, [rawRows, headers, mapping]);

  async function onFile(file: File | null) {
    setPreview(null);
    setResult(null);
    setFileError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setFileError("That file isn't a .csv — export your list as CSV and try again.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setFileError("That CSV has no data rows.");
      return;
    }
    const head = (parsed[0] ?? []).map((h) => h.trim());
    setHeaders(head);
    setRawRows(parsed.slice(1));
    setMapping({
      universityName: findHeader(head, [...COLUMNS[0].hints]),
      state: findHeader(head, [...COLUMNS[1].hints]),
      sport: findHeader(head, [...COLUMNS[2].hints]),
      governingBody: findHeader(head, [...COLUMNS[3].hints]),
      division: findHeader(head, [...COLUMNS[4].hints]),
      conference: findHeader(head, [...COLUMNS[5].hints]),
    });
  }

  async function onPreview() {
    setBusy(true);
    try {
      const data = (await previewFn({ data: { rows } })) as PreviewRow[];
      setPreview(data);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not build the preview");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const data = (await importFn({ data: { rows } })) as ImportResult;
      setResult(data);
      setPreview(null);
      await queryClient.invalidateQueries();
      toast.success(
        `Imported ${data.imported} row${data.imported === 1 ? "" : "s"} — ${data.schoolsCreated} new school(s)`,
      );
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscover() {
    if (!result?.universityIds.length) return;
    setDiscovering(true);
    try {
      const outcomes = (await discoverFn({
        data: { universityIds: result.universityIds },
      })) as { universityName: string; queued: number; errorMessage: string | null }[];
      const failures = outcomes.filter((o) => o.errorMessage).length;
      const queued = outcomes.reduce((sum, o) => sum + o.queued, 0);
      toast.success(
        `Queued ${queued} link${queued === 1 ? "" : "s"} for review${failures ? ` · ${failures} school(s) had trouble` : ""}`,
      );
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  const badRows = (preview ?? []).filter((row) => row.errors.length).length;
  const okRows = (preview ?? []).length - badRows;

  return (
    <div className="grid gap-5">
      <SectionCard
        title="Bulk import programs"
        blurb="One row per school + sport. Schools appearing twice (baseball and softball) share one school record."
      >
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-steel uppercase">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
              className="touch-target rounded-lg border border-border bg-card px-3 text-sm"
            />
          </label>

          <p className="meta">
            Columns: university_name, state, sport, governing_body ({GOVERNING_BODIES.join(" / ")}),
            division (free text), conference.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-steel">
            {TEMPLATE}
          </pre>

          {fileError ? (
            <p className="flex items-center gap-2 text-sm text-seam-red">
              <AlertTriangle className="size-4" aria-hidden /> {fileError}
            </p>
          ) : null}

          {headers.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {COLUMNS.map((column) => (
                <label key={column.key} className="grid gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-steel uppercase">
                    {column.label}
                  </span>
                  <select
                    value={mapping[column.key]}
                    onChange={(event) =>
                      setMapping((m) => ({ ...m, [column.key]: event.target.value }))
                    }
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— not in file —</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          {rawRows.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onPreview}
                disabled={busy}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
              >
                <Upload className="size-4" aria-hidden />
                {busy ? "Working…" : `Preview ${rawRows.length} row${rawRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {preview ? (
        <SectionCard
          title="Preview"
          blurb={`${okRows} row(s) ready${badRows ? ` · ${badRows} row(s) will be skipped` : ""}`}
          aside={
            okRows ? (
              <button
                type="button"
                onClick={onImport}
                disabled={busy}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Importing…" : `Import ${okRows} row(s)`}
              </button>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-steel uppercase">
                  <th className="py-2 pr-3">School</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Sport</th>
                  <th className="py-2 pr-3">Body / division</th>
                  <th className="py-2 pr-3">Conference</th>
                  <th className="py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.index} className="border-t border-border align-top">
                    <td className="py-2 pr-3 font-semibold text-graphite">{row.universityName || "—"}</td>
                    <td className="py-2 pr-3 tabular">{row.state || "—"}</td>
                    <td className="py-2 pr-3">{row.sport || "—"}</td>
                    <td className="py-2 pr-3">
                      {[row.governingBody, row.division].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-2 pr-3">{row.conference || "—"}</td>
                    <td className="py-2">
                      {row.errors.length ? (
                        <span className="text-seam-red">Skipped — {row.errors.join("; ")}</span>
                      ) : (
                        <span className="text-steel">
                          {row.schoolAction === "new" ? "New school" : "Existing school"}
                          {row.matchedSchoolName && row.schoolAction === "existing"
                            ? ` (${row.matchedSchoolName})`
                            : ""}{" "}
                          ·{" "}
                          {row.programAction === "create" ? "new program" : "updates existing program"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {result ? (
        <SectionCard
          title="Import complete"
          blurb={`${result.schoolsCreated} school(s) created · ${result.programsCreated} program(s) created · ${result.programsUpdated} program(s) updated`}
          aside={
            result.universityIds.length ? (
              <button
                type="button"
                onClick={onDiscover}
                disabled={discovering}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
              >
                <Radar className="size-4" aria-hidden />
                {discovering
                  ? "Finding links…"
                  : `Find links for ${result.universityIds.length} school(s)`}
              </button>
            ) : null
          }
        >
          {result.skipped.length ? (
            <ul className="grid gap-1.5 text-sm">
              {result.skipped.map((row) => (
                <li key={row.index} className="text-seam-red">
                  Row {row.index + 1} — {row.label}: {row.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-steel">Every row imported cleanly.</p>
          )}
          <p className="mt-4 text-sm text-steel">
            Discovered links wait for your confirmation in the{" "}
            <Link to="/admin/discovery" className="font-semibold text-org-primary underline">
              discovered links queue
            </Link>
            .
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
