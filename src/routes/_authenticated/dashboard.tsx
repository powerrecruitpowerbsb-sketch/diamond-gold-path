import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Search, Users } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { ActionButton, ActionLink } from "@/components/brand/ActionButton";
import { EmptyState } from "@/components/brand/EmptyState";
import { OrgMark } from "@/components/brand/OrgMark";
import { AuthButton } from "@/components/brand/AuthButton";
import { ActionsPanel } from "@/components/coach/ActionsPanel";
import { OnboardingPanel } from "@/components/owner/OnboardingPanel";
import { SeasonTeamPicker } from "@/components/brand/SeasonTeamPicker";
import { useSeasonContext } from "@/hooks/use-season-context";
import { useSportMode } from "@/hooks/use-sport-mode";
import {
  DIVISION_BUCKETS,
  SHORTLIST_STATUSES,
  SHORTLIST_STATUS_LABEL,
  getOrgDashboard,
  type ShortlistStatus,
} from "@/lib/shortlist.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Recruiting engine — Curve Recruit" },
      {
        name: "description",
        content:
          "Organization recruiting dashboard: every athlete's shortlist status, plus division and region targets across the class.",
      },
      { property: "og:title", content: "Recruiting engine — Curve Recruit" },
      {
        property: "og:description",
        content: "Where your recruiting class stands, at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const STATUS_DOT: Record<ShortlistStatus, string> = {
  researching: "bg-org-primary",
  contacted: "bg-org-accent",
  offered: "bg-seam-red",
  committed: "bg-diamond-green",
  eliminated: "bg-steel",
};

function Dashboard() {
  const dashboardFn = useServerFn(getOrgDashboard);
  const ctx = useSeasonContext();
  const { sport } = useSportMode();
  const { data, isPending, error } = useQuery({
    queryKey: ["org-dashboard", ctx.seasonId, ctx.teamId, sport],
    queryFn: () => dashboardFn({ data: { seasonId: ctx.seasonId, teamId: ctx.teamId, sport } }),
    retry: false,
  });

  const [term, setTerm] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [stageFilter, setStageFilter] = useState<ShortlistStatus | null>(null);

  const athletes = useMemo(() => {
    const rows = data?.athletes ?? [];
    const needle = term.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && !String(row.name ?? "").toLowerCase().includes(needle)) return false;
      if (gradYear && String(row.gradYear ?? "") !== gradYear) return false;
      if (stageFilter && (row.counts?.[stageFilter] ?? 0) === 0) return false;
      return true;
    });
  }, [data, term, gradYear, stageFilter]);

  if (error) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(error as Error).message}
        </p>
      </AppShell>
    );
  }

  const totals = data?.totals;
  const divisionMax = Math.max(1, ...DIVISION_BUCKETS.map((b) => data?.byDivision?.[b] ?? 0));
  const regionMax = Math.max(1, ...(data?.byRegion ?? []).map((r) => r.count));
  const statusMax = Math.max(1, ...SHORTLIST_STATUSES.map((s) => data?.byStatus?.[s] ?? 0));

  return (
    <AppShell right={<AuthButton />}>
      <section className="stadium-gradient overflow-hidden rounded-2xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex items-center gap-3">
          <OrgMark size={40} className="bg-white/10" />
          <p className="meta text-org-accent">RECRUITING ENGINE</p>
        </div>
        <h1 className="mt-4 font-display text-[1.9rem] leading-[1.08] font-bold text-white sm:text-4xl">
          {data?.orgName ?? "Your organization"}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] text-white/80">
          Here's where your class stands today.
        </p>

        <dl className="mt-7 grid grid-cols-2 gap-3 border-t border-white/12 pt-6 sm:grid-cols-4">
          {[
            ["Athletes", totals?.athletes],
            ["Schools saved", totals?.savedSchools],
            ["Offers", totals?.offers],
            ["Commits", totals?.commits],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="font-mono text-[11px] tracking-wide text-white/60 uppercase">
                {label}
              </dt>
              <dd className="font-display text-2xl font-bold text-white tabular-nums">
                {isPending ? "—" : Number(value ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6">
        <SeasonTeamPicker ctx={ctx} />
      </div>

      <OnboardingPanel />
      <ActionsPanel seasonId={ctx.seasonId} teamId={ctx.teamId} sport={sport} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <BarCard
          title="Targets by division"
          hint="Every school your athletes are tracking."
          rows={DIVISION_BUCKETS.map((bucket) => ({
            label: bucket,
            count: data?.byDivision?.[bucket] ?? 0,
          })).filter((row) => row.count > 0 || row.label !== "Other")}
          max={divisionMax}
          barClass="bg-org-primary"
          loading={isPending}
        />
        <BarCard
          title="Targets by region"
          hint="Where your class is looking."
          rows={data?.byRegion ?? []}
          max={regionMax}
          barClass="bg-org-accent"
          loading={isPending}
        />
        <BarCard
          title="Pipeline by stage"
          hint="Tap a stage to see just those athletes."
          rows={SHORTLIST_STATUSES.map((status) => ({
            key: status,
            label: SHORTLIST_STATUS_LABEL[status],
            count: data?.byStatus?.[status] ?? 0,
            barClass: STATUS_DOT[status],
          }))}
          max={statusMax}
          barClass="bg-org-primary"
          loading={isPending}
          onSelect={(key) => setStageFilter(key as ShortlistStatus | null)}
          activeKey={stageFilter}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-org-primary">Your athletes</h2>
            <p className="text-sm text-steel">
              {athletes.length} athlete{athletes.length === 1 ? "" : "s"} shown
              {stageFilter ? ` at ${SHORTLIST_STATUS_LABEL[stageFilter].toLowerCase()}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search athletes…"
                className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus:border-org-primary sm:w-56"
              />
            </div>
            <select
              value={gradYear}
              onChange={(event) => setGradYear(event.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
            >
              <option value="">All grad years</option>
              {(data?.gradYears ?? []).map((year) => (
                <option key={String(year)} value={String(year)}>
                  {String(year)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPending ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : athletes.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Users}
            headline={stageFilter || term || gradYear ? "Nobody here yet" : "Start your roster"}
            action={
              stageFilter || term || gradYear ? (
                <ActionButton
                  tone="secondary"
                  onClick={() => {
                    setStageFilter(null);
                    setTerm("");
                    setGradYear("");
                  }}
                >
                  Clear filters
                </ActionButton>
              ) : (
                <ActionLink to="/roster/new">Add your first athlete</ActionLink>
              )
            }
          >
            {stageFilter || term || gradYear
              ? "No athlete matches what you picked."
              : "Add a player and their college board starts here."}
          </EmptyState>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {athletes.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  to="/roster/$id"
                  params={{ id: String(athlete.id) }}
                  className="flex h-full flex-col rounded-xl border border-border bg-card p-4 "
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-base leading-snug font-bold text-org-primary">
                        {athlete.name}
                      </p>
                      <p className="font-mono text-[11px] text-steel tabular-nums">
                        {athlete.gradYear ?? "—"}
                        {athlete.position ? ` · ${athlete.position}` : ""}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-steel" aria-hidden />
                  </div>

                  <div className="mt-3 border-t border-border pt-3">
                    {athlete.total === 0 ? (
                      <p className="text-xs text-steel">No schools saved yet</p>
                    ) : (
                      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
                        {SHORTLIST_STATUSES.filter((status) => athlete.counts[status] > 0).map(
                          (status) => (
                            <li
                              key={status}
                              className="flex items-center gap-1.5 text-xs text-graphite"
                            >
                              <span
                                className={cn("size-2 rounded-full", STATUS_DOT[status])}
                                aria-hidden
                              />
                              <span className="font-semibold tabular-nums">
                                {athlete.counts[status]}
                              </span>
                              <span className="text-steel">
                                {SHORTLIST_STATUS_LABEL[status].toLowerCase()}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                    <p className="mt-2 font-mono text-[11px] text-steel tabular-nums">
                      {athlete.total} school{athlete.total === 1 ? "" : "s"} tracked
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function BarCard({
  title,
  hint,
  rows,
  max,
  barClass,
  loading,
  onSelect,
  activeKey,
}: {
  title: string;
  hint: string;
  rows: { label: string; count: number; barClass?: string; key?: string }[];
  max: number;
  barClass: string;
  loading: boolean;
  /** When set, each bar filters the roster below to that segment. */
  onSelect?: (key: string | null) => void;
  activeKey?: string | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-org-primary">{title}</h3>
        {activeKey && onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs font-semibold text-org-accent-strong hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-steel">{hint}</p>
      {loading ? (
        <div className="mt-5 h-28 animate-pulse rounded-lg bg-muted" />
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-steel">Nothing saved yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((row) => {
            const key = row.key ?? row.label;
            const active = activeKey === key;
            const width = `${Math.max(row.count > 0 ? 4 : 0, Math.round((row.count / max) * 100))}%`;
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-graphite">{row.label}</span>
                  <span className="font-display text-lg leading-none font-bold text-org-primary tabular-nums">
                    {row.count}
                  </span>
                </span>
                <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-track">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width,opacity] duration-300",
                      row.barClass ?? barClass,
                      active && "opacity-100",
                    )}
                    style={{ width }}
                  />
                </span>
              </>
            );

            return (
              <li key={key}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(active ? null : key)}
                    aria-pressed={active}
                    className={cn(
                      "block w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors",
                      active ? "bg-org-accent-tint" : "hover:bg-org-accent-tint/60",
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="px-2 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
