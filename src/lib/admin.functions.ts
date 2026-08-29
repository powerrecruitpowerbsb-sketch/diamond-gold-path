import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = Record<string, unknown>;

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

/** Public pre-check so signup can reject a bad invite before creating an account. */
export const validateInviteCode = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => ({ code: String(input?.code ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!data.code) return { valid: false as boolean, organizationName: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: valid, error } = await supabaseAdmin.rpc("invite_code_valid", { _code: data.code });
    if (error) throw new Error(error.message);
    if (!valid) return { valid: false, organizationName: null };

    const { data: hash } = await supabaseAdmin.rpc("hash_invite_code", { _code: data.code });
    let organizationName: string | null = null;
    if (hash) {
      const { data: invite } = await supabaseAdmin
        .from("org_invites")
        .select("organizations(name)")
        .eq("code_hash", hash)
        .maybeSingle();
      organizationName = (invite as any)?.organizations?.name ?? null;
    }
    return { valid: true, organizationName };
  });

/** Signed-in user's profile + authoritative roles. */
export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      context.supabase
        .from("users")
        .select("id, email, name, user_type, organization_id")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
    return {
      profile: profile ?? null,
      roles: roleList,
      isSuperadmin: roleList.includes("superadmin"),
      primaryRole: roleList.includes("superadmin")
        ? "superadmin"
        : ((profile as any)?.user_type ?? "player"),
    };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const counts = await Promise.all([
      context.supabase.from("universities").select("id", { count: "exact", head: true }),
      context.supabase.from("programs").select("id", { count: "exact", head: true }),
      context.supabase.from("majors").select("id", { count: "exact", head: true }),
      context.supabase.from("roster_players").select("id", { count: "exact", head: true }),
    ]);
    const { data: recent } = await context.supabase
      .from("audit_log")
      .select("id, table_name, record_id, field_name, old_value, new_value, action, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    return {
      universities: counts[0].count ?? 0,
      programs: counts[1].count ?? 0,
      majors: counts[2].count ?? 0,
      rosterPlayers: counts[3].count ?? 0,
      recent: recent ?? [],
    };
  });

export const listUniversities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select(
        "id, name, city, state, region, public_private, campus_setting, school_size_bucket, undergrad_enrollment, avg_gpa, acceptance_rate, est_cost_of_attendance, est_net_price, updated_at, programs(id, sport, division, governing_body)",
      )
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUniversity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const [uni, programs, sources, classifications, majors, assigned] = await Promise.all([
      context.supabase.from("universities").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("programs").select("*").eq("university_id", data.id).order("sport"),
      context.supabase
        .from("data_field_sources")
        .select("*")
        .eq("table_name", "universities")
        .eq("record_id", data.id),
      context.supabase.from("classifications").select("*").eq("university_id", data.id),
      context.supabase.from("majors").select("id, name").order("name"),
      context.supabase.from("university_majors").select("major_id").eq("university_id", data.id),
    ]);
    if (uni.error) throw new Error(uni.error.message);
    if (!uni.data) throw new Error("University not found");
    return {
      university: uni.data,
      programs: programs.data ?? [],
      sources: sources.data ?? [],
      classifications: classifications.data ?? [],
      allMajors: majors.data ?? [],
      assignedMajorIds: ((assigned.data ?? []) as { major_id: string }[]).map((r) => r.major_id),
    };
  });

async function writeSources(
  supabase: any,
  tableName: string,
  recordId: string,
  sources: Record<string, { source_url?: string; source_type?: string; last_verified_at?: string }>,
  verifiedBy: string,
) {
  const rows = Object.entries(sources ?? {})
    .filter(([, v]) => v && (v.source_url || v.last_verified_at))
    .map(([field, v]) => ({
      table_name: tableName,
      record_id: recordId,
      field_name: field,
      source_url: v.source_url || null,
      source_type: (v.source_type || "official") as string,
      last_verified_at: v.last_verified_at ? new Date(v.last_verified_at).toISOString() : null,
      verified_by: verifiedBy,
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("data_field_sources")
    .upsert(rows, { onConflict: "table_name,record_id,field_name" });
  if (error) throw new Error(error.message);
}

export const saveUniversity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string | null; values: Json; sources?: Json }) => input)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const values = { ...(data.values as Json) };
    if (!values["name"]) throw new Error("School name is required");

    let id = data.id ?? null;
    if (id) {
      const { error } = await context.supabase.from("universities").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("universities")
        .insert(values)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = (inserted as { id: string }).id;
    }
    await writeSources(
      context.supabase,
      "universities",
      id!,
      (data.sources ?? {}) as any,
      context.userId,
    );
    return { id: id! };
  });

export const listPrograms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("programs")
      .select(
        "id, university_id, sport, governing_body, division, conference, head_coach_name, recruiting_coordinator_name, scholarships_available, last_verified_at, universities(name, state)",
      )
      .order("sport");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProgram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const [program, classifications] = await Promise.all([
      context.supabase
        .from("programs")
        .select("*, universities(id, name, state)")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase.from("classifications").select("*").eq("program_id", data.id),
    ]);
    if (program.error) throw new Error(program.error.message);
    if (!program.data) throw new Error("Program not found");
    return { program: program.data, classifications: classifications.data ?? [] };
  });

export const listUniversityOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select("id, name, state")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string | null; values: Json }) => input)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const values = { ...(data.values as Json) };
    if (!values["university_id"]) throw new Error("Pick a university");
    if (!values["sport"]) throw new Error("Pick a sport");

    if (data.id) {
      const { error } = await context.supabase.from("programs").update(values).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("programs")
      .insert(values)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

/** Guided "Add a New School": university + programs in one call, rolled back on failure. */
export const createSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { university: Json; sources?: Json; programs: Json[] }) => input)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.university?.["name"]) throw new Error("School name is required");

    const { data: inserted, error } = await context.supabase
      .from("universities")
      .insert(data.university)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const universityId = (inserted as { id: string }).id;

    try {
      await writeSources(
        context.supabase,
        "universities",
        universityId,
        (data.sources ?? {}) as any,
        context.userId,
      );
      const programRows = (data.programs ?? [])
        .filter((p) => p && p["sport"])
        .map((p) => ({ ...p, university_id: universityId }));
      if (programRows.length) {
        const { error: programError } = await context.supabase.from("programs").insert(programRows);
        if (programError) throw new Error(programError.message);
      }
    } catch (failure) {
      // Compensate so a partial save never leaves an orphan school behind.
      await context.supabase.from("universities").delete().eq("id", universityId);
      throw failure;
    }

    return { id: universityId };
  });

export const listMajors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const [majors, links] = await Promise.all([
      context.supabase.from("majors").select("id, name").order("name"),
      context.supabase.from("university_majors").select("major_id"),
    ]);
    if (majors.error) throw new Error(majors.error.message);
    const counts = new Map<string, number>();
    for (const row of (links.data ?? []) as { major_id: string }[]) {
      counts.set(row.major_id, (counts.get(row.major_id) ?? 0) + 1);
    }
    return ((majors.data ?? []) as { id: string; name: string }[]).map((m) => ({
      ...m,
      universityCount: counts.get(m.id) ?? 0,
    }));
  });

export const saveMajor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string | null; name: string }) => ({
    id: input.id ?? null,
    name: String(input.name ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.name) throw new Error("Major name is required");
    if (data.id) {
      const { error } = await context.supabase
        .from("majors")
        .update({ name: data.name })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("majors")
      .insert({ name: data.name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteMajor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { count } = await context.supabase
      .from("university_majors")
      .select("major_id", { count: "exact", head: true })
      .eq("major_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`In use by ${count} school${count === 1 ? "" : "s"} — unassign it first`);
    }
    const { error } = await context.supabase.from("majors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUniversityMajors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string; majorIds: string[] }) => input)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { data: existing } = await context.supabase
      .from("university_majors")
      .select("major_id")
      .eq("university_id", data.universityId);
    const current = new Set(((existing ?? []) as { major_id: string }[]).map((r) => r.major_id));
    const next = new Set(data.majorIds ?? []);

    const toAdd = [...next].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !next.has(id));

    if (toAdd.length) {
      const { error } = await context.supabase
        .from("university_majors")
        .insert(toAdd.map((major_id) => ({ university_id: data.universityId, major_id })));
      if (error) throw new Error(error.message);
    }
    for (const major_id of toRemove) {
      const { error } = await context.supabase
        .from("university_majors")
        .delete()
        .eq("university_id", data.universityId)
        .eq("major_id", major_id);
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length, removed: toRemove.length };
  });

export const saveClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      universityId?: string | null;
      programId?: string | null;
      classificationType: string;
      value: string;
      evidenceText?: string | null;
      evidenceSourceUrl?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.value?.trim()) throw new Error("Pick a value");
    if (data.classificationType === "campus_culture" && !data.evidenceText?.trim()) {
      throw new Error("Campus culture requires evidence explaining the classification");
    }

    const scope = context.supabase
      .from("classifications")
      .select("id")
      .eq("classification_type", data.classificationType);
    const existing = data.universityId
      ? await scope.eq("university_id", data.universityId).maybeSingle()
      : await scope.eq("program_id", data.programId!).maybeSingle();

    const row = {
      university_id: data.universityId ?? null,
      program_id: data.programId ?? null,
      classification_type: data.classificationType,
      value: data.value.trim(),
      // Manual entry in this phase: staff-set, no AI suggestion yet.
      is_staff_overridden: true,
      ai_suggested_value: null,
      evidence_text: data.evidenceText?.trim() || null,
      evidence_source_url: data.evidenceSourceUrl?.trim() || null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };

    if (existing.data?.id) {
      const { error } = await context.supabase
        .from("classifications")
        .update(row)
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
      return { id: existing.data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("classifications")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { tableName?: string | null; limit?: number }) => ({
    tableName: input?.tableName ?? null,
    limit: Math.min(input?.limit ?? 200, 500),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    let query = context.supabase
      .from("audit_log")
      .select("id, actor_id, table_name, record_id, field_name, old_value, new_value, action, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.tableName) query = query.eq("table_name", data.tableName);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const actorIds = [...new Set(((rows ?? []) as any[]).map((r) => r.actor_id).filter(Boolean))];
    const actorMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: actors } = await context.supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      for (const a of (actors ?? []) as any[]) actorMap.set(a.id, a.name || a.email || a.id);
    }
    return ((rows ?? []) as any[]).map((r) => ({
      ...r,
      actorLabel: r.actor_id ? (actorMap.get(r.actor_id) ?? "Unknown user") : "System",
    }));
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("org_invites")
      .select("id, label, grants_role, expires_at, max_uses, uses, is_active, created_at, organizations(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
