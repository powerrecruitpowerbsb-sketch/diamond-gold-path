import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarRange, Plus, Search as SearchIcon, Upload, Users } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { ActionLink } from "@/components/brand/ActionButton";
import { EmptyState } from "@/components/brand/EmptyState";
import { AuthButton } from "@/components/brand/AuthButton";
import { SeasonTeamPicker } from "@/components/brand/SeasonTeamPicker";
import { PacketShare } from "@/components/coach/PacketShare";
import { useSeasonContext } from "@/hooks/use-season-context";
import { useSportMode } from "@/hooks/use-sport-mode";
import { getAthleteSportMix, listOrgAthletes } from "@/lib/athletes.functions";
import { ATHLETE_STATUS_LABEL } from "@/lib/season-constants";
import { normalizeSport, SPORT_LABEL, SPORTS } from "@/lib/sport";


export const Route = createFileRoute("/_authenticated/roster/")({
  head: () => ({
    meta: [
      { title: "Athlete roster — Curve Recruit" },
      {
        name: "description",
        content: "Your organization's athlete roster: graduation year, position, and recruiting research.",
      },
      { property: "og:title", content: "Athlete roster — Curve Recruit" },
      {
        property: "og:description",
        content: "Manage your travel organization's athletes inside Curve Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RosterScreen,
});


const FLAGS = ["unverified", "no_schools", "no_video", "no_numbers"] as const;
type Flag = (typeof FLAGS)[number];
const FLAG_LABEL: Record<Flag, string> = {
  unverified: "To verify",
  no_schools: "No colleges",
  no_video: "No video",
  no_numbers: "No numbers",
};

function flagsFor(a: Record<string, any>): Flag[] {
  const out: Flag[] = [];
  if ((a['unverified_count'] ?? 0) > 0) out.push("unverified");
  if ((a['school_count'] ?? 0) === 0) out.push("no_schools");
  if ((a['video_count'] ?? 0) === 0) out.push("no_video");
  if ((a['metric_count'] ?? 0) === 0) out.push("no_numbers");
  return out;
}

function RosterScreen() {
  const listFn = useServerFn(listOrgAthletes);
  const ctx = useSeasonContext();
  const [q, setQ] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [status, setStatus] = useState("active");
  const [flag, setFlag] = useState<Flag | "">("");

  // The header switch decides which sport's players this roster shows.
  const { sport, setSport } = useSportMode();
  const mixFn = useServerFn(getAthleteSportMix);
  const { data: mix } = useQuery({
    queryKey: ["athlete-sport-mix", "roster"],
    queryFn: () => mixFn(),
    staleTime: 30_000,
  });
  const { data, isPending, error } = useQuery({
    queryKey: ["org-athletes", q, gradYear, status, ctx.seasonId, ctx.teamId, sport],
    queryFn: () =>
      listFn({
        data: { q, gradYear, status, seasonId: ctx.seasonId, teamId: ctx.teamId, sport },
      }),
    retry: false,
  });

  const all = (data?.athletes ?? []) as Record<string, any>[];
  const shown = flag ? all.filter((a) => flagsFor(a).includes(flag)) : all;
  const unverifiedTotal = all.reduce((n, a) => n + (a['unverified_count'] ?? 0), 0);

  return (
    <AppShell right={<AuthButton />}>
      {/* Same header language as the school pages: a lit plate, then the work. */}
      <div className="stadium-gradient flex flex-wrap items-end justify-between gap-4 rounded-2xl px-5 py-7 sm:px-8 sm:py-9">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-org-accent uppercase">
            {SPORT_LABEL[sport]} · your organization
          </p>
          <h1 className="font-display mt-2 text-[2rem] leading-[1.06] font-bold text-white sm:text-4xl">
            Your roster
          </h1>
          <p
            className="mt-2 text-sm text-white/75"
            title="These are your organization's players. College rosters are separate, verified data."
          >
            {(data?.athletes ?? []).length} player
            {(data?.athletes ?? []).length === 1 ? "" : "s"} in this season.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.canManage ? (
            <ActionLink to="/settings/seasons" tone="secondary">
              <CalendarRange className="size-4" aria-hidden /> Seasons &amp; teams
            </ActionLink>
          ) : null}
          <ActionLink to="/roster/import" tone="secondary">
            <Upload className="size-4" aria-hidden /> Import CSV
          </ActionLink>
          <ActionLink to="/roster/new">
            <Plus className="size-4" aria-hidden /> Add athlete
          </ActionLink>
        </div>
      </div>

      {/* Sport tabs: jump straight into either roster, with live counts. */}
      <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1">
        {SPORTS.map((option) => {
          const active = option === sport;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setSport(option)}
              className={
                active
                  ? "touch-target rounded-md bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
                  : "touch-target rounded-md px-4 text-sm font-semibold text-steel hover:text-graphite"
              }
            >
              {SPORT_LABEL[option]}
              <span className="ml-2 text-xs font-bold opacity-75">{mix?.[option] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <SeasonTeamPicker ctx={ctx} />
      </div>

      {ctx.teamId && ctx.teamId !== "__unassigned" ? <PacketShare teamId={ctx.teamId} /> : null}




      {unverifiedTotal > 0 ? (
        <button
          type="button"
          onClick={() => setFlag(flag === "unverified" ? "" : "unverified")}
          className="mt-6 flex w-full items-center justify-between gap-3 rounded-xl border border-diamond-green/40 bg-diamond-green-tint px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-diamond-green">
            {unverifiedTotal} self-reported number{unverifiedTotal === 1 ? "" : "s"} waiting for a coach check
          </span>
          <span className="text-xs font-bold text-diamond-green underline">
            {flag === "unverified" ? "Show all" : "Review"}
          </span>
        </button>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(["", ...FLAGS] as const).map((f) => {
          const count = f ? all.filter((a) => flagsFor(a).includes(f)).length : all.length;
          return (
            <button
              key={f || "all"}
              type="button"
              aria-pressed={flag === f}
              onClick={() => setFlag(f)}
              className={
                flag === f
                  ? "min-h-9 rounded-full bg-org-primary px-3 text-xs font-semibold text-org-primary-foreground"
                  : "min-h-9 rounded-full border border-border bg-card px-3 text-xs font-semibold text-steel"
              }
            >
              {f ? FLAG_LABEL[f] : "All"} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
        <label className="relative flex min-w-56 flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-steel" aria-hidden />
          <span className="sr-only">Search athletes by name</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name"
            className="touch-target w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-graphite outline-none focus:border-org-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-steel">
          Grad year
          <select
            value={gradYear}
            onChange={(event) => setGradYear(event.target.value)}
            className="touch-target rounded-lg border border-border bg-card px-3 text-sm text-graphite"
          >
            <option value="">All</option>
            {(data?.gradYears ?? []).map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-steel">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="touch-target rounded-lg border border-border bg-card px-3 text-sm text-graphite"
          >
            <option value="">All</option>
            {Object.entries(ATHLETE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(error as Error).message}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="bg-surface-2 font-mono text-[11px] tracking-wide text-steel uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Sport</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Grad year</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">B/T</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-steel">
                  Loading roster…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <EmptyState
                    icon={Users}
                    headline={q || gradYear ? "Nobody matches yet" : "Start your roster"}
                    className="border-0"
                    action={
                      <>
                        <ActionLink to="/roster/new">
                          <Plus className="size-4" aria-hidden /> Add athlete
                        </ActionLink>
                        <ActionLink to="/roster/import" tone="secondary">
                          <Upload className="size-4" aria-hidden /> Import CSV
                        </ActionLink>
                      </>
                    }
                  >
                    {q || gradYear
                      ? "Try a different name or grad year."
                      : "Add your players and their college boards start here."}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              shown.map((athlete) => (
                <tr key={athlete['id']} className="border-t border-border/70 transition-colors hover:bg-surface-2/70">
                  <td className="px-4 py-3 font-semibold text-graphite">
                    <Link
                      to="/roster/$id"
                      params={{ id: athlete['id'] }}
                      className="hover:text-org-primary hover:underline"
                    >
                      {athlete['name']}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-sm bg-sport-tint px-1.5 py-0.5 font-mono text-[11px] uppercase text-graphite">
                      {SPORT_LABEL[normalizeSport(athlete['sport'])]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-graphite">
                    {athlete['team_name'] ?? (
                      <span className="font-mono text-xs text-steel">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-graphite">{athlete['grad_year'] ?? "—"}</td>
                  <td className="px-4 py-3 text-graphite">{athlete['primary_position'] ?? "—"}</td>
                  <td className="px-4 py-3 text-graphite">
                    {athlete['bats'] ?? "—"}/{athlete['throws'] ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-steel">
                    {ATHLETE_STATUS_LABEL[
                      (athlete['status'] ?? "active") as keyof typeof ATHLETE_STATUS_LABEL
                    ] ?? "Active"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {flagsFor(athlete).map((f) => (
                        <span
                          key={f}
                          className={
                            f === "unverified"
                              ? "rounded-md border border-diamond-green/40 bg-diamond-green-tint px-1.5 py-0.5 text-[10px] font-bold text-diamond-green"
                              : "rounded-md border border-seam-red/30 bg-seam-red-tint px-1.5 py-0.5 text-[10px] font-bold text-seam-red"
                          }
                        >
                          {f === "unverified" ? `${athlete['unverified_count']} to verify` : FLAG_LABEL[f]}
                        </span>
                      ))}
                      {flagsFor(athlete).length === 0 ? (
                        <span className="font-mono text-[10px] text-steel">Ready</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}

          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
