import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, Activity, Layers } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import {
  chooseCollectionWave,
  getCollectionProgress,
  getCollectionWaves,
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

const relative = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
};

/**
 * Read-out for the nationwide run. The work itself happens on the server on a
 * schedule, so this page only starts it, stops it, and reports what happened —
 * closing the page no longer pauses anything.
 */
export function CollectionRunner() {
  const progressFn = useServerFn(getCollectionProgress);
  const startFn = useServerFn(startCollection);
  const stopFn = useServerFn(stopCollection);

  const wavesFn = useServerFn(getCollectionWaves);
  const chooseWaveFn = useServerFn(chooseCollectionWave);

  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery<Progress>({
    queryKey: ["collection-progress"],
    queryFn: () => progressFn() as Promise<Progress>,
    refetchInterval: 20_000,
  });

  const { data: waves, refetch: refetchWaves } = useQuery({
    queryKey: ["collection-waves"],
    queryFn: () => wavesFn() as Promise<{ key: string; label: string; waiting: number; held: number }[]>,
    refetchInterval: 60_000,
  });

  const running = Boolean(data?.state.isRunning);

  async function onChooseWave(wave: string, label: string) {
    setBusy(true);
    try {
      const result = (await chooseWaveFn({ data: { wave } })) as {
        released: number;
        held: number;
        waitingInWave: number;
      };
      toast.success(
        `${label} is next in line — ${result.waitingInWave} team${result.waitingInWave === 1 ? "" : "s"} to work through${result.held ? `, ${result.held} set aside for later` : ""}`,
      );
      await Promise.all([refetch(), refetchWaves()]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not switch levels");
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    try {
      const result = (await startFn()) as any;
      const queued = Object.values(result.queued ?? {}).reduce(
        (sum: number, n) => sum + Number(n ?? 0),
        0,
      );

      toast.success(
        queued
          ? `Collection running — ${queued} new job(s) added. You can close this page.`
          : "Collection running — you can close this page.",
      );
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not start collection");
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    try {
      await stopFn();
      toast.success("Collection stopped — progress is saved");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not stop collection");
    } finally {
      setBusy(false);
    }
  }

  const remaining = (data?.remaining.discovery ?? 0) + (data?.remaining.scrape ?? 0);
  const beat = relative(data?.state.lastBeatAt ?? null);

  return (
    <SectionCard
      title="Collect every school in the country"
      blurb="Finds each school's roster and coaching pages, then reads the facts and rosters off them. It keeps working on its own, a few schools at a time — start it once and close the page whenever you like."
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
          hint={`${data?.remaining.discovery ?? 0} school(s) still to search`}
        />
        <Tile
          label="Waiting to collect"
          value={data?.remaining.scrape ?? 0}
          hint={remaining ? "Working through these automatically" : "Nothing left in line"}
        />
        <Tile
          label="Needs your eyes"
          value={(data?.review.links ?? 0) + (data?.review.facts ?? 0)}
          hint={`${data?.review.links ?? 0} link(s) · ${data?.review.facts ?? 0} fact(s)`}
        />
      </div>

      <div className="mt-4 rounded-lg border border-border p-3">
        <p className="meta flex items-center gap-2">
          <Layers className="size-3.5" aria-hidden />
          Work one level at a time
        </p>
        <p className="meta mt-1">
          Pick a level to work on now. Everything else waits its turn — nothing is lost.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(waves ?? []).map((wave) => (
            <button
              key={wave.key}
              type="button"
              onClick={() => void onChooseWave(wave.key, wave.label)}
              disabled={busy}
              className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-ink-navy disabled:opacity-60"
            >
              {wave.label}
              <span className="meta ml-2">
                {wave.waiting} to do{wave.held ? ` · ${wave.held} waiting turn` : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void onChooseWave("all", "Everything")}
            disabled={busy}
            className="touch-target rounded-lg border border-ink-navy px-3 text-sm font-semibold text-ink-navy disabled:opacity-60"
          >
            Everything at once
          </button>
        </div>
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
        {beat ? <span className="meta">Last activity {beat}</span> : null}
        {data?.problems.failed || data?.problems.blocked ? (
          <span className="meta text-seam-red">
            {data.problems.failed} retrying · {data.problems.blocked} stuck
          </span>
        ) : null}
      </div>

      {running ? (
        <p className="meta mt-3">
          Running on its own — no need to keep this page open. Totals this run:{" "}
          {data?.state.linksApplied ?? 0} link(s) saved, {data?.state.programsScraped ?? 0} team(s)
          collected, {data?.state.playersFound ?? 0} player(s) read.
        </p>
      ) : null}
    </SectionCard>
  );
}
