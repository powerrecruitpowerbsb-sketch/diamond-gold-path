import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSeasonContext } from "@/lib/seasons.functions";

const SEASON_KEY = "pr.season";
const TEAM_KEY = "pr.team";

/**
 * One source of truth for "which season / team am I looking at". The choice is
 * remembered per browser so staff don't re-pick it on every screen, and it
 * falls back to the organization's active season.
 */
export function useSeasonContext() {
  const contextFn = useServerFn(getSeasonContext);
  const { data, isPending, error } = useQuery({
    queryKey: ["season-context"],
    queryFn: () => contextFn(),
    retry: false,
    staleTime: 60_000,
  });

  const [seasonId, setSeasonIdState] = useState<string>("");
  const [teamId, setTeamIdState] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSeasonIdState(window.localStorage.getItem(SEASON_KEY) ?? "");
    setTeamIdState(window.localStorage.getItem(TEAM_KEY) ?? "");
  }, []);

  const seasons = data?.seasons ?? [];
  const resolvedSeasonId = useMemo(() => {
    if (seasonId && seasons.some((s) => s.id === seasonId)) return seasonId;
    return data?.activeSeasonId ?? seasons[0]?.id ?? "";
  }, [seasonId, seasons, data?.activeSeasonId]);

  const teams = useMemo(
    () => (data?.teams ?? []).filter((team) => team.seasonId === resolvedSeasonId),
    [data?.teams, resolvedSeasonId],
  );

  const resolvedTeamId = useMemo(() => {
    if (teamId === "__unassigned") return teamId;
    if (teamId && teams.some((t) => t.id === teamId)) return teamId;
    return "";
  }, [teamId, teams]);

  function setSeasonId(next: string) {
    setSeasonIdState(next);
    setTeamIdState("");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SEASON_KEY, next);
      window.localStorage.removeItem(TEAM_KEY);
    }
  }

  function setTeamId(next: string) {
    setTeamIdState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(TEAM_KEY, next);
  }

  const season = seasons.find((s) => s.id === resolvedSeasonId) ?? null;

  return {
    isPending,
    error: error as Error | null,
    seasons,
    teams,
    season,
    seasonId: resolvedSeasonId,
    teamId: resolvedTeamId,
    setSeasonId,
    setTeamId,
    canManage: Boolean(data?.canManage),
    orgWideAccess: Boolean(data?.orgWideAccess),
    hasSeasons: seasons.length > 0,
  };
}
