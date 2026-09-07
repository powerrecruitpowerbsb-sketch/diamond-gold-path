import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, Check } from "lucide-react";
import { toast } from "sonner";

import {
  chooseCollectionWave,
  getCollectionProgress,
  getCollectionWaves,
  setCollectionAutoAdvance,
  startCollection,
  stopCollection,
} from "@/lib/collection.functions";

type Progress = Awaited<ReturnType<typeof getCollectionProgress>>;

type Level = {
  key: string;
  label: string;
  waiting: number;
  held: number;
  running: number;
  done: number;
  givenUp: number;
  total: number;
  complete: boolean;
};

type Board = {
  levels: Level[];
  currentWave: string | null;
  nextWave: string | null;
  autoAdvance: boolean;
  perMinute: number;
};

/** "about 35 min" / "about 2 hr" from a count and a per-minute pace. */
function estimate(left: number, perMinute: number): string | null {
  if (!left || perMinute <= 0) return null;
  const minutes = Math.round(left / perMinute);
  if (minutes < 60) return `about ${Math.max(1, minutes)} min to go at this pace`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `about ${hours} hr to go at this pace`;
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
 * The one thing a person wants first: is the collection running, where has it
 * got to, and how do I start or stop it. Everything finer sits behind the
 * "show the levels" disclosure so this band stays readable.
 */
export function RunningNow() {
  const progressFn = useServerFn(getCollectionProgress);
  const startFn = useServerFn(startCollection);
  const stopFn = useServerFn(stopCollection);
  const wavesFn = useServerFn(getCollectionWaves);
  const chooseWaveFn = useServerFn(chooseCollectionWave);
  const autoAdvanceFn = useServerFn(setCollectionAutoAdvance);

  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery<Progress>({
    queryKey: ["collection-progress"],
    queryFn: () => progressFn() as Promise<Progress>,
    refetchInterval: 20_000,
  });

  const { data: board, refetch: refetchWaves } = useQuery({
    queryKey: ["collection-waves"],
    queryFn: () => wavesFn() as Promise<Board>,
    refetchInterval: 30_000,
  });

  const running = Boolean(data?.state.isRunning);
  const levels = board?.levels ?? [];
  const current = levels.find((level) => level.key === board?.currentWave) ?? null;
  const next = levels.find((level) => level.key === board?.nextWave) ?? null;
  const pace = board?.perMinute ?? 0;
  const beat = relative(data?.state.lastBeatAt ?? null);
  const percent = current?.total ? Math.round((current.done / current.total) * 100) : 0;

  async function onStart() {
    setBusy(true);
    try {
      await startFn();
      toast.success("Collecting now — you can close this page.");
      await Promise.all([refetch(), refetchWaves()]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not start collecting");
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    try {
      await stopFn();
      toast.success("Stopped — everything collected so far is saved");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not stop it");
    } finally {
      setBusy(false);
    }
  }

  async function onChooseWave(wave: string, label: string) {
    setBusy(true);
    try {
      await chooseWaveFn({ data: { wave } });
      toast.success(`${label} is next in line`);
      await Promise.all([refetch(), refetchWaves()]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not switch levels");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleAutoAdvance(on: boolean) {
    setBusy(true);
    try {
      await autoAdvanceFn({ data: { on } });
      await refetchWaves();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2">
            <span
              className={`inline-block size-2.5 rounded-full ${running ? "animate-pulse bg-diamond-green" : "bg-steel/40"}`}
              aria-hidden
            />
            <span className="font-display text-xl font-bold text-graphite">
              {running ? "Collecting now" : "Not collecting"}
            </span>
          </p>
          <p className="mt-1 text-sm text-steel">
            {running
              ? current
                ? `Working through ${current.label}. It keeps going on its own — you can close this page.`
                : "Working through the list on its own — you can close this page."
              : "Nothing is being collected. Press start and it will keep going by itself."}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => void onStop()}
            disabled={busy}
            className="touch-target inline-flex items-center gap-2 rounded-lg border border-seam-red/40 px-4 text-sm font-semibold text-seam-red disabled:opacity-60"
          >
            <Square className="size-4" aria-hidden />
            {busy ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={busy}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Play className="size-4" aria-hidden />
            {busy ? "Starting…" : "Start collecting"}
          </button>
        )}
      </div>

      {current ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full bg-diamond-green transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-steel tabular-nums">
            {current.label}: {current.done.toLocaleString()} of {current.total.toLocaleString()} schools
            done
            {current.waiting ? ` · ${current.waiting.toLocaleString()} still to do` : ""}
          </p>
          {!current.complete && estimate(current.waiting, pace) ? (
            <p className="meta mt-1">{estimate(current.waiting, pace)}</p>
          ) : null}
          {current.complete && next ? (
            <p className="meta mt-1">
              {board?.autoAdvance
                ? `${current.label} is finished — moving on to ${next.label}.`
                : `${current.label} is finished. Next up: ${next.label} — pick it when you're ready.`}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {beat ? <span className="meta">Last activity {beat}</span> : null}
        {running ? (
          <span className="meta">
            This run so far: {data?.state.programsScraped ?? 0} teams read,{" "}
            {data?.state.playersFound ?? 0} players found
          </span>
        ) : null}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-steel">
          Show the levels it works through
        </summary>
        <div className="mt-3">
          <label className="meta flex items-center gap-2">
            <input
              type="checkbox"
              checked={board?.autoAdvance ?? true}
              disabled={busy}
              onChange={(event) => void onToggleAutoAdvance(event.target.checked)}
              className="size-4 rounded border-border"
            />
            Move on to the next level by itself
          </label>
          <ul className="mt-3 grid gap-1.5">
            {levels.map((level) => (
              <li
                key={level.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-graphite">
                  {level.complete ? (
                    <Check className="size-4 text-diamond-green" aria-hidden />
                  ) : null}
                  {level.label}
                  {level.key === board?.currentWave ? (
                    <span className="rounded-full bg-diamond-green/15 px-2 py-0.5 text-xs font-semibold text-diamond-green">
                      working on this
                    </span>
                  ) : null}
                </span>
                <span className="meta tabular-nums">
                  {level.complete
                    ? "finished"
                    : `${level.done} done · ${level.waiting} to do${level.held ? ` · ${level.held} waiting its turn` : ""}`}
                  {level.givenUp ? ` · ${level.givenUp} we couldn't read` : ""}
                </span>
                {level.key === board?.currentWave ? null : (
                  <button
                    type="button"
                    onClick={() => void onChooseWave(level.key, level.label)}
                    disabled={busy}
                    className="touch-target rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
                  >
                    Work on this next
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
