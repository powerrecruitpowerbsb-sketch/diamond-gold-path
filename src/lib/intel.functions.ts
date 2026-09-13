import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INTEL_FIELD_TYPES = [
  "style_of_play",
  "recruiting_philosophy",
  "positions_prioritized",
  "preferred_player_profile",
  "transfer_juco_tendencies",
  "freshman_tendencies",
  "geographic_tendencies",
  "recruiting_timeline",
  "roster_construction_tendencies",
] as const;

/**
 * Server-side superadmin gate. Every intelligence and relationship call runs
 * this first — the console route guard is UX only, this is the boundary.
 */
async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((row: { role: string }) => row.role === "superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

/**
 * Intelligence and relationship rows belong to an organization. Power staff
 * write into their own; if their account carries no organization we fall back to
 * the first one on file (Power's own), never to a null tenant key.
 */
async function actorOrgId(context: { supabase: any; userId: string }): Promise<string> {
  const { data: profile } = await context.supabase
    .from("users")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const own = (profile as any)?.organization_id as string | null;
  if (own) return own;
  const { data: org } = await context.supabase
    .from("organizations")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const fallback = (org as any)?.id as string | null;
  if (!fallback) throw new Error("No organization on file to attach this to");
  return fallback;
}

const str = (value: unknown) => String(value ?? "").trim();


/* ------------------------------------------------------------------ */
/* Recruiting intelligence (shown on the public program profile)        */
/* ------------------------------------------------------------------ */

export const listProgramIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: str(input?.programId) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { data: rows, error } = await context.supabase
      .from("recruiting_intelligence")
      .select(
        "id, field_type, content, updated_at, created_at, updated_by, created_by, updated:users!recruiting_intelligence_updated_by_fkey(name, email), creator:users!recruiting_intelligence_created_by_fkey(name, email)",
      )
      .eq("program_id", data.programId)
      .order("field_type");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const saveProgramIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string | null; programId: string; fieldType: string; content: string }) => ({
    id: input?.id ? str(input.id) : null,
    programId: str(input?.programId),
    fieldType: str(input?.fieldType),
    content: String(input?.content ?? "").slice(0, 8000),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.programId) throw new Error("Missing program");
    if (!INTEL_FIELD_TYPES.includes(data.fieldType as any)) throw new Error("Unknown field type");
    if (!data.content.trim()) throw new Error("Write something before saving");

    if (data.id) {
      const { error } = await context.supabase
        .from("recruiting_intelligence")
        .update({
          field_type: data.fieldType as any,
          content: data.content,
          updated_by: context.userId,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("recruiting_intelligence")
      .insert({
        program_id: data.programId,
        field_type: data.fieldType as any,
        content: data.content,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteProgramIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { error } = await context.supabase
      .from("recruiting_intelligence")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Relationship tracking (internal — never surfaced to organizations)  */
/* ------------------------------------------------------------------ */

export const listSuperadminStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");
    if (error) throw new Error(error.message);
    const ids = ((roles ?? []) as any[]).map((r) => r.user_id);
    if (ids.length === 0) return [] as any[];
    const { data: users } = await context.supabase
      .from("users")
      .select("id, name, email")
      .in("id", ids);
    return (users ?? []) as any[];
  });

export const getProgramRelationship = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: str(input?.programId) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { data: relationship, error } = await context.supabase
      .from("program_relationships")
      .select(
        "id, program_id, relationship_strength, primary_contact_staff_id, last_meaningful_interaction_at",
      )
      .eq("program_id", data.programId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    let interactions: any[] = [];
    if (relationship) {
      const { data: rows, error: logError } = await context.supabase
        .from("interaction_log")
        .select("id, interaction_date, notes, event_context, staff_id, users(name, email)")
        .eq("relationship_id", (relationship as any).id)
        .order("interaction_date", { ascending: false });
      if (logError) throw new Error(logError.message);
      interactions = (rows ?? []) as any[];
    }

    return { relationship: relationship ?? null, interactions };
  });

/** Creates the relationship row on first save. */
export const saveProgramRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    programId: string;
    relationshipStrength?: number | null;
    primaryContactStaffId?: string | null;
    lastMeaningfulInteractionAt?: string | null;
  }) => {
    const strengthRaw = Number(input?.relationshipStrength);
    return {
      programId: str(input?.programId),
      relationshipStrength: Number.isFinite(strengthRaw)
        ? Math.max(1, Math.min(5, Math.round(strengthRaw)))
        : null,
      primaryContactStaffId: input?.primaryContactStaffId ? str(input.primaryContactStaffId) : null,
      lastMeaningfulInteractionAt: input?.lastMeaningfulInteractionAt
        ? str(input.lastMeaningfulInteractionAt)
        : null,
    };
  })
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.programId) throw new Error("Missing program");

    const values = {
      relationship_strength: data.relationshipStrength,
      primary_contact_staff_id: data.primaryContactStaffId,
      last_meaningful_interaction_at: data.lastMeaningfulInteractionAt
        ? new Date(data.lastMeaningfulInteractionAt).toISOString()
        : null,
    };

    const { data: existing } = await context.supabase
      .from("program_relationships")
      .select("id")
      .eq("program_id", data.programId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("program_relationships")
        .update(values as any)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { id: (existing as any).id };
    }

    const { data: inserted, error } = await context.supabase
      .from("program_relationships")
      .insert({ program_id: data.programId, ...values } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const addProgramInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    programId: string;
    notes: string;
    eventContext?: string | null;
    interactionDate?: string | null;
  }) => ({
    programId: str(input?.programId),
    notes: String(input?.notes ?? "").slice(0, 4000),
    eventContext: input?.eventContext ? str(input.eventContext).slice(0, 200) : null,
    interactionDate: input?.interactionDate ? str(input.interactionDate) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.notes.trim()) throw new Error("Add a note before saving");

    let relationshipId: string;
    const { data: existing } = await context.supabase
      .from("program_relationships")
      .select("id")
      .eq("program_id", data.programId)
      .maybeSingle();
    if (existing) {
      relationshipId = (existing as any).id as string;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("program_relationships")
        .insert({ program_id: data.programId } as any)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      relationshipId = (inserted as { id: string }).id;
    }

    const interactionDate = data.interactionDate
      ? new Date(data.interactionDate).toISOString()
      : new Date().toISOString();

    const { error: logError } = await context.supabase.from("interaction_log").insert({
      relationship_id: relationshipId,
      staff_id: context.userId,
      interaction_date: interactionDate,
      notes: data.notes,
      event_context: data.eventContext,
    } as any);
    if (logError) throw new Error(logError.message);

    // Keep the relationship summary in step with its newest interaction.
    const { data: current } = await context.supabase
      .from("program_relationships")
      .select("last_meaningful_interaction_at")
      .eq("id", relationshipId)
      .maybeSingle();
    const prior = (current as any)?.last_meaningful_interaction_at;
    if (!prior || new Date(prior) < new Date(interactionDate)) {
      await context.supabase
        .from("program_relationships")
        .update({ last_meaningful_interaction_at: interactionDate } as any)
        .eq("id", relationshipId);
    }

    return { ok: true };
  });

export const deleteProgramInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { error } = await context.supabase.from("interaction_log").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
