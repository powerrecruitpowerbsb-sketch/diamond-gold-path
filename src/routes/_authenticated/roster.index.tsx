import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarRange, Plus, Search as SearchIcon, Upload } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { SeasonTeamPicker } from "@/components/brand/SeasonTeamPicker";
import { useSeasonContext } from "@/hooks/use-season-context";
import { listOrgAthletes } from "@/lib/athletes.functions";
import { ATHLETE_STATUS_LABEL } from "@/lib/season-constants";


export const Route = createFileRoute("/_authenticated/roster/")({
  head: () => ({
    meta: [
      { title: "Athlete roster — Power Recruit" },
      {
        name: "description",
        content: "Your organization's athlete roster: graduation year, position, and recruiting research.",
      },
      { property: "og:title", content: "Athlete roster — Power Recruit" },
      {
        property: "og:description",
        content: "Manage your travel organization's athletes inside Power Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RosterScreen,
});

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  csv: "CSV import",
  handled: "Handled",
  curve_testing: "Curve Testing",
};

function RosterScreen() {
  const listFn = useServerFn(listOrgAthletes);
  const ctx = useSeasonContext();
  const [q, setQ] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [status, setStatus] = useState("active");

  const { data, isPending, error } = useQuery({
    queryKey: ["org-athletes", q, gradYear, status, ctx.seasonId, ctx.teamId],
    queryFn: () =>
      listFn({
        data: { q, gradYear, status, seasonId: ctx.seasonId, teamId: ctx.teamId },
      }),
    retry: false,
  });

  return (
    <AppShell right={<AuthButton />}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-org-primary">Your roster</h1>
          <p
            className="mt-1 text-sm text-steel"
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

      <div className="mt-6">
        <SeasonTeamPicker ctx={ctx} />
      </div>



      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
        <label className="relative flex min-w-56 flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-steel" aria-hidden />
          <span className="sr-only">Search athletes by name</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name"
            className="touch-target w-full rounded-lg border border-border bg-chalk pl-9 pr-3 text-sm text-graphite outline-none focus:border-org-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-steel">
          Grad year
          <select
            value={gradYear}
            onChange={(event) => setGradYear(event.target.value)}
            className="touch-target rounded-lg border border-border bg-white px-3 text-sm text-graphite"
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
            className="touch-target rounded-lg border border-border bg-white px-3 text-sm text-graphite"
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

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="bg-chalk font-mono text-[11px] tracking-wide text-steel uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Grad year</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">B/T</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-steel">
                  Loading roster…
                </td>
              </tr>
            ) : (data?.athletes ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-steel">
                  No athletes match this season and filter. Add one manually or import a CSV.
                </td>
              </tr>
            ) : (
              (data?.athletes ?? []).map((athlete) => (
                <tr key={athlete['id']} className="border-t border-border/70 hover:bg-chalk/60">
                  <td className="px-4 py-3 font-semibold text-graphite">
                    <Link
                      to="/roster/$id"
                      params={{ id: athlete['id'] }}
                      className="hover:text-org-primary hover:underline"
                    >
                      {athlete['name']}
                    </Link>
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
                  <td className="px-4 py-3 font-mono text-xs text-steel">
                    {SOURCE_LABELS[athlete['athlete_data_source'] as string] ??
                      athlete['athlete_data_source']}
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
