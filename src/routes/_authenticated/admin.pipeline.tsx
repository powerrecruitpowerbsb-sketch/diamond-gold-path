import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Database, Download, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import {
  getPipelineStatus,
  importNcaaSlice,
  listFederalBlocked,
  listFederalCandidates,
  rebuildQueue,
  resolveFederalMatch,
  runFederalBatch,
} from "@/lib/pipeline.functions";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({
  head: () => ({
    meta: [
      { title: "Collection pipeline — Power Recruit" },
      {
        name: "description",
        content:
          "Build the national program list from governing-body directories, then enrich every school with federal data.",
      },
      { property: "og:title", content: "Collection pipeline — Power Recruit" },
      {
        property: "og:description",
        content: "Automated collection: governing-body membership lists, federal school facts, and scrape coverage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pipeline,
});

const NCAA_SLICES = [
  { division: "I", sport: "baseball", label: "D1 baseball" },
  { division: "I", sport: "softball", label: "D1 softball" },
  { division: "II", sport: "baseball", label: "D2 baseball" },
  { division: "II", sport: "softball", label: "D2 softball" },
  { division: "III", sport: "baseball", label: "D3 baseball" },
  { division: "III", sport: "softball", label: "D3 softball" },
] as const;

const STAGE_LABELS: Record<string, string> = {
  federal_data: "School facts (federal data)",
  url_discovery: "Find athletics links",
  program_scrape: "Coaches & roster scrape",
};

function Pipeline() {
  const statusFn = useServerFn(getPipelineStatus);
  const importFn = useServerFn(importNcaaSlice);
  const federalFn = useServerFn(runFederalBatch);
  const rebuildFn = useServerFn(rebuildQueue);
  const blockedFn = useServerFn(listFederalBlocked);
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const { data: status } = useQuery({ queryKey: ["pipeline-status"], queryFn: () => statusFn() });
  const { data: blocked } = useQuery({ queryKey: ["federal-blocked"], queryFn: () => blockedFn() });

  function note(line: string) {
    setLog((current) => [line, ...current].slice(0, 12));
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-blocked"] });
  }

  /** Walk one slice in windows until the whole division/sport list is loaded. */
  async function importSliceFully(division: string, sport: string, label: string) {
    let offset = 0;
    let schoolsCreated = 0;
    let programsCreated = 0;
    let programsUpdated = 0;
    let total = 0;
    for (let guard = 0; guard < 40; guard += 1) {
      const result = (await importFn({ data: { division, sport, offset, limit: 60 } })) as any;
      schoolsCreated += result.schoolsCreated;
      programsCreated += result.programsCreated;
      programsUpdated += result.programsUpdated;
      total = result.total;
      offset = result.nextOffset;
      note(`${label}: ${offset}/${total} processed…`);
      if (result.done) break;
    }
    note(
      `${label}: ${total} listed · ${schoolsCreated} new schools · ${programsCreated} new programs · ${programsUpdated} updated`,
    );
    return { total, schoolsCreated, programsCreated, programsUpdated };
  }

  async function onImportSlice(division: string, sport: string, label: string) {
    setBusy(label);
    try {
      await importSliceFully(division, sport, label);
      toast.success(`${label} imported`);
      await refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  /** The whole NCAA universe, unattended. */
  async function onImportAllNcaa() {
    setBusy("all-ncaa");
    try {
      for (const slice of NCAA_SLICES) {
        await importSliceFully(slice.division, slice.sport, slice.label);
      }
      toast.success("Full NCAA membership list imported");
      await refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }


  async function onFederalBatch(limit: number) {
    setBusy("federal");
    try {
      const result = (await federalFn({ data: { limit } })) as any;
      note(
        `Federal data: ${result.processed} school(s) · ${result.fieldsApplied} field(s) filled · ${result.fieldsQueued} queued for review · ${result.needsHelp} need your help`,
      );
      if (result.rateLimitHit) {
        note("Stopped early: the federal data service is rate limiting us. Add an api.data.gov key.");
        toast.warning("Paused — federal data rate limit reached");
      } else {
        toast.success(`${result.processed} school(s) processed`);
      }
      await refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Federal sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRebuild() {
    setBusy("rebuild");
    try {
      const result = (await rebuildFn()) as Record<string, number>;
      const total = Object.values(result).reduce((sum, n) => sum + n, 0);
      note(`Queue refreshed: ${total} new job(s) added`);
      toast.success(total ? `${total} job(s) queued` : "Queue already up to date");
      await refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not refresh the queue");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <SectionCard
        title="Coverage"
        blurb="Where the national database stands right now."
        aside={
          <button
            type="button"
            onClick={onRebuild}
            disabled={busy !== null}
            className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
          >
            <RefreshCw className="size-4" aria-hidden />
            {busy === "rebuild" ? "Refreshing…" : "Refresh job list"}
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<Building2 className="size-4" aria-hidden />}
            label="Schools"
            value={status?.schools.total ?? 0}
            hint={`${status?.schools.federalConfirmed ?? 0} matched to federal data`}
          />
          <Stat
            icon={<Database className="size-4" aria-hidden />}
            label="Programs"
            value={status?.programs.total ?? 0}
            hint={`${status?.programs.baseball ?? 0} baseball · ${status?.programs.softball ?? 0} softball`}
          />
          <Stat
            icon={<Landmark className="size-4" aria-hidden />}
            label="Cost & academics filled"
            value={status?.schools.withCost ?? 0}
            hint={`${status?.schools.federalNeedsHelp ?? 0} school(s) need a match decision`}
          />
          <Stat
            icon={<Download className="size-4" aria-hidden />}
            label="Roster pages found"
            value={status?.programs.withRosterUrl ?? 0}
            hint={`${status?.programs.withCoach ?? 0} program(s) have a head coach`}
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-steel uppercase">
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Waiting</th>
                <th className="py-2 pr-3">Running</th>
                <th className="py-2 pr-3">Done</th>
                <th className="py-2 pr-3">Retrying</th>
                <th className="py-2">Needs you</th>
              </tr>
            </thead>
            <tbody>
              {(status?.coverage ?? []).map((row) => (
                <tr key={row.stage} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold text-graphite">
                    {STAGE_LABELS[row.stage] ?? row.stage}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.pending}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.running}</td>
                  <td className="py-2 pr-3 tabular-nums text-diamond-green">{row.done}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.failed}</td>
                  <td className="py-2 tabular-nums text-seam-red">{row.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Step 1 — Pull the NCAA membership list"
        blurb="The NCAA publishes exactly which schools sponsor baseball and softball, with state, division and conference. Nothing to upload: pull a slice and it becomes verified programs."
      >
        <div className="flex flex-wrap gap-2">
          {NCAA_SLICES.map((slice) => (
            <button
              key={slice.label}
              type="button"
              onClick={() => onImportSlice(slice.division, slice.sport, slice.label)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="size-4" aria-hidden />
              {busy === slice.label ? "Pulling…" : slice.label}
            </button>
          ))}
        </div>
        <p className="meta mt-3">
          NAIA, NJCAA, CCCAA and NWAC block plain requests, so those directories come through the
          scraper instead — next step after NCAA is covered.
        </p>
      </SectionCard>

      <SectionCard
        title="Step 2 — Federal school facts"
        blurb="Tuition, enrollment, acceptance rate, SAT/ACT, graduation rate and campus setting come from the U.S. Department of Education, not from a model. Empty fields fill immediately; anything that would overwrite an existing value goes to the review queue."
        aside={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFederalBatch(10)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              {busy === "federal" ? "Working…" : "Run 10"}
            </button>
            <button
              type="button"
              onClick={() => onFederalBatch(50)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "federal" ? "Working…" : "Run 50"}
            </button>
          </div>
        }
      >
        {status?.usingDemoKey ? (
          <p className="rounded-lg border border-warm-gold/40 bg-warm-gold/10 p-3 text-sm text-graphite">
            Running on the shared demo access to the federal data service, which allows roughly 30
            schools per hour. A free api.data.gov key raises that to 1,000 per hour — worth adding
            before the full national pass.
          </p>
        ) : null}
        {blocked?.length ? (
          <div className="mt-4 grid gap-2">
            <p className="text-sm font-semibold text-graphite">
              {blocked.length} school(s) need a match decision
            </p>
            {blocked.slice(0, 25).map((school) => (
              <MatchResolver
                key={school.id}
                school={school}
                onResolved={async (message) => {
                  note(message);
                  await refresh();
                }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-steel">No unresolved federal matches.</p>
        )}
      </SectionCard>

      {log.length ? (
        <SectionCard title="Recent activity" blurb="What the last few runs did.">
          <ul className="grid gap-1.5 text-sm text-steel">
            {log.map((line, index) => (
              <li key={`${line}-${index}`} className="font-mono text-xs">
                {line}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-steel uppercase">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-graphite">{value}</p>
      <p className="meta mt-1">{hint}</p>
    </div>
  );
}

type BlockedSchool = { id: string; name: string; state: string | null; city: string | null; federal_match_status: string };

function MatchResolver({
  school,
  onResolved,
}: {
  school: BlockedSchool;
  onResolved: (message: string) => Promise<void>;
}) {
  const candidatesFn = useServerFn(listFederalCandidates);
  const resolveFn = useServerFn(resolveFederalMatch);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(searchTerm: string) {
    setBusy(true);
    try {
      const rows = (await candidatesFn({
        data: { universityId: school.id, query: searchTerm },
      })) as any[];
      setCandidates(rows);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not load candidates");
    } finally {
      setBusy(false);
    }
  }

  async function pick(unitid: number, name: string) {
    setBusy(true);
    try {
      const outcome = (await resolveFn({ data: { universityId: school.id, unitid } })) as any;
      toast.success(`${school.name} matched to ${name}`);
      await onResolved(
        `${school.name} → ${name}: ${outcome.fieldsApplied} field(s) filled, ${outcome.fieldsQueued} queued`,
      );
      setOpen(false);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save the match");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-graphite">{school.name}</p>
          <p className="meta">
            {[school.city, school.state].filter(Boolean).join(", ") || "Location unknown"} ·{" "}
            {school.federal_match_status === "unmatched"
              ? "no federal record found"
              : "several possible records"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            if (!candidates) void load("");
          }}
          className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel"
        >
          {open ? "Close" : "Choose record"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search federal records by name"
              className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void load(query)}
              disabled={busy}
              className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
            >
              Search
            </button>
          </div>
          {busy ? <p className="meta">Looking…</p> : null}
          {candidates?.length ? (
            <ul className="grid gap-1.5">
              {candidates.map((candidate) => (
                <li
                  key={candidate.unitid}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                >
                  <span className="text-sm text-graphite">
                    {candidate.name}
                    <span className="meta ml-2">
                      {[candidate.city, candidate.state].filter(Boolean).join(", ")}
                      {candidate.enrollment ? ` · ${candidate.enrollment.toLocaleString()} undergrads` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void pick(candidate.unitid, candidate.name)}
                    disabled={busy}
                    className="touch-target rounded-md bg-diamond-green px-3 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    This one
                  </button>
                </li>
              ))}
            </ul>
          ) : candidates ? (
            <p className="meta">No federal records matched. Try a shorter name.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
