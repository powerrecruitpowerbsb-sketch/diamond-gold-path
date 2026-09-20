import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

import { getCrawlProgress } from "@/lib/crawl-progress.functions";
import { startCollection } from "@/lib/collection.functions";
import { HelpTip } from "@/components/brand/HelpTip";

const ago = (minutes: number | null) => {
  if (minutes === null) return "no activity recorded yet";
  if (minutes < 1) return "seconds ago";
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
};

/**
 * The nationwide roster crawl: how far it has got, whether it is still moving,
 * and one button to pick it back up from the last finished team.
 */
export function CrawlStatus() {
  const progressFn = useServerFn(getCrawlProgress);
  const startFn = useServerFn(startCollection);
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["crawl-progress"],
    queryFn: () => progressFn(),
    refetchInterval: 30_000,
  });

  const done = data?.done ?? 0;
  const total = data?.total ?? 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const moving = Boolean(data?.moving);

  async function onResume() {
    setBusy(true);
    try {
      await startFn();
      toast.success("Picking up where it stopped — you can close this page.");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not resume");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="flex items-center gap-2">
          <span
            className={`inline-block size-2.5 rounded-full ${moving ? "animate-pulse bg-diamond-green" : "bg-steel/40"}`}
            aria-hidden
          />
          <span className="font-display text-xl font-bold text-graphite">
            Nationwide roster crawl
          </span>
          <HelpTip label="About the nationwide crawl">
            Every team in the country, read once each. Finished teams are remembered, so resuming
            never re-reads a team that is already done.
          </HelpTip>
        </p>
        <button
          type="button"
          onClick={() => void onResume()}
          disabled={busy}
          className="touch-target inline-flex items-center gap-2 rounded-lg bg-diamond-green px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          <RotateCw className="size-4" aria-hidden />
          {busy ? "Resuming…" : moving ? "Keep it going" : "Resume the crawl"}
        </button>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-diamond-green transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-steel tabular-nums">
        {done.toLocaleString()} of {total.toLocaleString()} teams read ({percent}%)
      </p>
      <p className="meta mt-1 tabular-nums">
        {(data?.success ?? 0).toLocaleString()} read cleanly ·{" "}
        {(data?.partial ?? 0).toLocaleString()} partly read ·{" "}
        {(data?.skipped ?? 0).toLocaleString()} set aside for later ·{" "}
        {(data?.failed ?? 0).toLocaleString()} we couldn't read
      </p>
      <p className="meta mt-1">
        Last team finished {ago(data?.idleMinutes ?? null)}
        {moving ? " — still moving." : " — it looks stopped. Press resume to pick it back up."}
      </p>
    </section>
  );
}
