import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Lock, Play, ShieldAlert, Square } from "lucide-react";
import { toast } from "sonner";

import { getBuildStages, runBuildStage, stopBuildStage } from "@/lib/build.functions";
import { seasonLabel } from "@/lib/season";

export const Route = createFileRoute("/_authenticated/admin/build")({
  head: () => ({
    meta: [
      { title: "Build progress — Power Recruit" },
      {
        name: "description",
        content:
          "Four stages, one button each: check the pages, read the rosters, fill in the head coaches, close out the leftovers.",
      },
      { property: "og:title", content: "Build progress — Power Recruit" },
      {
        property: "og:description",
        content: "The four stages that finish the national baseball and softball database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildProgress,
});

type Board = Awaited<ReturnType<typeof getBuildStages>>;

const n = (value: unknown) => Number(value ?? 0).toLocaleString();

const relative = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
};

function BuildProgress() {
  const boardFn = useServerFn(getBuildStages);
  const runFn = useServerFn(runBuildStage);
  const stopFn = useServerFn(stopBuildStage);
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState<string | null>(null);

  const { data, refetch } = useQuery<Board>({
    queryKey: ["build-stages"],
    queryFn: () => boardFn() as Promise<Board>,
    refetchInterval: 15_000,
  });

  const stages = data?.stages ?? [];
  const beat = relative(data?.lastBeatAt ?? null);

  async function onRun(stage: string, title: string) {
    setBusy(stage);
    try {
      const outcome = (await runFn({ data: { stage } })) as any;
      const result = outcome?.result ?? {};
      if (stage === "pages") {
        toast.success(
          result.finished
            ? "Every page on file has now been checked."
            : `Checked ${n(result.checked)} more pages — keep pressing to carry on.`,
        );
      } else if (stage === "coaches" && result.started === false) {
        toast.error("Held back — the safety cases did not all pass, so no coach was saved.");
      } else if (stage === "leftovers") {
        toast.success(
          result.finished
            ? "Nothing left that can be settled automatically."
            : `Settled ${n(result.offered + result.notOffered)} teams and ${n(result.linksSettled)} pages.`,
        );
      } else {
        toast.success(`${title} started — it keeps going on its own, you can close this page.`);
      }
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["completion-board"] })]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not start that");
    } finally {
      setBusy(null);
    }
  }

  async function onStop() {
    setBusy("stop");
    try {
      await stopFn();
      toast.success("Stopped — everything gathered so far is saved.");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not stop it");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="stadium-gradient rounded-xl p-6">
        <p className="meta text-white/60">Build progress</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
          {data?.headline ?? "Working out where things stand…"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Four stages, in order. Each button unlocks once the one above it is finished, and picks up
          where it left off — nothing is ever done twice. Current season: {" "}
          {data ? seasonLabel(data.seasonYear) : "…"}.
        </p>
        {beat ? <p className="meta mt-3 text-white/60">Last activity {beat}</p> : null}
      </section>

      <ol className="grid gap-3">
        {stages.map((stage, index) => {
          const total = stage.done + stage.left;
          const percent = total ? Math.round((stage.done / total) * 100) : stage.state === "done" ? 100 : 0;
          const isBusy = busy === stage.key;
          const running = stage.state === "running";

          return (
            <li key={stage.key} className="rounded-xl border border-border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-bold text-graphite">
                      {index + 1}. {stage.title}
                    </span>
                    <StageBadge state={stage.state} />
                  </p>
                  <p className="mt-1 max-w-2xl text-sm text-steel">{stage.blurb}</p>
                </div>

                {running && (stage.key === "rosters" || stage.key === "coaches") ? (
                  <button
                    type="button"
                    onClick={() => void onStop()}
                    disabled={busy !== null}
                    className="touch-target inline-flex shrink-0 items-center gap-2 rounded-lg border border-seam-red/40 px-4 text-sm font-semibold text-seam-red disabled:opacity-60"
                  >
                    <Square className="size-4" aria-hidden />
                    {busy === "stop" ? "Stopping…" : "Stop"}
                  </button>
                ) : stage.state === "locked" || stage.state === "blocked" ? (
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-steel">
                    <Lock className="size-4" aria-hidden />
                    {stage.lockedReason ?? "Not ready yet"}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onRun(stage.key, stage.title)}
                    disabled={busy !== null}
                    className="touch-target inline-flex shrink-0 items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Play className="size-4" aria-hidden />
                    )}
                    {isBusy ? "Working…" : stage.buttonLabel}
                  </button>
                )}
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full rounded-full bg-diamond-green transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-steel tabular-nums">{stage.detail}</p>
              {stage.message ? <p className="meta mt-1">{stage.message}</p> : null}
              {stage.state === "running" && stage.key === "pages" ? (
                <p className="meta mt-1">
                  Press the button again to check the next batch — it always carries on from here.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="font-display text-lg font-bold text-graphite">When something needs you</h2>
        <p className="mt-1 text-sm text-steel">
          These are the only two places a decision is ever asked for. Everything else is handled
          automatically.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            to="/admin/discovery"
            className="touch-target inline-flex items-center rounded-lg border border-border px-3.5 text-sm font-semibold text-graphite"
          >
            Pages to confirm or paste in
          </Link>
          <Link
            to="/admin/review"
            search={{ program: undefined }}
            className="touch-target inline-flex items-center rounded-lg border border-border px-3.5 text-sm font-semibold text-graphite"
          >
            Proposed changes to say yes or no to
          </Link>
        </div>
        <p className="meta mt-4">
          <Link to="/admin/pipeline" className="underline">
            Details — queues, levels and logs
          </Link>
        </p>
      </section>
    </div>
  );
}

function StageBadge({ state }: { state: string }) {
  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-diamond-green/15 px-2 py-0.5 text-xs font-semibold text-diamond-green">
        <Check className="size-3.5" aria-hidden /> done
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warm-gold/25 px-2 py-0.5 text-xs font-semibold text-graphite">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> running
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-seam-red/10 px-2 py-0.5 text-xs font-semibold text-seam-red">
        <ShieldAlert className="size-3.5" aria-hidden /> held back
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-border/60 px-2 py-0.5 text-xs font-semibold text-steel">
        <Lock className="size-3.5" aria-hidden /> waiting its turn
      </span>
    );
  }
  return (
    <span className="rounded-full bg-org-primary/10 px-2 py-0.5 text-xs font-semibold text-org-primary">
      ready
    </span>
  );
}
