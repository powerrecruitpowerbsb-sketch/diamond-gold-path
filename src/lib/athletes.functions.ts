import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Where an invited user lands to set their password. */
function inviteRedirect(): string | undefined {
  try {
    return new URL("/reset-password", new URL(getRequest().url).origin).toString();
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const str = (value: unknown) => String(value ?? "").trim();
const nullable = (value: unknown) => {
  const out = str(value);
  return out === "" ? null : out;
};

const BATS = ["R", "L", "S"] as const;
const THROWS = ["R", "L"] as const;
export const ATHLETE_SOURCES = ["manual", "csv", "handled", "curve_testing"] as const;
export const SAVED_SCHOOL_STATUSES = [
  "researching",
  "contacted",
  "offered",
  "committed",
  "eliminated",
] as const;

export type AthleteInput = {
  id?: string | null;
  name: string;
  gradYear?: number | null;
  primaryPosition?: string | null;
  bats?: string | null;
  throws?: string | null;
  source?: (typeof ATHLETE_SOURCES)[number];
};

type Ctx = { supabase: any; userId: string };

/**
 * Resolves the caller's org + role. Every athlete call runs through this: the
 * roster is org-scoped data, so the boundary is server-side, not the nav.
 */
async function requireOrgActor(context: Ctx) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, name, organization_id")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const isManager = roleList.includes("org_admin") || roleList.includes("org_staff");
  const organizationId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (!isSuperadmin && !isManager) throw new Error("Forbidden: organization staff only");
  if (!isSuperadmin && !organizationId) throw new Error("Forbidden: no organization on this account");

  return {
    organizationId,
    isSuperadmin,
    isOrgAdmin: roleList.includes("org_admin"),
  };
}

function normalizeAthlete(input: AthleteInput) {
  const name = str(input?.name);
  if (!name) throw new Error("Athlete name is required");

  const gradYearRaw = input?.gradYear;
  let gradYear: number | null = null;
  if (gradYearRaw !== null && gradYearRaw !== undefined && String(gradYearRaw).trim() !== "") {
    const parsed = Number(gradYearRaw);
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
      throw new Error(`Invalid graduation year "${gradYearRaw}"`);
    }
    gradYear = parsed;
  }

  const bats = nullable(input?.bats)?.toUpperCase() ?? null;
  const throws = nullable(input?.throws)?.toUpperCase() ?? null;
  if (bats && !BATS.includes(bats as (typeof BATS)[number])) {
    throw new Error(`Invalid bats value "${bats}" (use R, L or S)`);
  }
  if (throws && !THROWS.includes(throws as (typeof THROWS)[number])) {
    throw new Error(`Invalid throws value "${throws}" (use R or L)`);
  }

  const source = ATHLETE_SOURCES.includes(input?.source as (typeof ATHLETE_SOURCES)[number])
    ? (input.source as (typeof ATHLETE_SOURCES)[number])
    : "manual";

  return {
    id: nullable(input?.id),
    name,
    grad_year: gradYear,
    primary_position: nullable(input?.primaryPosition),
    bats,
    throws,
    athlete_data_source: source,
  };
}

/**
 * THE single athlete write path. Manual entry, CSV import and (later) the
 * Handled / Curve Testing integrations all call this — never their own insert.
 */
async function upsertAthlete(
  context: Ctx,
  organizationId: string,
  input: AthleteInput,
): Promise<{ id: string; created: boolean }> {
  const row = normalizeAthlete(input);
  const { id, ...fields } = row;

  if (id) {
    const { data, error } = await context.supabase
      .from("org_athletes")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Athlete not found in your organization");
    return { id: (data as { id: string }).id, created: false };
  }

  const { data, error } = await context.supabase
    .from("org_athletes")
    .insert({ ...fields, organization_id: organizationId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id, created: true };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const listOrgAthletes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input:
        | { q?: string; gradYear?: string; seasonId?: string; teamId?: string; status?: string }
        | undefined,
    ) => ({
      q: str(input?.q),
      gradYear: str(input?.gradYear),
      seasonId: str(input?.seasonId),
      teamId: str(input?.teamId),
      status: str(input?.status),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    let query = context.supabase
      .from("org_athletes")
      .select(
        "id, name, grad_year, primary_position, bats, throws, athlete_data_source, status, organization_id, created_at",
      )
      .order("grad_year", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (actor.organizationId) query = query.eq("organization_id", actor.organizationId);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    if (data.gradYear) query = query.eq("grad_year", Number(data.gradYear));
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // Season/team assignment lives in team_athletes so the roster can be read
    // for any season without duplicating the athlete record.
    let assignments: Record<string, any>[] = [];
    if (data.seasonId) {
      const { data: assigned, error: assignError } = await context.supabase
        .from("team_athletes")
        .select("org_athlete_id, jersey_number, team_id, teams(id, name, age_group)")
        .eq("season_id", data.seasonId);
      if (assignError) throw new Error(assignError.message);
      assignments = (assigned ?? []) as Record<string, any>[];
    }
    const assignmentByAthlete = new Map(
      assignments.map((row) => [row['org_athlete_id'] as string, row]),
    );

    let athletes = ((rows ?? []) as Record<string, any>[]).map((athlete) => {
      const assignment = assignmentByAthlete.get(athlete['id'] as string);
      return {
        ...athlete,
        team_id: (assignment?.['team_id'] ?? null) as string | null,
        team_name: (assignment?.['teams']?.name ?? null) as string | null,
        jersey_number: (assignment?.['jersey_number'] ?? null) as string | null,
      };
    });

    if (data.teamId === "__unassigned") {
      athletes = athletes.filter((a) => !a['team_id']);
    } else if (data.teamId) {
      athletes = athletes.filter((a) => a['team_id'] === data.teamId);
    }

    const { data: years } = await context.supabase
      .from("org_athletes")
      .select("grad_year")
      .not("grad_year", "is", null);

    const gradYears = Array.from(
      new Set(((years ?? []) as { grad_year: number }[]).map((r) => r.grad_year)),
    ).sort((a, b) => a - b);

    return {
      athletes,
      gradYears,
      canEdit: true,
      isOrgAdmin: actor.isOrgAdmin,
    };
  });


export const getOrgAthlete = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);

    const { data: athlete, error } = await context.supabase
      .from("org_athletes")
      .select(
        "id, organization_id, name, grad_year, primary_position, bats, throws, athlete_data_source, status, linked_parent_user_id, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!athlete) throw new Error("Athlete not found");

    const [{ data: saved }, { data: notes }] = await Promise.all([
      context.supabase
        .from("athlete_saved_schools")
        .select("id, status, notes, created_at, program_id")
        .eq("org_athlete_id", data.id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("org_player_notes")
        .select("id, note, visible_to_parent, created_at, author_user_id")
        .eq("org_athlete_id", data.id)
        .order("created_at", { ascending: false }),
    ]);

    const savedRows = (saved ?? []) as { program_id: string }[];
    let programs: Record<string, any>[] = [];
    if (savedRows.length) {
      const { data: progs } = await context.supabase
        .from("programs")
        .select("id, sport, division, governing_body, conference, universities(name, state, region)")
        .in(
          "id",
          savedRows.map((r) => r.program_id),
        );
      programs = (progs ?? []) as Record<string, any>[];
    }

    return {
      athlete: athlete as Record<string, any>,
      savedSchools: (saved ?? []).map((row: any) => ({
        ...row,
        program: programs.find((p) => p['id'] === row.program_id) ?? null,
      })),
      notes: (notes ?? []) as Record<string, any>[],
    };
  });

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export const saveOrgAthlete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AthleteInput) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    const orgId = actor.organizationId;
    if (!orgId && !data.id) throw new Error("Select an organization before adding athletes");
    return upsertAthlete(context as any, orgId ?? "", {
      ...data,
      source: data.source ?? "manual",
    });
  });

export const deleteOrgAthlete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { error } = await context.supabase.from("org_athletes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Duplicate detection for the CSV preview: returns the existing athlete id for
 * each (name, grad year) pair that already exists in the caller's org.
 */
export const matchAthletes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: { name: string; gradYear?: number | null }[] }) => ({
    rows: Array.isArray(input?.rows) ? input.rows.slice(0, 2000) : [],
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    let query = context.supabase.from("org_athletes").select("id, name, grad_year");
    if (actor.organizationId) query = query.eq("organization_id", actor.organizationId);
    const { data: existing, error } = await query;
    if (error) throw new Error(error.message);

    const key = (name: unknown, year: unknown) =>
      `${String(name ?? "").trim().toLowerCase()}|${year ?? ""}`;
    const index = new Map<string, string>();
    for (const row of (existing ?? []) as any[]) {
      index.set(key(row.name, row.grad_year), row.id);
    }

    return {
      matches: data.rows.map((row) => index.get(key(row.name, row.gradYear ?? "")) ?? null),
    };
  });

export const importAthletes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      rows: (AthleteInput & {
        action?: "create" | "update" | "skip";
        matchId?: string | null;
        parentEmail?: string | null;
      })[];
      sendFamilyInvites?: boolean;
    }) => ({
      rows: Array.isArray(input?.rows) ? input.rows.slice(0, 2000) : [],
      sendFamilyInvites: input?.sendFamilyInvites !== false,
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    const orgId = actor.organizationId;
    if (!orgId) throw new Error("Select an organization before importing athletes");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let invited = 0;
    const failures: { row: number; message: string }[] = [];
    const inviteFailures: { row: number; email: string; message: string }[] = [];

    const wantsInvites =
      data.sendFamilyInvites &&
      data.rows.some((row) => row.action !== "skip" && String(row.parentEmail ?? "").trim());
    const sendInviteCore = wantsInvites
      ? (await import("./invites.server")).sendInviteCore
      : null;

    for (let i = 0; i < data.rows.length; i += 1) {
      const row = data.rows[i]!;
      if (row.action === "skip") {
        skipped += 1;
        continue;
      }
      let athleteId: string | null = null;
      try {
        const result = await upsertAthlete(context as any, orgId, {
          ...row,
          id: row.action === "update" ? (row.matchId ?? row.id ?? null) : null,
          source: "csv",
        });
        athleteId = result.id;
        if (result.created) created += 1;
        else updated += 1;
      } catch (error) {
        failures.push({ row: i + 1, message: (error as Error).message });
        continue;
      }

      // Same invite path as the athlete page — one service, three entry points.
      const parentEmail = String(row.parentEmail ?? "").trim().toLowerCase();
      if (sendInviteCore && athleteId && parentEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(parentEmail)) {
          inviteFailures.push({ row: i + 1, email: parentEmail, message: "not a valid email" });
        } else {
          try {
            const result = await sendInviteCore({
              actorUserId: context.userId,
              orgId,
              email: parentEmail,
              role: "parent",
              athleteId,
              redirectTo: inviteRedirect(),
            });
            if (result.status === "sent") invited += 1;
          } catch (error) {
            inviteFailures.push({
              row: i + 1,
              email: parentEmail,
              message: (error as Error).message,
            });
          }
        }
      }
    }

    return { created, updated, skipped, invited, failures, inviteFailures };
  });

/* ------------------------------------------------------------------ */
/* Notes + saved schools (kept minimal; expanded next phase)           */
/* ------------------------------------------------------------------ */

export const addAthleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; note: string; visibleToParent?: boolean }) => ({
    athleteId: str(input?.athleteId),
    note: str(input?.note),
    visibleToParent: Boolean(input?.visibleToParent),
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    if (!data.note) throw new Error("Note cannot be empty");
    const { error } = await context.supabase.from("org_player_notes").insert({
      org_athlete_id: data.athleteId,
      author_user_id: context.userId,
      note: data.note,
      visible_to_parent: data.visibleToParent,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAthleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { error } = await context.supabase.from("org_player_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setNoteVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; visibleToParent: boolean }) => ({
    id: str(input?.id),
    visibleToParent: Boolean(input?.visibleToParent),
  }))
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const { error } = await context.supabase
      .from("org_player_notes")
      .update({ visible_to_parent: data.visibleToParent })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
