import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, Activity } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import {
  getCollectionProgress,
  runCollectionBatch,
  startCollection,
  stopCollection,
} from "@/lib/collection.functions";

type Progress = Awaited<ReturnType<typeof getCollectionProgress>>;

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="meta">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink-navy tabular-nums">{value}</p>
      {hint ? <p className="meta mt-1">{hint}</p> : null}
    </div>
  );
}

/**
 * Runs the country in the background: the browser keeps asking the server for
 * one small pass at a time while the run is open, so nothing depends on a
 * single long request and closing the page simply pauses progress.
 */
export function CollectionRunner() {
  const progressFn = useServerFn(getCollectionProgress);
  const startFn = useServerFn(startCollection);
  const stopFn = useServerFn(stopCollection);
  const batchFn = useServerFn(runCollectionBatch);

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const loopRef = useRef(false);

  const { data, refetch } = useQuery<Progress>({
    queryKey: ["collection-progress"],
    queryFn: () => progressFn() as Promise<Progress>,
    refetchInterval: 15_000,
  });

  const running = Boolean(data?.state.isRunning);
  const note = (line: string) => setLog((prev) => [line, ...prev].slice(0, 12));

  // Keep passes flowing while the run is marked open.
  useEffect(() => {
    if (!running || loopRef.current) return;
    loopRef.current = true;

    void (async () => {
      try {
        while (loopRef.current) {
          const result = (await batchFn({
            data: { discoverySchools: 6, scrapePrograms: 6, workers: 4 },
          })) as any;
          if (result.stopped) break;
          const pass = result.pass;
          if (pass) {
            note(
              `${pass.schoolsDiscovered} school(s) searched · ${pass.linksApplied} link(s) saved · ` +
                `${pass.programsScraped} team(s) collected · ${pass.playersFound} player(s)` +
                (pass.failures ? ` · ${pass.failures} problem(s)` : ""),
            );
          }
          await refetch();
          if (pass?.idle) {
            toast.success("Everything in the queue has been collected");
            break;
          }
        }
      } catch (failure) {
        note(failure instanceof Error ? failure.message : "A pass failed");
        toast.error("Collection paused after an error — press Start to continue");
      } finally {
        loopRef.current = false;
        await refetch();
      }
    })();

    return () => {
      loopRef.current = false;
    };
  }, [running, batchFn, refetch]);

  async function onStart() {
    setBusy(true);
    try {
      const result = (await startFn()) as any;
      const queued = Object.values(result.queued ?? {}).reduce(
        (sum: number, n) => sum + Number(n ?? 0),
        0,
      );
      note(queued ? `Started — ${queued} new job(s) added to the list` : "Started");
      toast.success("Collection running");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not start collection");
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    loopRef.current = false;
    try {
      await stopFn();
      note("Stopped");
      toast.success("Collection stopped — progress is saved");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not stop collection");
    } finally {
      setBusy(false);
    }
  }

  const remaining = (data?.remaining.discovery ?? 0) + (data?.remaining.scrape ?? 0);

  return (
    <SectionCard
      title="Step 3 — Collect every school in the country"
      blurb="Finds each school's roster and coaching pages, then reads the facts and rosters off them. It works through the whole list a few schools at a time and picks up where it left off, so you can stop and start whenever you like."
      aside={
        running ? (
          <button
            type="button"
            onClick={() => void onStop()}
            disabled={busy}
            className="touch-target inline-flex items-center gap-2 rounded-lg border border-seam-red/40 px-3.5 text-sm font-semibold text-seam-red disabled:opacity-60"
          >
            <Square className="size-4" aria-hidden />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={busy}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-ink-navy px-3.5 text-sm font-semibold text-parchment disabled:opacity-60"
          >
            <Play className="size-4" aria-hidden />
            {busy ? "Starting…" : "Start collecting"}
          </button>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Teams collected"
          value={data?.programs.snapshots ?? 0}
          hint={`of ${data?.programs.total ?? 0} teams nationwide`}
        />
        <Tile
          label="Roster pages found"
          value={data?.programs.withRosterUrl ?? 0}
          hint={`${data?.remaining.discovery ?? 0} school jobs still to search`}
        />
        <Tile
          label="Waiting to collect"
          value={data?.remaining.scrape ?? 0}
          hint={remaining ? "Runs automatically while this is open" : "Nothing left in line"}
        />
        <Tile
          label="Needs your eyes"
          value={(data?.review.links ?? 0) + (data?.review.facts ?? 0)}
          hint={`${data?.review.links ?? 0} link(s) · ${data?.review.facts ?? 0} fact(s)`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            running ? "bg-diamond-green/10 text-diamond-green" : "bg-border/40 text-steel"
          }`}
        >
          <Activity className="size-3.5" aria-hidden />
          {running ? "Collecting now" : "Idle"}
        </span>
        {data?.state.lastMessage ? <span className="meta">{data.state.lastMessage}</span> : null}
        {data?.problems.failed || data?.problems.blocked ? (
          <span className="meta text-seam-red">
            {data.problems.failed} retrying · {data.problems.blocked} stuck
          </span>
        ) : null}
      </div>

      {running ? (
        <p className="meta mt-3">
          Keep this page open while it works. Totals this run: {data?.state.linksApplied ?? 0} link(s)
          saved, {data?.state.programsScraped ?? 0} team(s) collected, {data?.state.playersFound ?? 0}{" "}
          player(s) read.
        </p>
      ) : null}

      {log.length ? (
        <ul className="mt-4 grid gap-1">
          {log.map((line, index) => (
            <li key={`${index}-${line}`} className="meta">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
