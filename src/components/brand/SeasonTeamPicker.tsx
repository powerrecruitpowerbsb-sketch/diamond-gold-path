import { Link } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";

import type { useSeasonContext } from "@/hooks/use-season-context";

type Ctx = ReturnType<typeof useSeasonContext>;

const CONTROL =
  "touch-target rounded-lg border border-border bg-card px-3 text-sm font-medium text-graphite outline-none focus:border-org-primary";

/**
 * Season + team scope selector. Coaches only ever see teams they're assigned
 * to, so the team list here is already filtered server-side.
 */
export function SeasonTeamPicker({ ctx, showTeam = true }: { ctx: Ctx; showTeam?: boolean }) {
  if (ctx.isPending) {
    return <p className="font-mono text-xs text-steel">Loading seasons…</p>;
  }

  if (!ctx.hasSeasons) {
    return (
      <div className="rounded-xl border border-org-accent/40 bg-org-accent/10 px-3 py-2 text-sm text-graphite">
        No seasons yet.{" "}
        {ctx.canManage ? (
          <Link to="/settings/seasons" className="font-semibold underline hover:text-org-primary">
            Create your first season
          </Link>
        ) : (
          "Ask an admin to set one up."
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-steel uppercase">
        <CalendarRange className="size-3.5" aria-hidden /> Season
      </span>
      <label>
        <span className="sr-only">Season</span>
        <select
          value={ctx.seasonId}
          onChange={(event) => ctx.setSeasonId(event.target.value)}
          className={CONTROL}
        >
          {ctx.seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.isActive ? " (active)" : season.isArchived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>

      {showTeam ? (
        <label>
          <span className="sr-only">Team</span>
          <select
            value={ctx.teamId}
            onChange={(event) => ctx.setTeamId(event.target.value)}
            className={CONTROL}
          >
            <option value="">All teams</option>
            {ctx.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
                {team.ageGroup ? ` · ${team.ageGroup}` : ""}
              </option>
            ))}
            {ctx.orgWideAccess ? <option value="__unassigned">Unassigned</option> : null}
          </select>
        </label>
      ) : null}

      {ctx.season?.isArchived ? (
        <span className="rounded-md bg-chalk px-2 py-1 font-mono text-[11px] text-steel">
          Archived season — read-only history
        </span>
      ) : null}
    </div>
  );
}
