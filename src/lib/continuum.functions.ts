import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { regionOfState } from "@/lib/regions";
import { SHORTLIST_STATUSES, type ShortlistStatus } from "@/lib/shortlist.functions";

const str = (value: unknown) => String(value ?? "").trim();

type Ctx = { supabase: any; userId: string };

export type Viewer = {
  userId: string;
  organizationId: string | null;
  roles: string[];
  isSuperadmin: boolean;
  isAdminLevel: boolean;
  isStaff: boolean;
  isFamily: boolean;
  linkedAthleteId: string | null;
};

/**
 * One viewer for the continuum: staff, parents and players all reach these
 * screens, and each of them may move a school for the athletes they can see.
 */
async function resolveViewer(context: Ctx): Promise<Viewer> {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, organization_id, linked_org_athlete_id")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roles.includes("superadmin");
  const { actingOrgId } = await import("@/lib/acting-org");
  const acting = await actingOrgId(context, isSuperadmin);
  const organizationId =
    acting ?? ((profile as { organization_id?: string | null } | null)?.organization_id ?? null);

  return {
    userId: context.userId,
    organizationId,
    roles,
    isSuperadmin,
    isAdminLevel: roles.includes("org_owner") || roles.includes("org_admin"),
    isStaff:
      isSuperadmin ||
      roles.includes("org_owner") ||
      roles.includes("org_admin") ||
      roles.includes("org_staff"),
    isFamily: roles.includes("parent") || roles.includes("player"),
    linkedAthleteId:
      (profile as { linked_org_athlete_id?: string | null } | null)?.linked_org_athlete_id ?? null,
  };
}

export const getContinuumViewer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const viewer = await resolveViewer(context as any);
    return {
      organizationId: viewer.organizationId,
      isSuperadmin: viewer.isSuperadmin,
      isAdminLevel: viewer.isAdminLevel,
      isStaff: viewer.isStaff,
      isFamily: viewer.isFamily,
    };
  });

/** Athletes this viewer may work with: the whole roster for staff, their own for a family. */
async function visibleAthletes(context: Ctx, viewer: Viewer) {
  if (viewer.isStaff) {
    let query = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position, organization_id")
      .order("name", { ascending: true });
    if (viewer.organizationId) query = query.eq("organization_id", viewer.organizationId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, any>[];
  }

  const ids = new Set<string>();
  if (viewer.linkedAthleteId) ids.add(viewer.linkedAthleteId);
  const { data: links } = await context.supabase
    .from("athlete_family_links")
    .select("org_athlete_id")
    .eq("user_id", viewer.userId);
  for (const row of (links ?? []) as { org_athlete_id: string }[]) ids.add(row.org_athlete_id);
  if (!ids.size) return [];

  const { data, error } = await context.supabase
    .from("org_athletes")
    .select("id, name, grad_year, primary_position, organization_id")
    .in("id", Array.from(ids))
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, any>[];
}

/* ------------------------------------------------------------------ */
/* Stage settings                                                      */
/* ------------------------------------------------------------------ */

export const listStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const viewer = await resolveViewer(context as any);
    let query = context.supabase
      .from("continuum_stages")
      .select("id, organization_id, name, sort_order, maps_to, is_default, is_active")
      .order("sort_order", { ascending: true });
    if (viewer.organizationId) query = query.eq("organization_id", viewer.organizationId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return {
      canEdit: viewer.isAdminLevel || viewer.isSuperadmin,
      stages: (data ?? []) as Record<string, any>[],
    };
  });

export const saveStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      name: string;
      sortOrder?: number;
      mapsTo?: string;
      isActive?: boolean;
    }) => ({
      id: str(input?.id) || null,
      name: str(input?.name),
      sortOrder: Number(input?.sortOrder ?? 0),
      mapsTo: (SHORTLIST_STATUSES as readonly string[]).includes(str(input?.mapsTo))
        ? (str(input?.mapsTo) as ShortlistStatus)
        : ("researching" as ShortlistStatus),
      isActive: input?.isActive !== false,
    }),
  )
  .handler(async ({ context, data }) => {
    const viewer = await resolveViewer(context as any);
    if (!viewer.isAdminLevel && !viewer.isSuperadmin) {
      throw new Error("Only an owner or admin can change the stages");
    }
    if (!data.name) throw new Error("Give the stage a name");
    if (!viewer.organizationId) throw new Error("Enter an organization first");

    if (data.id) {
      const { error } = await context.supabase
        .from("continuum_stages")
        .update({ name: data.name, sort_order: data.sortOrder, is_active: data.isActive })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("continuum_stages")
      .insert({
        organization_id: viewer.organizationId,
        name: data.name,
        sort_order: data.sortOrder,
        maps_to: data.mapsTo,
        is_active: data.isActive,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const viewer = await resolveViewer(context as any);
    if (!viewer.isAdminLevel && !viewer.isSuperadmin) {
      throw new Error("Only an owner or admin can change the stages");
    }
    const { data: stage } = await context.supabase
      .from("continuum_stages")
      .select("id, is_default")
      .eq("id", data.id)
      .maybeSingle();
    if (!stage) throw new Error("That stage is already gone");
    if ((stage as any).is_default) throw new Error("The five default stages cannot be removed");

    const { count } = await context.supabase
      .from("athlete_saved_schools")
      .select("id", { count: "exact", head: true })
      .eq("org_stage_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Move the schools out of that stage first");
    }
    const { error } = await context.supabase.from("continuum_stages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* The college list                                                    */
/* ------------------------------------------------------------------ */

export const getCollegeList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId?: string } | undefined) => ({
    athleteId: str(input?.athleteId) || null,
  }))
  .handler(async ({ context, data }) => {
    const viewer = await resolveViewer(context as any);
    const athletes = await visibleAthletes(context as any, viewer);

    // Staff default to every athlete at once; a family only ever has their own.
    const wantsAll = data.athleteId === "all" || (!data.athleteId && viewer.isStaff);
    const athleteId = wantsAll
      ? "all"
      : ((data.athleteId && athletes.find((a) => a['id'] === data.athleteId)?.['id']) ??
        (athletes[0]?.['id'] as string | undefined) ??
        null);

    const targetIds = (
      athleteId === "all" ? athletes.map((a) => a['id'] as string) : athleteId ? [athleteId] : []
    ).filter(Boolean);

    const orgId =
      (athletes.find((a) => a['id'] === athleteId)?.['organization_id'] as string | undefined) ??
      (athletes[0]?.['organization_id'] as string | undefined) ??
      viewer.organizationId;

    let stages: Record<string, any>[] = [];
    if (orgId) {
      const { data: stageRows } = await context.supabase
        .from("continuum_stages")
        .select("id, name, sort_order, maps_to, is_default, is_active")
        .eq("organization_id", orgId)
        .order("sort_order", { ascending: true });
      stages = (stageRows ?? []) as Record<string, any>[];
    }

    let entries: Record<string, any>[] = [];
    if (targetIds.length) {
      const { data: rows, error } = await context.supabase
        .from("athlete_saved_schools")
        .select("id, status, notes, org_stage_id, program_id, org_athlete_id, created_at, updated_at")
        .in("org_athlete_id", targetIds)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const saved = (rows ?? []) as Record<string, any>[];

      let programs: Record<string, any>[] = [];
      if (saved.length) {
        const { data: progs } = await context.supabase
          .from("programs")
          .select(
            "id, sport, division, governing_body, conference, head_coach_name, universities(name, state, city, est_net_price)",
          )
          .in(
            "id",
            saved.map((r) => r['program_id']),
          );
        programs = (progs ?? []) as Record<string, any>[];
      }

      const { data: threads } = await context.supabase
        .from("message_threads")
        .select("id, program_id, org_athlete_id, last_message_at")
        .in("org_athlete_id", targetIds);
      const threadKey = (athlete: unknown, program: unknown) => `${athlete}:${program}`;
      const threadsByPair = new Map(
        ((threads ?? []) as Record<string, any>[]).map((t) => [
          threadKey(t['org_athlete_id'], t['program_id']),
          t,
        ]),
      );

      entries = saved.map((row) => {
        const program = programs.find((p) => p['id'] === row['program_id']) ?? {};
        const university = (program as any)?.universities ?? {};
        const athlete = athletes.find((a) => a['id'] === row['org_athlete_id']) ?? {};
        const thread =
          threadsByPair.get(threadKey(row['org_athlete_id'], row['program_id'])) ?? null;
        return {
          id: row['id'],
          programId: row['program_id'],
          athleteId: row['org_athlete_id'],
          athleteName: athlete['name'] ?? "Athlete",
          athleteGradYear: athlete['grad_year'] ?? null,
          stageId: row['org_stage_id'],
          status: row['status'],
          notes: row['notes'],
          sport: program['sport'] ?? null,
          governingBody: program['governing_body'] ?? null,
          division: program['division'] ?? null,
          conference: program['conference'] ?? null,
          headCoach: program['head_coach_name'] ?? null,
          school: university?.name ?? "Unknown school",
          state: university?.state ?? null,
          city: university?.city ?? null,
          netPrice: university?.est_net_price ?? null,
          region: regionOfState(university?.state) ?? null,
          threadId: thread?.['id'] ?? null,
          lastMessageAt: thread?.['last_message_at'] ?? null,
          updatedAt: row['updated_at'] ?? row['created_at'] ?? null,
        };
      });
    }


    return {
      viewer: {
        isStaff: viewer.isStaff,
        isAdminLevel: viewer.isAdminLevel,
        isFamily: viewer.isFamily,
      },
      athletes: athletes.map((a) => ({
        id: a['id'],
        name: a['name'],
        gradYear: a['grad_year'],
        position: a['primary_position'],
      })),
      athleteId,
      stages,
      entries,
    };
  });

/** Moving a school is open to staff, parents and the player — access rules decide. */
export const moveToStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string; stageId: string }) => ({
    entryId: str(input?.entryId),
    stageId: str(input?.stageId),
  }))
  .handler(async ({ context, data }) => {
    if (!data.entryId || !data.stageId) throw new Error("Pick a stage");
    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .update({ org_stage_id: data.stageId })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEntryNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string; notes: string | null }) => ({
    entryId: str(input?.entryId),
    notes: str(input?.notes) || null,
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .update({ notes: data.notes })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
