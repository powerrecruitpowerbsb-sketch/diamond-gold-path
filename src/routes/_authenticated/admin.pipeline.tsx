import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Database, Download, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CollectionRunner } from "@/components/admin/CollectionRunner";
import { SectionCard } from "@/components/admin/form-kit";
import {
  getPipelineStatus,
  importNcaaSlice,
  importWikiSlice,
  listFederalBlocked,
  listFederalParked,
  listNonSchoolEntries,
  rebuildQueue,
  removeNonSchoolEntry,
  requeueRejected,
  retryFederalUnresolved,
  runDirectorySweep,
  runDueRefreshes,

  runFederalBatch,
  unparkAllFederalSchools,
  unparkFederalSchool,
} from "@/lib/pipeline.functions";


export const Route = createFileRoute("/_authenticated/admin/pipeline")({
  head: () => ({
    meta: [
      { title: "Data collection — Power Recruit" },
      {
        name: "description",
        content:
          "Build the national program list from governing-body directories, then enrich every school with federal data.",
      },
      { property: "og:title", content: "Data collection — Power Recruit" },
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

/** Keys must match WIKI_SLICES on the server. */
const OTHER_SLICES = [
  { key: "naia", label: "NAIA" },
  { key: "njcaa-d1", label: "NJCAA D1" },
  { key: "njcaa-d2", label: "NJCAA D2" },
  { key: "njcaa-d3", label: "NJCAA D3" },
  { key: "cccaa", label: "CCCAA (California)" },
  { key: "nwac", label: "NWAC (Northwest)" },
] as const;

/**
 * Database and network errors are unreadable for a human, so only sentences we
 * wrote ourselves are shown; anything else becomes the plain-English fallback.
 */
function friendly(failure: unknown, fallback: string): string {
  const message = failure instanceof Error ? failure.message.trim() : "";
  const jargon =
    /constraint|relation |column |violates|duplicate key|PGRST|syntax error|permission denied|JWT|null value|invalid input|\bSQL\b|Forbidden/i;
  if (!message || message.length > 160 || jargon.test(message)) return fallback;
  return message;
}

const STAGE_LABELS: Record<string, string> = {
  federal_data: "School facts (federal data)",
  url_discovery: "Find athletics links",
  program_scrape: "Coaches & roster scrape",
};

function Pipeline() {
  const statusFn = useServerFn(getPipelineStatus);
  const importFn = useServerFn(importNcaaSlice);
  const wikiImportFn = useServerFn(importWikiSlice);
  const federalFn = useServerFn(runFederalBatch);
  const rebuildFn = useServerFn(rebuildQueue);
  const blockedFn = useServerFn(listFederalBlocked);
  const retryFn = useServerFn(retryFederalUnresolved);
  const sweepFn = useServerFn(runDirectorySweep);
  const parkedFn = useServerFn(listFederalParked);
  const unparkFn = useServerFn(unparkFederalSchool);
  const unparkAllFn = useServerFn(unparkAllFederalSchools);
  const nonSchoolsFn = useServerFn(listNonSchoolEntries);
  const removeNonSchoolFn = useServerFn(removeNonSchoolEntry);
  const requeueRejectedFn = useServerFn(requeueRejected);

  const onRequeueRejected = async () => {
    setBusy("requeue-rejected");
    try {
      const result = (await requeueRejectedFn({})) as {
        schoolsQueued: number;
        cappedSchools: number;
        programsQueued: number;
      };
      toast.success(
        `${result.schoolsQueued} school${result.schoolsQueued === 1 ? "" : "s"} and ${result.programsQueued} program${result.programsQueued === 1 ? "" : "s"} sent back for a fresh look`,
      );
      if (result.cappedSchools)
        toast.message(
          `${result.cappedSchools} school${result.cappedSchools === 1 ? "" : "s"} have been searched too many times — those need a link pasted in by hand.`,
        );
      await queryClient.invalidateQueries();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not queue them");
    } finally {
      setBusy(null);
    }
  };

  const queryClient = useQueryClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);


  const { data: status } = useQuery({ queryKey: ["pipeline-status"], queryFn: () => statusFn() });
  const { data: blocked } = useQuery({ queryKey: ["federal-blocked"], queryFn: () => blockedFn() });
  const { data: parked } = useQuery({ queryKey: ["federal-parked"], queryFn: () => parkedFn() });
  const { data: nonSchools } = useQuery({
    queryKey: ["non-school-entries"],
    queryFn: () => nonSchoolsFn(),
  });

  function note(line: string) {
    setLog((current) => [line, ...current].slice(0, 12));
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-blocked"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-parked"] });
    await queryClient.invalidateQueries({ queryKey: ["non-school-entries"] });
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
      toast.error(friendly(failure, "Import failed"));
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
      toast.error(friendly(failure, "Import failed"));
    } finally {
      setBusy(null);
    }
  }

  /** Same windowed walk, for a non-NCAA membership list. */
  async function importWikiFully(key: string, label: string) {
    let offset = 0;
    let schoolsCreated = 0;
    let programsCreated = 0;
    let programsUpdated = 0;
    let total = 0;
    for (let guard = 0; guard < 40; guard += 1) {
      const result = (await wikiImportFn({ data: { slice: key, offset, limit: 60 } })) as any;
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
  }

  async function onImportWikiSlice(key: string, label: string) {
    setBusy(label);
    try {
      await importWikiFully(key, label);
      toast.success(`${label} imported`);
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Import failed"));
    } finally {
      setBusy(null);
    }
  }

  /** NAIA + NJCAA D1-D3 + CCCAA + NWAC in one unattended pass. */
  async function onImportAllOther() {
    setBusy("all-other");
    try {
      for (const slice of OTHER_SLICES) {
        await importWikiFully(slice.key, slice.label);
      }
      toast.success("NAIA, NJCAA, CCCAA and NWAC imported");
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Import failed"));
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
      toast.error(friendly(failure, "Federal sync failed"));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Work the school-facts queue batch after batch until it's empty. Keeps going
   * on its own so an interrupted pass can simply be restarted here, and stops
   * cleanly if the federal service starts rate limiting us.
   */
  async function onFederalUntilDone() {
    stopRef.current = false;
    setBusy("federal-all");
    let processed = 0;
    let confirmed = 0;
    let needsHelp = 0;
    try {
      for (let round = 0; round < 200; round += 1) {
        const result = (await federalFn({ data: { limit: 25 } })) as any;
        processed += result.processed;
        confirmed += result.confirmed;
        needsHelp += result.needsHelp;
        note(`School facts: ${processed} done so far · ${confirmed} matched · ${needsHelp} need help`);
        await refresh();
        if (result.rateLimitHit) {
          note("Paused: the federal data service is rate limiting us. Try again in a little while.");
          toast.warning("Paused — federal data rate limit reached");
          break;
        }
        if (!result.processed || stopRef.current) break;
      }
      toast.success(`${processed} school(s) processed`);
    } catch (failure) {
      toast.error(friendly(failure, "Federal sync failed"));
    } finally {
      stopRef.current = false;
      setBusy(null);
      await refresh();
    }
  }



  /**
   * Check the leftover schools against the whole federal list in one pass.
   * Preview writes nothing, so the first few matches can be eyed first.
   */
  async function onDirectorySweep(apply: boolean) {
    setBusy(apply ? "sweep-apply" : "sweep-preview");
    try {
      const result = (await sweepFn({ data: { apply, limit: 200 } })) as {
        examined: number;
        matched: number;
        applied: number;
        results: { schoolName: string; matchedName: string | null; status: string }[];
      };
      const samples = result.results
        .filter((row) => row.status === "confirmed")
        .slice(0, 5)
        .map((row) => `${row.schoolName} → ${row.matchedName}`);
      note(
        `Full-list check: ${result.examined} looked at · ${result.matched} found${apply ? ` · ${result.applied} filled in` : " (preview only)"}`,
      );
      for (const sample of samples) note(`  ${sample}`);
      toast.success(
        apply
          ? `${result.applied} school(s) filled in from the national list`
          : `${result.matched} of ${result.examined} school(s) can be matched`,
      );
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Could not check against the national list"));
    } finally {
      setBusy(null);
    }
  }

  async function onRetryUnresolved() {
    setBusy("retry-federal");
    try {
      const result = (await retryFn()) as { schools: number; reset: number };
      note(`Sent ${result.reset} unresolved school(s) back for another look`);
      toast.success(
        result.reset
          ? `${result.reset} school(s) queued to try again`
          : "Nothing left to retry",
      );
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Could not queue the retry"));
    } finally {
      setBusy(null);
    }
  }



  async function onUnpark(id: string, name: string) {
    setBusy(`unpark-${id}`);
    try {
      await unparkFn({ data: { universityId: id } });
      note(`${name}: back in line for another look`);
      toast.success(`${name} will be looked at again`);
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't put that school back in line"));
    } finally {
      setBusy(null);
    }
  }

  /** Drop one directory/index page that was imported as if it were a school. */
  async function onRemoveNonSchool(id: string, name: string) {
    setBusy(`remove-${id}`);
    try {
      await removeNonSchoolFn({ data: { universityId: id } });
      note(`Removed "${name}" — not a school`);
      toast.success(`Removed "${name}"`);
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't remove that entry"));
    } finally {
      setBusy(null);
    }
  }

  async function onUnparkAll() {
    setBusy("unpark-all");
    try {
      const result = (await unparkAllFn()) as { schools: number };
      note(`${result.schools} parked school(s) sent back for another look`);
      toast.success(
        result.schools ? `${result.schools} school(s) will be looked at again` : "Nothing parked",
      );
      await refresh();
    } catch (failure) {
      toast.error(friendly(failure, "Couldn't put those schools back in line"));
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
      toast.error(friendly(failure, "Could not refresh the queue"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <SectionCard
        title="What we have"
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

        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-steel">
            Show the work list behind these numbers
          </summary>
          <div className="mt-3 overflow-x-auto">
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
        </details>
      </SectionCard>

      <NeedsYou
        decisions={status?.schools.federalNeedsHelp ?? 0}
        notSchools={nonSchools?.entries?.length ?? 0}
      />

      <CollectionRunner />

      <details className="rounded-xl border border-border bg-white p-4">
        <summary className="cursor-pointer font-semibold text-graphite">
          Hands-on tools — pull lists, fill school facts, clean up
        </summary>
        <div className="mt-4 grid gap-5">

      <SectionCard
        title="Look again at everything you declined"
        blurb="From now on, declining a link or a value sends that school straight back for a fresh look. This catches up on everything declined before that was switched on."
        aside={
          <button
            type="button"
            onClick={onRequeueRejected}
            disabled={busy !== null}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw className="size-4" aria-hidden />
            {busy === "requeue-rejected" ? "Queueing…" : "Search these again"}
          </button>
        }
      >
        <p className="text-sm text-steel">
          The links you turned down are remembered, so the same wrong page can't come back as a
          suggestion.
        </p>
      </SectionCard>

      <SectionCard
        title="Step 1 — Pull the NCAA membership list"
        blurb="The NCAA publishes exactly which schools sponsor baseball and softball, with state, division and conference. Nothing to upload: pull the whole list and it becomes verified programs."
        aside={
          <button
            type="button"
            onClick={onImportAllNcaa}
            disabled={busy !== null}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden />
            {busy === "all-ncaa" ? "Importing all…" : "Import all NCAA"}
          </button>
        }
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
      </SectionCard>

      <SectionCard
        title="Step 1b — Pull the other governing bodies"
        blurb="NAIA, NJCAA, CCCAA and NWAC block automated access to their own sites, so their member lists come from maintained public directories. Those lists prove membership, not which sport each school sponsors, so the programs land unverified until the roster scrape confirms them."
        aside={
          <button
            type="button"
            onClick={onImportAllOther}
            disabled={busy !== null}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden />
            {busy === "all-other" ? "Importing all…" : "Import all others"}
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {OTHER_SLICES.map((slice) => (
            <button
              key={slice.key}
              type="button"
              onClick={() => onImportWikiSlice(slice.key, slice.label)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="size-4" aria-hidden />
              {busy === slice.label ? "Pulling…" : slice.label}
            </button>
          ))}
        </div>
      </SectionCard>


      <SectionCard
        title="Step 2 — Federal school facts"
        blurb="Tuition, enrollment, acceptance rate, SAT/ACT, graduation rate and campus setting come from the U.S. Department of Education, not from a model. Empty fields fill immediately; anything that would overwrite an existing value goes to the review queue."
        aside={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onDirectorySweep(false)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              {busy === "sweep-preview" ? "Checking…" : "Check the whole national list"}
            </button>
            <button
              type="button"
              onClick={() => void onDirectorySweep(true)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              {busy === "sweep-apply" ? "Filling in…" : "Fill in what it finds"}
            </button>
            <button
              type="button"
              onClick={() => void onRetryUnresolved()}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              <RefreshCw className="size-4" aria-hidden />
              {busy === "retry-federal" ? "Queueing…" : "Try the unresolved again"}
            </button>
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
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              {busy === "federal" ? "Working…" : "Run 50"}
            </button>
            {busy === "federal-all" ? (
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                }}
                className="touch-target inline-flex items-center gap-2 rounded-lg border border-seam-red px-4 text-sm font-semibold text-seam-red"
              >
                Stop after this batch
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onFederalUntilDone()}
                disabled={busy !== null}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Keep going until done
              </button>
            )}
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
          <div className="mt-4 grid gap-3">
            <p className="text-sm font-semibold text-graphite">
              {blocked.length} school(s) need a match decision
            </p>
            <p className="text-sm text-steel">
              The decision screen shows each school beside the closest record in the national list, so
              most take one click.
            </p>
            <Link
              to="/admin/federal-decisions"
              className="touch-target inline-flex w-fit items-center gap-2 rounded-lg bg-org-primary px-3.5 text-sm font-semibold text-white"
            >
              Decide the last schools
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-steel">No unresolved federal matches.</p>
        )}

      </SectionCard>

      {parked?.length ? (
        <SectionCard
          title="Parked — not in the federal data"
          blurb="Schools you set aside. Their cost and academic details stay blank until federal data or a person fills them."
          aside={
            <button
              type="button"
              onClick={() => void onUnparkAll()}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold text-steel disabled:opacity-60"
            >
              <RefreshCw className="size-4" aria-hidden />
              {busy === "unpark-all" ? "Queueing…" : "Look again at all"}
            </button>
          }
        >
          <div className="mt-4 grid gap-2">
            <p className="text-sm font-semibold text-graphite">{parked.length} school(s) parked</p>
            {parked.map((school: any) => (
              <div
                key={school.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-graphite">{school.name}</p>
                  <p className="meta">
                    {[school.city, school.state].filter(Boolean).join(", ") || "Location unknown"}
                    {school.federal_synced_at
                      ? ` · parked ${new Date(school.federal_synced_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onUnpark(school.id, school.name)}
                  disabled={busy !== null}
                  className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
                >
                  {busy === `unpark-${school.id}` ? "Queueing…" : "Look again"}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {nonSchools?.entries?.length ? (
        <SectionCard
          title="Entries that aren't schools"
          blurb="Directory and index pages that slipped in with a membership list. Removing one also clears its placeholder baseball and softball teams."
        >
          <div className="mt-4 grid gap-2">
            <p className="text-sm font-semibold text-graphite">
              {nonSchools.entries.length} entry(ies) to clear out
            </p>
            {nonSchools.entries.map((entry: any) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-graphite">{entry.name}</p>
                  <p className="meta">
                    {entry.state ? `${entry.state} · ` : ""}
                    {entry.programs} placeholder team(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRemoveNonSchool(entry.id, entry.name)}
                  disabled={busy !== null}
                  className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-seam-red disabled:opacity-60"
                >
                  {busy === `remove-${entry.id}` ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

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
      </details>
    </div>
  );
}

/** The short list of things a person still has to decide. */
function NeedsYou({ decisions, notSchools }: { decisions: number; notSchools: number }) {
  const items = [
    decisions
      ? {
          to: "/admin/federal-decisions" as const,
          label: `${decisions} school${decisions === 1 ? "" : "s"} need a match decision`,
          hint: "Each one is shown beside its closest national record.",
          cta: "Decide these schools",
        }
      : null,
    {
      to: "/admin/review" as const,
      label: "Proposed changes waiting for a yes or no",
      hint: "Collected values that would change something already saved.",
      cta: "Open the review queue",
    },
    notSchools
      ? {
          to: null,
          label: `${notSchools} entr${notSchools === 1 ? "y" : "ies"} that aren't schools`,
          hint: "Listed under the hands-on tools below, ready to remove.",
          cta: null,
        }
      : null,
  ].filter(Boolean) as {
    to: "/admin/federal-decisions" | "/admin/review" | null;
    label: string;
    hint: string;
    cta: string | null;
  }[];

  return (
    <SectionCard title="What needs you" blurb="Everything else runs on its own.">
      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-3"
          >
            <div>
              <p className="text-sm font-semibold text-graphite">{item.label}</p>
              <p className="meta">{item.hint}</p>
            </div>
            {item.to && item.cta ? (
              <Link
                to={item.to}
                className="touch-target inline-flex items-center rounded-lg bg-org-primary px-3.5 text-sm font-semibold text-white"
              >
                {item.cta}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
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

