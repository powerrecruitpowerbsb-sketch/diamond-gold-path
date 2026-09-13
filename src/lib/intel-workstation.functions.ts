import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTEL_FIELD_MAP, INTEL_POSITIONS } from "@/lib/intel-fields";
import { statesInRegion, isRegion } from "@/lib/regions";

/**
 * The intelligence workstation — an organization writing and reviewing its own
 * intelligence. Every read and write is scoped to the caller's organization and
 * gated on their role; the database rules enforce the same boundary again.
 */

type Ctx = { supabase: any; userId: string };

const str = (value: unknown) => String(value ?? "").trim();

export type IntelViewer = {
  userId: string;
  organizationId: string | null;
  role: "org_admin" | "org_staff" | "superadmin" | "family";
  canApprove: boolean;
  canRate: boolean;
};

async function viewer(context: Ctx): Promise<IntelViewer> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, organization_id, user_type")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const superadmin = list.includes("superadmin");
  const type = (profile as any)?.user_type ?? "player";
  const role: IntelViewer["role"] = superadmin
    ? "superadmin"
    : type === "org_admin"
      ? "org_admin"
      : type === "org_staff"
        ? "org_staff"
        : "family";
  return {
    userId: context.userId,
    organizationId: ((profile as any)?.organization_id ?? null) as string | null,
    role,
    canApprove: role === "org_admin" || role === "superadmin",
    canRate: role === "org_admin" || role === "superadmin",
  };
}

/** Staff-only gate; returns the organization every row must belong to. */
async function requireStaff(context: Ctx): Promise<IntelViewer & { organizationId: string }> {
  const v = await viewer(context);
  if (v.role === "family") throw new Error("Forbidden: staff only");
  let orgId = v.organizationId;
  if (!orgId && v.role === "superadmin") {
    const { data } = await context.supabase
      .from("organizations")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    orgId = ((data as any)?.id ?? null) as string | null;
  }
  if (!orgId) throw new Error("Your account is not attached to an organization yet");
  return { ...v, organizationId: orgId };
}

export const getIntelViewer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => viewer(context as any));

/* ------------------------------------------------------------------ */
/* The program list                                                     */
/* ------------------------------------------------------------------ */

export type IntelListFilters = {
  sport: string;
  q: string;
  region: string;
  states: string[];
  governingBody: string;
  division: string;
  conference: string;
  coverage: "any" | "has" | "none";
  strength: string;
  author: "any" | "mine";
  status: string;
  staleBefore: string;
};

function normalizeFilters(input: Partial<IntelListFilters> | undefined): IntelListFilters {
  const region = str(input?.region);
  const picked = (input?.states ?? []).map((s) => str(s)).filter(Boolean);
  return {
    sport: str(input?.sport) || "baseball",
    q: str(input?.q),
    region: isRegion(region) ? region : "",
    states: picked.length ? picked : isRegion(region) ? statesInRegion(region) : [],
    governingBody: str(input?.governingBody),
    division: str(input?.division),
    conference: str(input?.conference),
    coverage: (str(input?.coverage) as IntelListFilters["coverage"]) || "any",
    strength: str(input?.strength),
    author: (str(input?.author) as IntelListFilters["author"]) || "any",
    status: str(input?.status),
    staleBefore: str(input?.staleBefore),
  };
}

export const listIntelPrograms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<IntelListFilters>) => normalizeFilters(input))
  .handler(async ({ context, data: f }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;

    // Our own organization's intelligence and relationships, for coverage.
    const [{ data: records }, { data: relationships }, { data: authors }] = await Promise.all([
      supabase
        .from("recruiting_intelligence")
        .select("program_id, field_type, status, updated_at, author_user_id, editor_user_id")
        .eq("organization_id", v.organizationId),
      supabase
        .from("program_relationships")
        .select("program_id, strength_label, last_meaningful_interaction_at")
        .eq("organization_id", v.organizationId),
      supabase.from("users").select("id, name, email").eq("organization_id", v.organizationId),
    ]);

    const nameById = new Map<string, string>(
      ((authors ?? []) as any[]).map((row) => [row.id as string, (row.name || row.email) as string]),
    );

    type Cover = {
      filled: number;
      statuses: Set<string>;
      mine: boolean;
      lastAt: string | null;
      lastBy: string | null;
    };
    const cover = new Map<string, Cover>();
    for (const row of (records ?? []) as any[]) {
      const key = row.program_id as string;
      const entry =
        cover.get(key) ??
        ({ filled: 0, statuses: new Set<string>(), mine: false, lastAt: null, lastBy: null } as Cover);
      entry.filled += 1;
      entry.statuses.add(row.status as string);
      if (row.author_user_id === v.userId || row.editor_user_id === v.userId) entry.mine = true;
      const at = row.updated_at as string | null;
      if (at && (!entry.lastAt || at > entry.lastAt)) {
        entry.lastAt = at;
        entry.lastBy = nameById.get(row.editor_user_id ?? row.author_user_id ?? "") ?? null;
      }
      cover.set(key, entry);
    }

    const strengthByProgram = new Map<string, string | null>(
      ((relationships ?? []) as any[]).map((r) => [r.program_id as string, r.strength_label ?? null]),
    );

    let query = supabase
      .from("programs")
      .select(
        "id, sport, governing_body, division, conference, conference_verification, head_coach_name, universities!inner(id, name, state, city)",
      )
      .eq("sport", f.sport)
      .neq("offering_status", "not_offered")
      .limit(400);

    if (f.governingBody) query = query.eq("governing_body", f.governingBody);
    if (f.division) query = query.eq("division", f.division);
    if (f.conference) query = query.eq("conference", f.conference);
    if (f.states.length) query = query.in("universities.state", f.states);
    if (f.q) query = query.ilike("universities.name", `%${f.q}%`);

    const { data: programs, error } = await query;
    if (error) throw new Error(error.message);

    let rows = ((programs ?? []) as any[]).map((row) => {
      const entry = cover.get(row.id as string);
      return {
        id: row.id as string,
        sport: row.sport as string,
        school: (row.universities?.name ?? "") as string,
        state: (row.universities?.state ?? null) as string | null,
        governingBody: (row.governing_body ?? null) as string | null,
        division: (row.division ?? null) as string | null,
        conference: (row.conference ?? null) as string | null,
        conferenceConfirmed: row.conference_verification === "verified",
        headCoach: (row.head_coach_name ?? null) as string | null,
        filled: entry?.filled ?? 0,
        statuses: Array.from(entry?.statuses ?? []),
        mine: entry?.mine ?? false,
        lastAt: entry?.lastAt ?? null,
        lastBy: entry?.lastBy ?? null,
        strength: strengthByProgram.get(row.id as string) ?? null,
      };
    });

    if (f.coverage === "has") rows = rows.filter((r) => r.filled > 0);
    if (f.coverage === "none") rows = rows.filter((r) => r.filled === 0);
    if (f.strength) rows = rows.filter((r) => r.strength === f.strength);
    if (f.author === "mine") rows = rows.filter((r) => r.mine);
    if (f.status) rows = rows.filter((r) => r.statuses.includes(f.status));
    if (f.staleBefore) {
      rows = rows.filter((r) => r.filled > 0 && (!r.lastAt || r.lastAt < f.staleBefore));
    }

    rows.sort((a, b) => a.school.localeCompare(b.school));
    return { rows, viewer: v as IntelViewer };
  });

/* ------------------------------------------------------------------ */
/* One program                                                          */
/* ------------------------------------------------------------------ */

export const getIntelProgram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: str(input?.programId) }))
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;

    const [{ data: program }, { data: records }, { data: relationship }, { data: people }] =
      await Promise.all([
        supabase
          .from("programs")
          .select(
            "id, sport, governing_body, division, conference, head_coach_name, roster_url, athletic_website, universities!inner(id, name, state, city)",
          )
          .eq("id", data.programId)
          .maybeSingle(),
        supabase
          .from("recruiting_intelligence")
          .select(
            "id, field_type, content, structured_value, positions, structured_detail, visibility, status, review_note, updated_at, author_user_id, editor_user_id, reviewed_by, reviewed_at",
          )
          .eq("organization_id", v.organizationId)
          .eq("program_id", data.programId),
        supabase
          .from("program_relationships")
          .select(
            "id, strength_label, placed_players_before, primary_college_contact, program_stability_note, last_meaningful_interaction_at, visibility",
          )
          .eq("organization_id", v.organizationId)
          .eq("program_id", data.programId)
          .maybeSingle(),
        supabase.from("users").select("id, name, email").eq("organization_id", v.organizationId),
      ]);

    let interactions: any[] = [];
    if (relationship) {
      const { data: rows } = await supabase
        .from("interaction_log")
        .select("id, interaction_date, notes, event_context, staff_id")
        .eq("organization_id", v.organizationId)
        .eq("relationship_id", (relationship as any).id)
        .order("interaction_date", { ascending: false });
      interactions = (rows ?? []) as any[];
    }

    const nameById = Object.fromEntries(
      ((people ?? []) as any[]).map((row) => [row.id as string, (row.name || row.email) as string]),
    ) as Record<string, string>;

    return {
      program: program ?? null,
      records: (records ?? []) as any[],
      relationship: relationship ?? null,
      interactions,
      people: nameById,
      viewer: v as IntelViewer,
    };
  });

/* ------------------------------------------------------------------ */
/* Writing one field                                                    */
/* ------------------------------------------------------------------ */

export const saveIntelField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      programId: string;
      fieldKey: string;
      content?: string | null;
      structuredValue?: string | null;
      positions?: string[] | null;
      structuredDetail?: unknown;
      visibility?: string | null;
    }) => ({
      programId: str(input?.programId),
      fieldKey: str(input?.fieldKey),
      content: String(input?.content ?? "").slice(0, 8000),
      structuredValue: input?.structuredValue ? str(input.structuredValue) : null,
      positions: (input?.positions ?? []).map((p) => str(p)).filter(Boolean),
      structuredDetail: input?.structuredDetail ?? null,
      visibility: input?.visibility ? str(input.visibility) : null,
    }),
  )
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;

    const def = INTEL_FIELD_MAP[data.fieldKey];
    if (!def) throw new Error("Unknown field");
    if (def.kind === "choice" && data.structuredValue) {
      const allowed = (def.choices ?? []).some((c) => c.value === data.structuredValue);
      if (!allowed) throw new Error("Pick one of the listed answers");
    }
    const positions = data.positions.filter((p) => (INTEL_POSITIONS as readonly string[]).includes(p));
    const hasSomething =
      data.content.trim().length > 0 ||
      Boolean(data.structuredValue) ||
      positions.length > 0 ||
      (data.structuredDetail !== null && data.structuredDetail !== undefined);
    if (!hasSomething) throw new Error("Write something before saving");

    // A coach's write is a submission; an admin's is authoritative straight away.
    const status = v.canApprove ? "approved" : "pending";
    const visibility =
      data.visibility === "shared_with_families" || data.visibility === "org_only"
        ? data.visibility
        : def.audience === "family"
          ? "shared_with_families"
          : "org_only";

    const { data: existing } = await supabase
      .from("recruiting_intelligence")
      .select("id, author_user_id")
      .eq("organization_id", v.organizationId)
      .eq("program_id", data.programId)
      .eq("field_type", data.fieldKey as any)
      .maybeSingle();

    const values: Record<string, unknown> = {
      content: data.content,
      structured_value: data.structuredValue,
      positions: positions.length ? positions : null,
      structured_detail: data.structuredDetail ?? null,
      visibility,
      status,
      updated_by: v.userId,
    };

    if (existing) {
      const originalAuthor = (existing as any).author_user_id as string | null;
      // Edit-and-approve keeps the original author and records the editor.
      if (originalAuthor && originalAuthor !== v.userId) values['editor_user_id'] = v.userId;
      else values['author_user_id'] = originalAuthor ?? v.userId;
      if (v.canApprove) {
        values['reviewed_by'] = v.userId;
        values['reviewed_at'] = new Date().toISOString();
        values['review_note'] = null;
      }
      const { error } = await supabase
        .from("recruiting_intelligence")
        .update(values as any)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { id: (existing as any).id as string, status };
    }

    const { data: inserted, error } = await supabase
      .from("recruiting_intelligence")
      .insert({
        organization_id: v.organizationId,
        program_id: data.programId,
        field_type: data.fieldKey as any,
        author_user_id: v.userId,
        created_by: v.userId,
        updated_by: v.userId,
        reviewed_by: v.canApprove ? v.userId : null,
        reviewed_at: v.canApprove ? new Date().toISOString() : null,
        ...values,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string, status };
  });

export const setIntelVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; visibility: string }) => ({
    id: str(input?.id),
    visibility: str(input?.visibility),
  }))
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    if (!["org_only", "shared_with_families"].includes(data.visibility)) {
      throw new Error("Unknown visibility");
    }
    const { error } = await (context as any).supabase
      .from("recruiting_intelligence")
      .update({ visibility: data.visibility as any, updated_by: v.userId } as any)
      .eq("id", data.id)
      .eq("organization_id", v.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIntelField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    const { error } = await (context as any).supabase
      .from("recruiting_intelligence")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", v.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Relationship and interactions                                        */
/* ------------------------------------------------------------------ */

async function relationshipId(
  supabase: any,
  organizationId: string,
  programId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("program_relationships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("program_id", programId)
    .maybeSingle();
  if (existing) return (existing as any).id as string;
  const { data: inserted, error } = await supabase
    .from("program_relationships")
    .insert({ organization_id: organizationId, program_id: programId } as any)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (inserted as any).id as string;
}

export const saveRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      programId: string;
      strengthLabel?: string | null;
      placedPlayersBefore?: boolean | null;
      primaryCollegeContact?: string | null;
      programStabilityNote?: string | null;
    }) => ({
      programId: str(input?.programId),
      strengthLabel: input?.strengthLabel ? str(input.strengthLabel) : null,
      placedPlayersBefore:
        input?.placedPlayersBefore === null || input?.placedPlayersBefore === undefined
          ? null
          : Boolean(input.placedPlayersBefore),
      primaryCollegeContact: input?.primaryCollegeContact
        ? str(input.primaryCollegeContact).slice(0, 200)
        : null,
      programStabilityNote: input?.programStabilityNote
        ? String(input.programStabilityNote).slice(0, 4000)
        : null,
    }),
  )
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;
    if (!data.programId) throw new Error("Missing program");
    if (data.strengthLabel && !v.canRate) {
      throw new Error("Only an organization admin can set relationship strength");
    }

    const id = await relationshipId(supabase, v.organizationId, data.programId);
    const patch: Record<string, unknown> = {
      placed_players_before: data.placedPlayersBefore,
      primary_college_contact: data.primaryCollegeContact,
      program_stability_note: data.programStabilityNote,
    };
    if (v.canRate) patch['strength_label'] = data.strengthLabel;

    const { error } = await supabase
      .from("program_relationships")
      .update(patch as any)
      .eq("id", id)
      .eq("organization_id", v.organizationId);
    if (error) throw new Error(error.message);
    return { id };
  });

export const logInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { programId: string; notes: string; eventContext?: string | null; interactionDate?: string | null }) => ({
      programId: str(input?.programId),
      notes: String(input?.notes ?? "").slice(0, 4000),
      eventContext: input?.eventContext ? str(input.eventContext).slice(0, 200) : null,
      interactionDate: input?.interactionDate ? str(input.interactionDate) : null,
    }),
  )
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;
    if (!data.notes.trim()) throw new Error("Add a note before saving");

    const id = await relationshipId(supabase, v.organizationId, data.programId);
    const when = data.interactionDate
      ? new Date(data.interactionDate).toISOString()
      : new Date().toISOString();

    const { error } = await supabase.from("interaction_log").insert({
      organization_id: v.organizationId,
      relationship_id: id,
      staff_id: v.userId,
      interaction_date: when,
      notes: data.notes,
      event_context: data.eventContext,
    } as any);
    if (error) throw new Error(error.message);

    const { data: current } = await supabase
      .from("program_relationships")
      .select("last_meaningful_interaction_at")
      .eq("id", id)
      .maybeSingle();
    const prior = (current as any)?.last_meaningful_interaction_at as string | null;
    if (!prior || new Date(prior) < new Date(when)) {
      await supabase
        .from("program_relationships")
        .update({ last_meaningful_interaction_at: when } as any)
        .eq("id", id);
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* My submissions and the approval queue                                */
/* ------------------------------------------------------------------ */

const SUBMISSION_COLS =
  "id, program_id, field_type, content, structured_value, positions, structured_detail, visibility, status, review_note, updated_at, author_user_id, editor_user_id, reviewed_by, reviewed_at";

async function decorate(supabase: any, rows: any[], organizationId: string) {
  const programIds = Array.from(new Set(rows.map((r) => r.program_id as string)));
  if (!programIds.length) return [];
  const [{ data: programs }, { data: people }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, sport, division, governing_body, universities!inner(name, state)")
      .in("id", programIds),
    supabase.from("users").select("id, name, email").eq("organization_id", organizationId),
  ]);
  const programById = new Map<string, any>(((programs ?? []) as any[]).map((p) => [p.id, p]));
  const nameById = new Map<string, string>(
    ((people ?? []) as any[]).map((p) => [p.id as string, (p.name || p.email) as string]),
  );
  return rows.map((row) => {
    const program = programById.get(row.program_id as string);
    return {
      ...row,
      school: program?.universities?.name ?? "Unknown school",
      state: program?.universities?.state ?? null,
      sport: program?.sport ?? null,
      level: [program?.governing_body, program?.division].filter(Boolean).join(" "),
      authorName: nameById.get(row.author_user_id ?? "") ?? null,
      editorName: nameById.get(row.editor_user_id ?? "") ?? null,
      reviewerName: nameById.get(row.reviewed_by ?? "") ?? null,
    };
  });
}

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const v = await requireStaff(context as any);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("recruiting_intelligence")
      .select(SUBMISSION_COLS)
      .eq("organization_id", v.organizationId)
      .or(`author_user_id.eq.${v.userId},editor_user_id.eq.${v.userId}`)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return decorate(supabase, (data ?? []) as any[], v.organizationId);
  });

export const listApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const v = await requireStaff(context as any);
    if (!v.canApprove) return [];
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("recruiting_intelligence")
      .select(SUBMISSION_COLS)
      .eq("organization_id", v.organizationId)
      .in("status", ["pending", "changes_requested"])
      .order("updated_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return decorate(supabase, (data ?? []) as any[], v.organizationId);
  });

export const reviewIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; decision: string; note?: string | null; content?: string | null }) => ({
      id: str(input?.id),
      decision: str(input?.decision),
      note: input?.note ? String(input.note).slice(0, 2000) : null,
      content: input?.content === undefined ? undefined : String(input?.content ?? "").slice(0, 8000),
    }),
  )
  .handler(async ({ context, data }) => {
    const v = await requireStaff(context as any);
    if (!v.canApprove) throw new Error("Forbidden: admins review submissions");
    const supabase = (context as any).supabase;

    const statuses: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      send_back: "changes_requested",
    };
    const status = statuses[data.decision];
    if (!status) throw new Error("Unknown decision");

    const { data: existing } = await supabase
      .from("recruiting_intelligence")
      .select("id, author_user_id, content")
      .eq("id", data.id)
      .eq("organization_id", v.organizationId)
      .maybeSingle();
    if (!existing) throw new Error("That submission is no longer here");

    const patch: Record<string, unknown> = {
      status,
      reviewed_by: v.userId,
      reviewed_at: new Date().toISOString(),
      review_note: data.note,
      updated_by: v.userId,
    };
    // Edit-and-approve: the author stays the author, the editor is recorded too.
    if (data.content !== undefined && data.content !== (existing as any).content) {
      patch['content'] = data.content;
      patch['editor_user_id'] = v.userId;
    }

    const { error } = await supabase
      .from("recruiting_intelligence")
      .update(patch as any)
      .eq("id", data.id)
      .eq("organization_id", v.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true, status };
  });
