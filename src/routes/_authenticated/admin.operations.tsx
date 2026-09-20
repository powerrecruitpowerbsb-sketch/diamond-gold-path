import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Play } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/console/PageHeader";
import { BlockedSitesQueue } from "@/components/admin/BlockedSitesQueue";
import { BrokenLinksQueue } from "@/components/admin/BrokenLinksQueue";
import { getOperationsOverview } from "@/lib/operations.functions";
import { startCollection } from "@/lib/collection.functions";
import { countPendingChanges } from "@/lib/review.functions";
import { ReviewQueuePanel } from "@/routes/_authenticated/admin.review";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Data operations — Curve Recruit" },
      {
        name: "description",
        content:
          "One screen for keeping the college database current: the yearly refresh cycles, the sites blocking us, and the addresses that need a person.",
      },
      { property: "og:title", content: "Data operations — Curve Recruit" },
      {
        property: "og:description",
        content: "Refresh schedule, blocked sites, and broken addresses in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Operations,
});

type Tab = "overview" | "review" | "blocked" | "broken";

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const daysAway = (value: string) =>
  Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 86_400_000));

function Operations() {
  const overviewFn = useServerFn(getOperationsOverview);
  const startFn = useServerFn(startCollection);
  const [tab, setTab] = useState<Tab>("overview");
  const [starting, setStarting] = useState(false);

  const { data } = useQuery({ queryKey: ["operations-overview"], queryFn: () => overviewFn() });

  const countFn = useServerFn(countPendingChanges);
  const { data: pending } = useQuery({
    queryKey: ["pending-changes-count", "operations"],
    queryFn: () => countFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const reviewCount = pending?.pending ?? 0;

  const baseline = (data?.baseline ?? {}) as any;
  const blocked = data?.exceptions?.blocked ?? 0;
  const broken = data?.exceptions?.broken ?? 0;
  const cycles = (data?.cycles ?? []) as any[];
  const percent = baseline.total ? Math.round(((baseline.done ?? 0) / baseline.total) * 100) : 0;

  async function runNow() {
    setStarting(true);
    try {
      await startFn();
      toast.success("A refresh pass has started — it keeps going with this page closed.");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not start the refresh");
    } finally {
      setStarting(false);
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview & schedule" },
    { key: "review", label: "Review queue", count: reviewCount },
    { key: "blocked", label: "Blocked sites", count: blocked },
    { key: "broken", label: "Broken addresses", count: broken },
  ];

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Data operations"
        description="One place to keep the college database current: what has been read, when the next read happens, and the short list that needs a person."
        counts={[
          `${(baseline.players ?? 0).toLocaleString("en-US")} players on file`,
          `${blocked.toLocaleString("en-US")} blocked sites`,
          `${broken.toLocaleString("en-US")} broken addresses`,
        ]}
      />

      <div role="tablist" aria-label="Data operations sections" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`touch-target inline-flex items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
              tab === item.key
                ? "border-org-primary bg-org-primary text-org-primary-foreground"
                : "border-border bg-card text-graphite"
            }`}
          >
            {item.label}
            {item.count ? (
              <span className="tabular text-xs font-semibold opacity-80">
                {item.count.toLocaleString("en-US")}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="rounded border border-border bg-card p-5">
            <h2 className="font-display text-lg font-bold text-graphite">
              Nationwide baseline read
            </h2>
            <p className="mt-1 text-sm text-steel">
              Every active college team in the country, read once. This is finished — from here on
              the yearly cycles keep it current.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-diamond-green transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-steel tabular-nums">
              {(baseline.done ?? 0).toLocaleString("en-US")} of{" "}
              {(baseline.total ?? 0).toLocaleString("en-US")} teams read ({percent}%)
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Read cleanly", baseline.success],
                ["Partly read", baseline.partial],
                ["Site blocked us", baseline.skipped],
                ["Could not read", baseline.failed],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-border p-3">
                  <dt className="meta">{label as string}</dt>
                  <dd className="font-display text-xl font-bold text-graphite tabular-nums">
                    {((value as number) ?? 0).toLocaleString("en-US")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-graphite">
                  Yearly refresh cycles
                </h2>
                <p className="mt-1 text-sm text-steel">
                  Three reads a year, timed to when colleges actually change their pages. Each date
                  sets itself: once a cycle passes, the next one is a year later, with no upkeep.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void runNow()}
                disabled={starting}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
              >
                <Play className="size-4" aria-hidden />
                {starting ? "Starting…" : "Run a refresh now"}
              </button>
            </div>

            <ul className="mt-4 grid gap-2">
              {cycles.map((cycle, index) => (
                <li
                  key={cycle.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-graphite">
                      <CalendarClock className="size-4 text-steel" aria-hidden />
                      {cycle.name}
                      {index === 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-steel uppercase">
                          next up
                        </span>
                      ) : null}
                    </p>
                    <p className="meta mt-0.5">{cycle.blurb}</p>
                  </div>
                  <p className="text-sm text-steel tabular-nums">
                    {day(cycle.nextRun)} · in {daysAway(cycle.nextRun).toLocaleString("en-US")} days
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {tab === "review" ? <ReviewQueuePanel /> : null}
      {tab === "blocked" ? <BlockedSitesQueue /> : null}
      {tab === "broken" ? <BrokenLinksQueue /> : null}
    </div>
  );
}
