/** Server-only: resolves audit_log record ids into human-readable labels. */
import { programLabel } from "./program-label";
import type { AuditRow } from "./audit-format";

type Row = AuditRow & { actor_id?: string | null };

async function idMap(
  supabase: any,
  table: string,
  ids: string[],
  select: string,
  toLabel: (row: any) => string,
): Promise<Map<string, { label: string; subject?: string | null; extra?: any }>> {
  const map = new Map<string, { label: string; subject?: string | null; extra?: any }>();
  if (!ids.length) return map;
  const { data } = await supabase.from(table).select(select).in("id", ids);
  for (const row of (data ?? []) as any[]) map.set(row.id, { label: toLabel(row), extra: row });
  return map;
}

export async function enrichAuditRows(supabase: any, rows: Row[]): Promise<AuditRow[]> {
  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.record_id) continue;
    const list = byTable.get(row.table_name) ?? [];
    list.push(row.record_id);
    byTable.set(row.table_name, list);
  }
  const ids = (table: string) => [...new Set(byTable.get(table) ?? [])];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])];

  const [
    actors,
    athletes,
    universities,
    programs,
    saved,
    notes,
    intel,
    teams,
    seasons,
    invites,
    majors,
    teamAthletes,
  ] = await Promise.all([
    actorIds.length
      ? supabase.from("users").select("id, name, email").in("id", actorIds)
      : Promise.resolve({ data: [] }),
    idMap(supabase, "org_athletes", ids("org_athletes"), "id, name", (r) => r.name),
    idMap(supabase, "universities", ids("universities"), "id, name", (r) => r.name),
    idMap(
      supabase,
      "programs",
      ids("programs"),
      "id, sport, governing_body, division, universities(name)",
      (r) => programLabel(r),
    ),
    idMap(
      supabase,
      "athlete_saved_schools",
      ids("athlete_saved_schools"),
      "id, programs(sport, governing_body, division, universities(name)), org_athletes(name)",
      (r) => programLabel(r.programs),
    ),
    idMap(
      supabase,
      "org_player_notes",
      ids("org_player_notes"),
      "id, org_athletes(name)",
      (r) => r.org_athletes?.name ?? "an athlete",
    ),
    idMap(
      supabase,
      "recruiting_intelligence",
      ids("recruiting_intelligence"),
      "id, programs(sport, governing_body, division, universities(name))",
      (r) => programLabel(r.programs),
    ),
    idMap(supabase, "teams", ids("teams"), "id, name", (r) => r.name),
    idMap(supabase, "seasons", ids("seasons"), "id, name", (r) => r.name),
    idMap(supabase, "org_member_invites", ids("org_member_invites"), "id, email", (r) => r.email),
    idMap(supabase, "majors", ids("majors"), "id, name", (r) => r.name),
    idMap(
      supabase,
      "team_athletes",
      ids("team_athletes"),
      "id, teams(name), org_athletes(name)",
      (r) => r.teams?.name ?? "a team",
    ),
  ]);

  const actorMap = new Map<string, string>();
  for (const a of ((actors as any).data ?? []) as any[]) {
    actorMap.set(a.id, a.name || a.email || "Unknown user");
  }

  const lookups: Record<string, Map<string, { label: string; extra?: any }>> = {
    org_athletes: athletes,
    universities,
    programs,
    athlete_saved_schools: saved,
    org_player_notes: notes,
    recruiting_intelligence: intel,
    teams,
    seasons,
    org_member_invites: invites,
    majors,
    team_athletes: teamAthletes,
  };

  return rows.map((row) => {
    const hit = row.record_id ? lookups[row.table_name]?.get(row.record_id) : undefined;
    const extra = hit?.extra;
    const subject =
      extra?.org_athletes?.name ??
      (row.table_name === "org_athletes" ? (extra?.name ?? null) : null);
    return {
      ...row,
      actorLabel: row.actor_id ? (actorMap.get(row.actor_id) ?? "Unknown user") : "System",
      recordLabel: hit?.label ?? null,
      subjectLabel: subject ?? null,
    };
  });
}
