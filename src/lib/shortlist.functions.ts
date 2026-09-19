import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { regionOfState } from "@/lib/regions";


const str = (value: unknown) => String(value ?? "").trim();

export const SHORTLIST_STATUSES = [
  "researching",
  "contacted",
  "offered",
  "committed",
  "eliminated",
] as const;
export type ShortlistStatus = (typeof SHORTLIST_STATUSES)[number];

export const SHORTLIST_STATUS_LABEL: Record<ShortlistStatus, string> = {
  researching: "Researching",
  contacted: "Contacted",
  offered: "Offered",
  committed: "Committed",
  eliminated: "Eliminated",
};

type Ctx = { supabase: any; userId: string };

async function requireOrgActor(context: Ctx) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase.from("users").select("id, organization_id").eq("id", context.userId).maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const { actingOrgId } = await import("@/lib/acting-org");
  // Power Recruit staff inside an organization act on that organization.
  const acting = await actingOrgId(context, isSuperadmin);
  const isManager = (roleList.includes("org_admin") || roleList.includes("org_owner")) || roleList.includes("org_staff");
  const organizationId =
    acting ?? ((profile as { organization_id?: string | null } | null)?.organization_id ?? null);

  if (!isSuperadmin && !isManager) throw new Error("Forbidden: organization staff only");
  if (!isSuperadmin && !organizationId) {
    throw new Error("Forbidden: no organization on this account");
  }
  return { organizationId, isSuperadmin, isOrgAdmin: (roleList.includes("org_admin") || roleList.includes("org_owner")) };
}

function divisionBucket(row: { governing_body?: string | null; division?: string | null }) {
  const body = str(row.governing_body).toUpperCase();
  const division = str(row.division).toUpperCase().replace(/\s|-/g, "");
  if (body === "NAIA") return "NAIA";
  if (body === "NJCAA") return "JUCO";
  if (division.includes("III") || division === "D3") return "D3";
  if (division.includes("II") || division === "D2") return "D2";
  if (division.includes("I") || division === "D1") return "D1";
  return "Other";
}

export const DIVISION_BUCKETS = ["D1", "D2", "D3", "NAIA", "JUCO", "Other"] as const;

/* ------------------------------------------------------------------ */
/* Athlete picker (search / profile "Save to shortlist")               */
/* ------------------------------------------------------------------ */

export const listAthletePicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await requireOrgActor(context as any);
    let query = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position, sport")
      .order("name", { ascending: true });
    if (actor.organizationId) query = query.eq("organization_id", actor.organizationId);

    const { data: athletes, error } = await query;
    if (error) throw new Error(error.message);

    const ids = ((athletes ?? []) as { id: string }[]).map((a) => a.id);
    let saved: { org_athlete_id: string; program_id: string; status: string }[] = [];
    if (ids.length) {
      const { data: rows } = await context.supabase
        .from("athlete_saved_schools")
        .select("org_athlete_id, program_id, status")
        .in("org_athlete_id", ids);
      saved = (rows ?? []) as typeof saved;
    }

    return {
      athletes: (athletes ?? []) as Record<string, any>[],
      saved,
    };
  });

/* ------------------------------------------------------------------ */
/* Shortlist writes                                                    */
/* ------------------------------------------------------------------ */

export const saveSchoolToShortlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; programId: string; status?: string }) => ({
    athleteId: str(input?.athleteId),
    programId: str(input?.programId),
    status: (SHORTLIST_STATUSES as readonly string[]).includes(str(input?.status))
      ? (str(input?.status) as ShortlistStatus)
      : ("researching" as ShortlistStatus),
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    if (!data.athleteId) throw new Error("Select an athlete first");
    if (!data.programId) throw new Error("Missing program");

    // A softball player's list only holds softball programs, and the other way
    // round. Say so plainly rather than saving a mismatch.
    const [{ data: athleteRow }, { data: programRow }] = await Promise.all([
      context.supabase.from("org_athletes").select("name, sport").eq("id", data.athleteId).maybeSingle(),
      context.supabase.from("programs").select("sport").eq("id", data.programId).maybeSingle(),
    ]);
    const athleteSport = (athleteRow as { sport?: string } | null)?.sport ?? null;
    const programSport = (programRow as { sport?: string } | null)?.sport ?? null;
    if (athleteSport && programSport && athleteSport !== programSport) {
      const who = (athleteRow as { name?: string } | null)?.name ?? "That athlete";
      throw new Error(`${who} is a ${athleteSport} player — that's a ${programSport} program.`);
    }

    const { data: existing, error: readError } = await context.supabase
      .from("athlete_saved_schools")
      .select("id, status")
      .eq("org_athlete_id", data.athleteId)
      .eq("program_id", data.programId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    if (existing) {
      return { id: (existing as any).id, status: (existing as any).status, created: false };
    }

    const { data: row, error } = await context.supabase
      .from("athlete_saved_schools")
      .insert({
        org_athlete_id: data.athleteId,
        program_id: data.programId,
        status: data.status,
        added_by_user_id: context.userId,
      })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id, status: (row as any).status, created: true };
  });

export const updateShortlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status?: string; notes?: string | null }) => ({
    id: str(input?.id),
    status: (SHORTLIST_STATUSES as readonly string[]).includes(str(input?.status))
      ? (str(input?.status) as ShortlistStatus)
      : null,
    notes: input?.notes === undefined ? null : (str(input?.notes) || null),
    touchNotes: input?.notes !== undefined,
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const patch: { status?: ShortlistStatus; notes?: string | null } = {};
    if (data.status) patch.status = data.status;
    if (data.touchNotes) patch.notes = data.notes;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeShortlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Staff dashboard aggregates                                          */
/* ------------------------------------------------------------------ */

export const getOrgDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seasonId?: string; teamId?: string } | undefined) => ({
    seasonId: str(input?.seasonId),
    teamId: str(input?.teamId),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);

    let athleteQuery = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position, status, organization_id")
      .order("grad_year", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (actor.organizationId) athleteQuery = athleteQuery.eq("organization_id", actor.organizationId);

    const { data: athleteRows, error } = await athleteQuery;
    if (error) throw new Error(error.message);
    let athletes = (athleteRows ?? []) as Record<string, any>[];

    // Season scoping is an assignment lookup, so an athlete's own record and
    // shortlist stay intact across every season they're in the program.
    let teamNameByAthlete = new Map<string, string>();
    if (data.seasonId) {
      const { data: assignments, error: assignError } = await context.supabase
        .from("team_athletes")
        .select("org_athlete_id, team_id, teams(name)")
        .eq("season_id", data.seasonId);
      if (assignError) throw new Error(assignError.message);
      const rows = (assignments ?? []) as Record<string, any>[];
      const allowed = new Set(
        rows
          .filter((r) => !data.teamId || r['team_id'] === data.teamId)
          .map((r) => r['org_athlete_id'] as string),
      );
      teamNameByAthlete = new Map(
        rows.map((r) => [r['org_athlete_id'] as string, (r['teams']?.name ?? "") as string]),
      );
      athletes = athletes.filter((a) => allowed.has(a['id'] as string));
    }

    const ids = athletes.map((a) => a['id'] as string);


    let orgName: string | null = null;
    if (actor.organizationId) {
      const { data: org } = await context.supabase
        .from("organizations")
        .select("name")
        .eq("id", actor.organizationId)
        .maybeSingle();
      orgName = (org as { name?: string } | null)?.name ?? null;
    }

    let saved: Record<string, any>[] = [];
    if (ids.length) {
      const { data: rows, error: savedError } = await context.supabase
        .from("athlete_saved_schools")
        .select(
          "id, status, org_athlete_id, program_id, programs(id, sport, division, governing_body, universities(name, state, region))",
        )
        .in("org_athlete_id", ids);
      if (savedError) throw new Error(savedError.message);
      saved = (rows ?? []) as Record<string, any>[];
    }

    const emptyCounts = () =>
      Object.fromEntries(SHORTLIST_STATUSES.map((s) => [s, 0])) as Record<ShortlistStatus, number>;

    const byAthlete = new Map<string, Record<ShortlistStatus, number>>();
    const byDivision: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    const byStatus = emptyCounts();

    for (const row of saved) {
      const status = row['status'] as ShortlistStatus;
      const athleteId = row['org_athlete_id'] as string;
      if (!byAthlete.has(athleteId)) byAthlete.set(athleteId, emptyCounts());
      const bucket = byAthlete.get(athleteId)!;
      bucket[status] = (bucket[status] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const program = row['programs'] ?? {};
      const division = divisionBucket(program);
      byDivision[division] = (byDivision[division] ?? 0) + 1;

      const university = program?.universities ?? {};
      // One shared definition of region, derived from the school's state.
      const region = regionOfState(university?.state) ?? "Unspecified";
      byRegion[region] = (byRegion[region] ?? 0) + 1;

    }

    return {
      orgName,
      athletes: athletes.map((athlete) => ({
        id: athlete['id'],
        name: athlete['name'],
        gradYear: athlete['grad_year'],
        position: athlete['primary_position'],
        status: (athlete['status'] ?? "active") as string,
        teamName: teamNameByAthlete.get(athlete['id'] as string) ?? null,
        counts: byAthlete.get(athlete['id'] as string) ?? emptyCounts(),
        total: Object.values(byAthlete.get(athlete['id'] as string) ?? emptyCounts()).reduce(
          (sum, n) => sum + n,
          0,
        ),
      })),

      totals: {
        athletes: athletes.length,
        savedSchools: saved.length,
        offers: byStatus['offered'],
        commits: byStatus['committed'],
      },
      byStatus,
      byDivision,
      byRegion: Object.entries(byRegion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label, count })),
      gradYears: Array.from(
        new Set(athletes.map((a) => a['grad_year']).filter((y) => y !== null && y !== undefined)),
      ).sort((a, b) => Number(a) - Number(b)),
    };
  });
