import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ATHLETE_STATUSES, type AthleteStatus } from "@/lib/season-constants";

const str = (value: unknown) => String(value ?? "").trim();
const nullable = (value: unknown) => {
  const out = str(value);
  return out === "" ? null : out;
};

export type { AthleteStatus };


type Ctx = { supabase: any; userId: string };

/**
 * Seasons and teams are organization structure: read is open to any member of
 * the org, but only admins may reshape it. RLS enforces the same split — this
 * gives the UI a clean error instead of an empty write.
 */
async function requireOrgActor(context: Ctx, opts?: { adminOnly?: boolean }) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, organization_id, org_wide_access")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const { actingOrgId } = await import("@/lib/acting-org");
  // Power Recruit staff inside an organization act on that organization.
  const acting = await actingOrgId(context, isSuperadmin);
  const isOrgAdmin = (roleList.includes("org_admin") || roleList.includes("org_owner"));
  const isManager = isOrgAdmin || roleList.includes("org_staff");
  const organizationId =
    acting ?? ((profile as { organization_id?: string | null } | null)?.organization_id ?? null);

  if (!isSuperadmin && !isManager) throw new Error("Forbidden: organization staff only");
  if (!isSuperadmin && !organizationId) throw new Error("Forbidden: no organization on this account");
  if (opts?.adminOnly && !isSuperadmin && !isOrgAdmin) {
    throw new Error("Only organization admins can change seasons and teams");
  }

  return {
    organizationId,
    isSuperadmin,
    isOrgAdmin,
    orgWideAccess:
      Boolean((profile as { org_wide_access?: boolean } | null)?.org_wide_access) ||
      isOrgAdmin ||
      isSuperadmin,
  };
}

/* ------------------------------------------------------------------ */
/* Season + team context (drives the season/team picker everywhere)     */
/* ------------------------------------------------------------------ */

export const getSeasonContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await requireOrgActor(context as any);

    let seasonQuery = context.supabase
      .from("seasons")
      .select("id, name, start_date, end_date, is_active, is_archived, organization_id")
      .order("is_active", { ascending: false })
      .order("name", { ascending: false });
    if (actor.organizationId) seasonQuery = seasonQuery.eq("organization_id", actor.organizationId);
    const { data: seasons, error } = await seasonQuery;
    if (error) throw new Error(error.message);

    let teamQuery = context.supabase
      .from("teams")
      .select("id, name, age_group, season_id, head_coach_user_id")
      .order("name");
    if (actor.organizationId) teamQuery = teamQuery.eq("organization_id", actor.organizationId);
    const { data: allTeams, error: teamError } = await teamQuery;
    if (teamError) throw new Error(teamError.message);

    // Coaches without org-wide access only pick from teams they actually coach.
    let coachedTeamIds: string[] = [];
    if (!actor.orgWideAccess) {
      const { data: assignments } = await context.supabase
        .from("team_coaches")
        .select("team_id")
        .eq("user_id", context.userId);
      coachedTeamIds = ((assignments ?? []) as { team_id: string }[]).map((r) => r.team_id);
    }

    const teams = ((allTeams ?? []) as Record<string, any>[])
      .filter(
        (team) =>
          actor.orgWideAccess ||
          coachedTeamIds.includes(team['id'] as string) ||
          team['head_coach_user_id'] === context.userId,
      )
      .map((team) => ({
        id: team['id'] as string,
        name: team['name'] as string,
        ageGroup: (team['age_group'] ?? null) as string | null,
        seasonId: team['season_id'] as string,
      }));

    const seasonRows = ((seasons ?? []) as Record<string, any>[]).map((season) => ({
      id: season['id'] as string,
      name: season['name'] as string,
      startDate: (season['start_date'] ?? null) as string | null,
      endDate: (season['end_date'] ?? null) as string | null,
      isActive: Boolean(season['is_active']),
      isArchived: Boolean(season['is_archived']),
    }));

    return {
      seasons: seasonRows,
      activeSeasonId: seasonRows.find((s) => s.isActive)?.id ?? null,
      teams,
      canManage: actor.isOrgAdmin || actor.isSuperadmin,
      orgWideAccess: actor.orgWideAccess,
    };
  });

/* ------------------------------------------------------------------ */
/* Season management                                                   */
/* ------------------------------------------------------------------ */

export const saveSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      name: string;
      startDate?: string | null;
      endDate?: string | null;
      makeActive?: boolean;
    }) => ({
      id: nullable(input?.id),
      name: str(input?.name),
      startDate: nullable(input?.startDate),
      endDate: nullable(input?.endDate),
      makeActive: Boolean(input?.makeActive),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });
    if (!data.name) throw new Error("Season name is required");
    const orgId = actor.organizationId;
    if (!orgId) throw new Error("Select an organization first");

    const values = {
      name: data.name,
      start_date: data.startDate,
      end_date: data.endDate,
    };

    let id = data.id;
    if (id) {
      const { error } = await context.supabase.from("seasons").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("seasons")
        .insert({ ...values, organization_id: orgId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = (inserted as { id: string }).id;
    }

    if (data.makeActive) await activate(context as any, orgId, id!);
    return { id: id! };
  });

/** Only one season per org can be active — clear the rest first. */
async function activate(context: Ctx, orgId: string, seasonId: string) {
  const { error: clearError } = await context.supabase
    .from("seasons")
    .update({ is_active: false })
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (clearError) throw new Error(clearError.message);
  const { error } = await context.supabase
    .from("seasons")
    .update({ is_active: true, is_archived: false })
    .eq("id", seasonId);
  if (error) throw new Error(error.message);
}

export const activateSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });
    if (!actor.organizationId) throw new Error("Select an organization first");
    await activate(context as any, actor.organizationId, data.id);
    return { ok: true };
  });

export const setSeasonArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; archived: boolean }) => ({
    id: str(input?.id),
    archived: Boolean(input?.archived),
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any, { adminOnly: true });
    const patch: Record<string, unknown> = { is_archived: data.archived };
    if (data.archived) patch['is_active'] = false;
    const { error } = await context.supabase.from("seasons").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any, { adminOnly: true });
    const { error } = await context.supabase.from("seasons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Team management                                                     */
/* ------------------------------------------------------------------ */

export const getSeasonDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seasonId: string }) => ({ seasonId: str(input?.seasonId) }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    if (!data.seasonId) return { season: null, teams: [], unassigned: [], staff: [] };

    const { data: season, error } = await context.supabase
      .from("seasons")
      .select("id, name, start_date, end_date, is_active, is_archived")
      .eq("id", data.seasonId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!season) throw new Error("Season not found");

    const [{ data: teams }, { data: assignments }, { data: coaches }, { data: staff }] =
      await Promise.all([
        context.supabase
          .from("teams")
          .select("id, name, age_group, head_coach_user_id")
          .eq("season_id", data.seasonId)
          .order("name"),
        context.supabase
          .from("team_athletes")
          .select("id, team_id, org_athlete_id, jersey_number")
          .eq("season_id", data.seasonId),
        context.supabase.from("team_coaches").select("id, team_id, user_id, role"),
        context.supabase
          .from("users")
          .select("id, name, email, user_type, org_wide_access")
          .in("user_type", ["org_admin", "org_staff"]),
      ]);

    let athleteQuery = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position, status")
      .order("name");
    if (actor.organizationId) athleteQuery = athleteQuery.eq("organization_id", actor.organizationId);
    const { data: athletes } = await athleteQuery;

    const athleteRows = (athletes ?? []) as Record<string, any>[];
    const assignmentRows = (assignments ?? []) as Record<string, any>[];
    const coachRows = (coaches ?? []) as Record<string, any>[];
    const staffRows = (staff ?? []) as Record<string, any>[];
    const byId = new Map(athleteRows.map((a) => [a['id'] as string, a]));

    const teamRows = ((teams ?? []) as Record<string, any>[]).map((team) => {
      const teamId = team['id'] as string;
      return {
        id: teamId,
        name: team['name'] as string,
        ageGroup: (team['age_group'] ?? null) as string | null,
        headCoachUserId: (team['head_coach_user_id'] ?? null) as string | null,
        coaches: coachRows
          .filter((c) => c['team_id'] === teamId)
          .map((c) => ({
            id: c['id'] as string,
            userId: c['user_id'] as string,
            name:
              (staffRows.find((s) => s['id'] === c['user_id'])?.['name'] as string | undefined) ??
              (staffRows.find((s) => s['id'] === c['user_id'])?.['email'] as string | undefined) ??
              "Coach",
          })),
        athletes: assignmentRows
          .filter((a) => a['team_id'] === teamId)
          .map((a) => {
            const athlete = byId.get(a['org_athlete_id'] as string);
            return {
              assignmentId: a['id'] as string,
              athleteId: a['org_athlete_id'] as string,
              jersey: (a['jersey_number'] ?? null) as string | null,
              name: (athlete?.['name'] ?? "Unknown athlete") as string,
              gradYear: (athlete?.['grad_year'] ?? null) as number | null,
              position: (athlete?.['primary_position'] ?? null) as string | null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    const assignedIds = new Set(assignmentRows.map((a) => a['org_athlete_id'] as string));

    return {
      season: {
        id: season['id'] as string,
        name: season['name'] as string,
        startDate: (season['start_date'] ?? null) as string | null,
        endDate: (season['end_date'] ?? null) as string | null,
        isActive: Boolean(season['is_active']),
        isArchived: Boolean(season['is_archived']),
      },
      teams: teamRows,
      unassigned: athleteRows
        .filter((a) => !assignedIds.has(a['id'] as string) && a['status'] === "active")
        .map((a) => ({
          athleteId: a['id'] as string,
          name: a['name'] as string,
          gradYear: (a['grad_year'] ?? null) as number | null,
          position: (a['primary_position'] ?? null) as string | null,
        })),
      staff: staffRows.map((s) => ({
        id: s['id'] as string,
        name: (s['name'] ?? s['email'] ?? "Staff member") as string,
        email: (s['email'] ?? null) as string | null,
        role: s['user_type'] as string,
        orgWideAccess: Boolean(s['org_wide_access']),
      })),
      canManage: actor.isOrgAdmin || actor.isSuperadmin,
    };
  });

export const saveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      seasonId: string;
      name: string;
      ageGroup?: string | null;
      headCoachUserId?: string | null;
    }) => ({
      id: nullable(input?.id),
      seasonId: str(input?.seasonId),
      name: str(input?.name),
      ageGroup: nullable(input?.ageGroup),
      headCoachUserId: nullable(input?.headCoachUserId),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });
    if (!data.name) throw new Error("Team name is required");
    if (!data.seasonId) throw new Error("Pick a season for this team");
    const orgId = actor.organizationId;
    if (!orgId) throw new Error("Select an organization first");

    const values = {
      name: data.name,
      age_group: data.ageGroup,
      head_coach_user_id: data.headCoachUserId,
    };

    if (data.id) {
      const { error } = await context.supabase.from("teams").update(values).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("teams")
      .insert({ ...values, season_id: data.seasonId, organization_id: orgId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any, { adminOnly: true });
    const { error } = await context.supabase.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTeamCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; userId: string; assigned: boolean }) => ({
    teamId: str(input?.teamId),
    userId: str(input?.userId),
    assigned: Boolean(input?.assigned),
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any, { adminOnly: true });
    if (data.assigned) {
      const { error } = await context.supabase
        .from("team_coaches")
        .upsert(
          { team_id: data.teamId, user_id: data.userId, role: "coach" },
          { onConflict: "team_id,user_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("team_coaches")
        .delete()
        .eq("team_id", data.teamId)
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setOrgWideAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; enabled: boolean }) => ({
    userId: str(input?.userId),
    enabled: Boolean(input?.enabled),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });
    let query = context.supabase
      .from("users")
      .update({ org_wide_access: data.enabled })
      .eq("id", data.userId);
    if (actor.organizationId) query = query.eq("organization_id", actor.organizationId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Athlete <-> team assignment                                         */
/* ------------------------------------------------------------------ */

export const assignAthleteToTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      athleteId: string;
      seasonId: string;
      teamId?: string | null;
      jersey?: string | null;
    }) => ({
      athleteId: str(input?.athleteId),
      seasonId: str(input?.seasonId),
      teamId: nullable(input?.teamId),
      jersey: nullable(input?.jersey),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    if (!data.athleteId || !data.seasonId) throw new Error("Athlete and season are required");

    // No team means "not on a roster this season" — remove the assignment.
    if (!data.teamId) {
      const { error } = await context.supabase
        .from("team_athletes")
        .delete()
        .eq("season_id", data.seasonId)
        .eq("org_athlete_id", data.athleteId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { error } = await context.supabase.from("team_athletes").upsert(
      {
        season_id: data.seasonId,
        team_id: data.teamId,
        org_athlete_id: data.athleteId,
        jersey_number: data.jersey,
      },
      { onConflict: "season_id,org_athlete_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAthleteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; status: AthleteStatus }) => {
    const status = str(input?.status) as AthleteStatus;
    if (!ATHLETE_STATUSES.includes(status)) throw new Error("Unknown athlete status");
    return { athleteId: str(input?.athleteId), status };
  })
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { error } = await context.supabase
      .from("org_athletes")
      .update({ status: data.status })
      .eq("id", data.athleteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Season-by-season team history for one athlete — shown on their detail page. */
export const getAthleteSeasonHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string }) => ({ athleteId: str(input?.athleteId) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { data: rows, error } = await context.supabase
      .from("team_athletes")
      .select("id, jersey_number, teams(id, name, age_group), seasons(id, name, is_active, is_archived)")
      .eq("org_athlete_id", data.athleteId);
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Record<string, any>[])
      .map((row) => ({
        assignmentId: row['id'] as string,
        jersey: (row['jersey_number'] ?? null) as string | null,
        teamId: (row['teams']?.id ?? null) as string | null,
        teamName: (row['teams']?.name ?? null) as string | null,
        ageGroup: (row['teams']?.age_group ?? null) as string | null,
        seasonId: (row['seasons']?.id ?? null) as string | null,
        seasonName: (row['seasons']?.name ?? "") as string,
        isActiveSeason: Boolean(row['seasons']?.is_active),
        isArchivedSeason: Boolean(row['seasons']?.is_archived),
      }))
      .sort((a, b) => b.seasonName.localeCompare(a.seasonName));
  });

/* ------------------------------------------------------------------ */
/* Season rollover                                                     */
/* ------------------------------------------------------------------ */

export const getRolloverPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fromSeasonId: string }) => ({ fromSeasonId: str(input?.fromSeasonId) }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });

    const [{ data: teams }, { data: assignments }, { data: coaches }] = await Promise.all([
      context.supabase
        .from("teams")
        .select("id, name, age_group, head_coach_user_id")
        .eq("season_id", data.fromSeasonId)
        .order("name"),
      context.supabase
        .from("team_athletes")
        .select("team_id, org_athlete_id, jersey_number")
        .eq("season_id", data.fromSeasonId),
      context.supabase.from("team_coaches").select("team_id, user_id, role"),
    ]);

    let athleteQuery = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position, status")
      .eq("status", "active")
      .order("name");
    if (actor.organizationId) athleteQuery = athleteQuery.eq("organization_id", actor.organizationId);
    const { data: athletes, error } = await athleteQuery;
    if (error) throw new Error(error.message);

    const assignmentRows = (assignments ?? []) as Record<string, any>[];
    const coachRows = (coaches ?? []) as Record<string, any>[];
    const teamRows = ((teams ?? []) as Record<string, any>[]).map((team) => ({
      id: team['id'] as string,
      name: team['name'] as string,
      ageGroup: (team['age_group'] ?? null) as string | null,
      headCoachUserId: (team['head_coach_user_id'] ?? null) as string | null,
      coachUserIds: coachRows
        .filter((c) => c['team_id'] === team['id'])
        .map((c) => c['user_id'] as string),
      athleteCount: assignmentRows.filter((a) => a['team_id'] === team['id']).length,
    }));

    return {
      teams: teamRows,
      athletes: ((athletes ?? []) as Record<string, any>[]).map((a) => {
        const current = assignmentRows.find((r) => r['org_athlete_id'] === a['id']);
        return {
          athleteId: a['id'] as string,
          name: a['name'] as string,
          gradYear: (a['grad_year'] ?? null) as number | null,
          position: (a['primary_position'] ?? null) as string | null,
          currentTeamId: (current?.['team_id'] ?? null) as string | null,
          jersey: (current?.['jersey_number'] ?? null) as string | null,
        };
      }),
    };
  });

export const runRollover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      fromSeasonId: string;
      name: string;
      startDate?: string | null;
      endDate?: string | null;
      archiveSource?: boolean;
      teams: { key: string; name: string; ageGroup?: string | null; sourceTeamId?: string | null }[];
      athletes: { athleteId: string; teamKey?: string | null; status?: AthleteStatus }[];
    }) => ({
      fromSeasonId: str(input?.fromSeasonId),
      name: str(input?.name),
      startDate: nullable(input?.startDate),
      endDate: nullable(input?.endDate),
      archiveSource: input?.archiveSource !== false,
      teams: Array.isArray(input?.teams) ? input.teams.slice(0, 200) : [],
      athletes: Array.isArray(input?.athletes) ? input.athletes.slice(0, 5000) : [],
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any, { adminOnly: true });
    const orgId = actor.organizationId;
    if (!orgId) throw new Error("Select an organization first");
    if (!data.name) throw new Error("Name the new season");
    if (!data.teams.length) throw new Error("Keep at least one team for the new season");

    const { data: created, error } = await context.supabase
      .from("seasons")
      .insert({
        organization_id: orgId,
        name: data.name,
        start_date: data.startDate,
        end_date: data.endDate,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const seasonId = (created as { id: string }).id;

    try {
      // Copy the teams the admin kept, carrying coach assignments with them.
      const keyToTeamId = new Map<string, string>();
      for (const team of data.teams) {
        const name = str(team.name);
        if (!name) continue;
        let headCoach: string | null = null;
        let coachIds: string[] = [];
        if (team.sourceTeamId) {
          const [{ data: source }, { data: sourceCoaches }] = await Promise.all([
            context.supabase
              .from("teams")
              .select("head_coach_user_id")
              .eq("id", team.sourceTeamId)
              .maybeSingle(),
            context.supabase.from("team_coaches").select("user_id").eq("team_id", team.sourceTeamId),
          ]);
          headCoach = (source as { head_coach_user_id?: string | null } | null)
            ?.head_coach_user_id ?? null;
          coachIds = ((sourceCoaches ?? []) as { user_id: string }[]).map((r) => r.user_id);
        }

        const { data: insertedTeam, error: teamError } = await context.supabase
          .from("teams")
          .insert({
            organization_id: orgId,
            season_id: seasonId,
            name,
            age_group: nullable(team.ageGroup),
            head_coach_user_id: headCoach,
          })
          .select("id")
          .single();
        if (teamError) throw new Error(teamError.message);
        const newTeamId = (insertedTeam as { id: string }).id;
        keyToTeamId.set(str(team.key), newTeamId);

        if (coachIds.length) {
          const { error: coachError } = await context.supabase.from("team_coaches").insert(
            coachIds.map((userId) => ({ team_id: newTeamId, user_id: userId, role: "coach" })),
          );
          if (coachError) throw new Error(coachError.message);
        }
      }

      // Advance athletes. Status changes are athlete-level and outlive seasons.
      const assignmentRows: Record<string, unknown>[] = [];
      for (const athlete of data.athletes) {
        const status = (athlete.status ?? "active") as AthleteStatus;
        if (status !== "active") {
          const { error: statusError } = await context.supabase
            .from("org_athletes")
            .update({ status })
            .eq("id", athlete.athleteId);
          if (statusError) throw new Error(statusError.message);
          continue;
        }
        const teamId = athlete.teamKey ? keyToTeamId.get(str(athlete.teamKey)) : null;
        if (!teamId) continue;
        assignmentRows.push({
          season_id: seasonId,
          team_id: teamId,
          org_athlete_id: athlete.athleteId,
        });
      }
      if (assignmentRows.length) {
        const { error: assignError } = await context.supabase
          .from("team_athletes")
          .insert(assignmentRows as never);
        if (assignError) throw new Error(assignError.message);
      }

      await activate(context as any, orgId, seasonId);
      if (data.archiveSource && data.fromSeasonId) {
        const { error: archiveError } = await context.supabase
          .from("seasons")
          .update({ is_archived: true, is_active: false })
          .eq("id", data.fromSeasonId);
        if (archiveError) throw new Error(archiveError.message);
      }
    } catch (failure) {
      // Roll the whole season back so a half-built season never goes live.
      await context.supabase.from("seasons").delete().eq("id", seasonId);
      throw failure;
    }

    return { seasonId, teams: data.teams.length };
  });
