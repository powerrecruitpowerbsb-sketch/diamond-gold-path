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
import { WallShare } from "@/components/owner/WallShare";
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
  const pipelineTotal = SHORTLIST_STATUSES.reduce((s, k) => s + (data?.byStatus?.[k] ?? 0), 0);
  const filtered = stageFilter || term || gradYear;

  return (
    <AppShell right={<AuthButton />}>
      <section className="stadium-gradient overflow-hidden rounded-2xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <OrgMark size={32} className="bg-white/10" />
          <div className="min-w-0">
            <p className="meta text-org-accent">RECRUITING ENGINE</p>
            <h1 className="truncate font-display text-xl leading-tight font-bold text-white sm:text-2xl">
              {data?.orgName ?? "Your organization"}
            </h1>
          </div>
          <div className="ml-auto hidden gap-2 sm:flex">
            <Link to="/roster" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">
              Roster
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-white/12 pt-3">
          {[
            ["Athletes", totals?.athletes],
            ["Saved", totals?.savedSchools],
            ["Offers", totals?.offers],
            ["Commits", totals?.commits],
          ].map(([label, value]) => (
            <div key={String(label)} className="min-w-0">
              <dt className="truncate font-mono text-[10px] tracking-wide text-white/60 uppercase sm:text-[11px]">
                {label}
              </dt>
              <dd className="font-display text-lg font-bold text-white tabular-nums sm:text-2xl">
                {isPending ? "—" : Number(value ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="sticky top-0 z-20 -mx-4 mt-3 bg-chalk/95 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0">
        <SeasonTeamPicker ctx={ctx} />
      </div>

      <ActionsPanel seasonId={ctx.seasonId} teamId={ctx.teamId} sport={sport} />

      <section className="mt-4 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-graphite">Pipeline</h2>
          {stageFilter ? (
            <button type="button" onClick={() => setStageFilter(null)} className="text-xs font-semibold text-org-primary hover:underline">
              Clear
            </button>
          ) : null}
        </div>
        {isPending ? (
          <div className="mt-2 h-3 animate-pulse rounded-full bg-muted" />
        ) : pipelineTotal === 0 ? (
          <p className="mt-2 text-sm text-steel">No schools saved yet.</p>
        ) : (
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-track">
            {SHORTLIST_STATUSES.map((s) => {
              const n = data?.byStatus?.[s] ?? 0;
              if (!n) return null;
              return <span key={s} className={cn("h-full", STATUS_DOT[s])} style={{ width: `${(n / pipelineTotal) * 100}%` }} />;
            })}
          </div>
        )}
        <div className="mt-3 flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {SHORTLIST_STATUSES.map((s) => {
            const active = stageFilter === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setStageFilter(active ? null : s)}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs",
                  active ? "border-org-primary bg-org-primary/10" : "border-border",
                )}
              >
                <span className={cn("size-2 rounded-full", STATUS_DOT[s])} aria-hidden />
                <span className="font-semibold text-graphite">{SHORTLIST_STATUS_LABEL[s]}</span>
                <span className="font-mono text-steel tabular-nums">{data?.byStatus?.[s] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-org-primary">Athletes</h2>
            <p className="text-sm text-steel">
              {athletes.length} shown
              {stageFilter ? ` · ${SHORTLIST_STATUS_LABEL[stageFilter].toLowerCase()}` : ""}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
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
              <option value="">All years</option>
              {(data?.gradYears ?? []).map((year) => (
                <option key={String(year)} value={String(year)}>
                  {String(year)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPending ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : athletes.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Users}
            headline={filtered ? "Nobody here yet" : "Start your roster"}
            action={
              filtered ? (
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
              ) : ctx.canManage ? (
                <ActionLink to="/roster/new">Add your first athlete</ActionLink>
              ) : null
            }
          >
            {filtered
              ? "No athlete matches what you picked."
              : ctx.canManage
                ? "Add a player and their college board starts here."
                : "No players on your teams yet. An admin assigns them."}
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {athletes.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  to="/roster/$id"
                  params={{ id: String(athlete.id) }}
                  className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 items-baseline gap-2 sm:w-56 sm:shrink-0">
                    <span className="truncate font-semibold text-graphite">{athlete.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-steel tabular-nums">
                      {athlete.gradYear ?? "—"}
                      {athlete.position ? ` · ${athlete.position}` : ""}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {athlete.topSchools.length === 0 ? (
                      <span className="text-xs text-steel">
                        {athlete.total === 0 ? "No schools yet" : `${athlete.total} tracked`}
                      </span>
                    ) : (
                      athlete.topSchools.map((school) => (
                        <span
                          key={school.name}
                          className="flex max-w-[12rem] items-center gap-1 rounded-full border border-border bg-chalk/60 px-2 py-0.5 text-xs text-graphite"
                        >
                          <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[school.status])} aria-hidden />
                          <span className="truncate">{school.name}</span>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    <span className="font-mono text-[11px] text-steel tabular-nums">{athlete.total} saved</span>
                    <ArrowUpRight className="size-4 text-steel" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <CompactList
          title="Divisions"
          rows={DIVISION_BUCKETS.map((b) => ({ label: b, count: data?.byDivision?.[b] ?? 0 })).filter((r) => r.count > 0)}
        />
        <CompactList title="Regions" rows={data?.byRegion ?? []} />
      </section>

      {ctx.canManage ? <OnboardingPanel /> : null}
      <WallShare />
    </AppShell>
  );
}

function CompactList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h3 className="font-display text-base font-bold text-graphite">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-steel">Nothing saved yet.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {rows.map((r) => (
            <li key={r.label} className="text-sm text-graphite">
              {r.label} <span className="font-mono text-steel tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
