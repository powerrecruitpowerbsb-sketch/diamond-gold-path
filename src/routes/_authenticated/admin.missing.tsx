import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Download, Save, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { clearResolvedDiscoveries, countMissingData, listMissingData } from "@/lib/gaps.functions";
import { fixProgramLink } from "@/lib/operations.functions";
import { setCoachManually } from "@/lib/pipeline.functions";
import { runProgramIngest } from "@/lib/ingest.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader, num } from "@/components/console/PageHeader";
import { titleCase } from "@/lib/admin-schemas";

export const Route = createFileRoute("/_authenticated/admin/missing")({
  head: () => ({
    meta: [
      { title: "Missing roster & coach pages — Curve Recruit" },
      {
        name: "description",
        content:
          "Every college team missing a roster page, coaching staff page, or head coach, with one-click fixes.",
      },
      { property: "og:title", content: "Missing roster & coach pages — Curve Recruit" },
      {
        property: "og:description",
        content: "Staff alert list for teams with a missing roster page, staff page, or head coach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MissingData,
});

const GAPS = [
  { key: "any", label: "Anything missing" },
  { key: "roster", label: "No roster page" },
  { key: "staff", label: "No coaching staff page" },
  { key: "coach", label: "No head coach" },
  { key: "site", label: "No athletics site" },
] as const;

function MissingData() {
  const countFn = useServerFn(countMissingData);
  const listFn = useServerFn(listMissingData);
  const clearFn = useServerFn(clearResolvedDiscoveries);

  const [gap, setGap] = useState<string>("any");
  const [sport, setSport] = useState("");
  const [search, setSearch] = useState("");
  const [clearing, setClearing] = useState(false);

  const counts = useQuery({
    queryKey: ["missing-counts"],
    queryFn: () => countFn(),
    staleTime: 60_000,
  });

  const list = useQuery({
    queryKey: ["missing-rows", gap, sport, search],
    queryFn: () => listFn({ data: { gap, sport, search } }),
    staleTime: 30_000,
  });

  const c = (counts.data ?? {}) as Record<string, number>;
  const waiting = (c.roster ?? 0) + (c.staff ?? 0) + (c.coach ?? 0) + (c.site ?? 0);
  const rows = ((list.data as any)?.rows ?? []) as any[];
  const total = ((list.data as any)?.total ?? 0) as number;

  async function clearStale() {
    setClearing(true);
    try {
      const result = (await clearFn({ data: { apply: true } })) as any;
      toast.success(
        result.resolved
          ? `Cleared ${result.resolved} old alerts whose address is already saved.`
          : "Nothing left to clear — every old alert is genuine.",
      );
      await Promise.all([counts.refetch(), list.refetch()]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not clear those alerts");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Missing roster & coach pages"
        description="Teams we cannot read because an address or a coach name is missing. Fix one here and it drops off the list straight away."
        counts={[
          `${num(waiting)} gaps in total`,
          `${num(c.roster)} without a roster page`,
          `${num(c.coach)} without a head coach`,
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => void clearStale()}
            disabled={clearing}
            className="touch-target"
          >
            <Sparkles className="size-4" aria-hidden />
            {clearing ? "Clearing…" : "Clear already-fixed alerts"}
          </Button>
        }
      />

      {waiting > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded border border-seam-red/40 bg-seam-red-tint p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-seam-red" aria-hidden />
          <p className="text-sm text-graphite">
            <span className="font-semibold">{num(waiting)} teams need something from you.</span>{" "}
            {num(c.roster)} have no roster page, {num(c.staff)} have no coaching staff page,{" "}
            {num(c.coach)} have no head coach on file and {num(c.site)} have no athletics site. Paste
            the address or type the coach in on the row and we check it opens before saving.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Narrow by school, state or conference"
            aria-label="Narrow by school, state or conference"
            className="pl-9"
          />
        </div>
        <select
          aria-label="What's missing"
          value={gap}
          onChange={(event) => setGap(event.target.value)}
          className="h-10 rounded border border-input bg-background px-2.5 text-sm"
        >
          {GAPS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sport"
          value={sport}
          onChange={(event) => setSport(event.target.value)}
          className="h-10 rounded border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Sport: any</option>
          <option value="baseball">Baseball</option>
          <option value="softball">Softball</option>
        </select>
      </div>

      {list.isPending ? (
        <p className="py-8 text-sm text-steel">Loading the teams with something missing…</p>
      ) : list.isError ? (
        <div className="rounded border border-border bg-card p-5">
          <p className="text-sm font-semibold text-graphite">We couldn't load the list.</p>
          <p className="mt-1 text-sm text-steel">
            {list.error instanceof Error ? list.error.message : "Unknown problem"}
          </p>
          <Button className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-sm text-steel">
          Nothing missing here — every team matching these filters has its addresses and coach on file.
        </p>
      ) : (
        <>
          <p className="meta tabular mb-2">
            Showing {num(rows.length)} of {num(total)}
          </p>
          <ul className="divide-y divide-border rounded border border-border bg-card">
            {rows.map((row) => (
              <GapRow
                key={row.id}
                row={row}
                onChanged={async () => {
                  await Promise.all([counts.refetch(), list.refetch()]);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function GapRow({ row, onChanged }: { row: any; onChanged: () => Promise<void> }) {
  const saveLink = useServerFn(fixProgramLink);
  const saveCoach = useServerFn(setCoachManually);
  const readNow = useServerFn(runProgramIngest);

  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [coach, setCoach] = useState("");

  const missing: { field: string; label: string }[] = [];
  if (!row.athleticWebsite) missing.push({ field: "athletic_website", label: "Athletics site" });
  if (!row.rosterUrl) missing.push({ field: "roster_url", label: "Roster page" });
  if (!row.coachingStaffUrl)
    missing.push({ field: "coaching_staff_url", label: "Coaching staff page" });

  async function submitLink(field: string, label: string) {
    const url = (drafts[field] ?? "").trim();
    if (!url) {
      toast.error(`Paste the ${label.toLowerCase()} address first.`);
      return;
    }
    setBusy(field);
    try {
      const result = (await saveLink({ data: { programId: row.id, field, url } })) as any;
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${label} saved for ${row.school}.`);
      setDrafts((current) => ({ ...current, [field]: "" }));
      await onChanged();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that address");
    } finally {
      setBusy(null);
    }
  }

  async function submitCoach() {
    if (!coach.trim()) {
      toast.error("Type the coach's name first.");
      return;
    }
    setBusy("coach");
    try {
      const result = (await saveCoach({ data: { programId: row.id, name: coach.trim() } })) as any;
      toast.success(`Head coach set to ${result?.name ?? coach.trim()}.`);
      setCoach("");
      await onChanged();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that coach");
    } finally {
      setBusy(null);
    }
  }

  async function scrapeNow() {
    setBusy("read");
    try {
      await readNow({ data: { programId: row.id } });
      toast.success(`Read ${row.school} — anything new is in the review queue.`);
      await onChanged();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not read that team");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-graphite">
          <Link
            to="/admin/programs/$id"
            params={{ id: row.id }}
            className="text-org-primary underline-offset-2 hover:underline"
          >
            {row.school}
          </Link>
          <span className="meta">
            {" "}
            · {titleCase(row.sport)}
            {row.state ? ` · ${row.state}` : ""}
            {row.level ? ` · ${row.level}` : ""}
            {row.conference ? ` · ${row.conference}` : ""}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {missing.map((gap) => (
            <span
              key={gap.field}
              className="rounded-md bg-seam-red-tint px-1.5 py-0.5 text-[11px] font-semibold text-seam-red"
            >
              Missing {gap.label.toLowerCase()}
            </span>
          ))}
          {!row.headCoachName ? (
            <span className="rounded-md bg-seam-red-tint px-1.5 py-0.5 text-[11px] font-semibold text-seam-red">
              Missing head coach
            </span>
          ) : null}
        </div>
      </div>

      {missing.map((gap) => (
        <div key={gap.field} className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={drafts[gap.field] ?? ""}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [gap.field]: event.target.value }))
            }
            placeholder={`https://… ${gap.label.toLowerCase()}`}
            aria-label={`${gap.label} for ${row.school}`}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-graphite"
          />
          <button
            type="button"
            onClick={() => void submitLink(gap.field, gap.label)}
            disabled={busy === gap.field}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
          >
            <Save className="size-4" aria-hidden />
            {busy === gap.field ? "Checking…" : "Check & save"}
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {!row.headCoachName ? (
          <>
            <input
              value={coach}
              onChange={(event) => setCoach(event.target.value)}
              placeholder="Head coach's name"
              aria-label={`Head coach for ${row.school}`}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-graphite"
            />
            <button
              type="button"
              onClick={() => void submitCoach()}
              disabled={busy === "coach"}
              className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
            >
              <Save className="size-4" aria-hidden />
              {busy === "coach" ? "Saving…" : "Save coach"}
            </button>
          </>
        ) : (
          <p className="meta flex-1">
            Head coach on file: <span className="font-semibold text-graphite">{row.headCoachName}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => void scrapeNow()}
          disabled={busy === "read"}
          className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-graphite disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden />
          {busy === "read" ? "Reading…" : "Read this team now"}
        </button>
      </div>
    </li>
  );
}
