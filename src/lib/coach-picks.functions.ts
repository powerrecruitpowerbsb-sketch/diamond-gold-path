import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Coach picks: staff push a college onto a player's list. The player sees
 * "Coach pick · <name>" and the optional message; the staff note lives in a
 * separate staff-only table so no family read can ever reach it.
 */
const str = (v: unknown) => String(v ?? "").trim();

async function requireStaff(sb: any, userId: string) {
  const { data } = await sb.from("users").select("name, email, user_type").eq("id", userId).maybeSingle();
  const role = (data as any)?.user_type;
  if (!["superadmin", "org_owner", "org_admin", "org_staff"].includes(role)) {
    throw new Error("Only club staff can pick schools for a player");
  }
  const name = str((data as any)?.name) || str((data as any)?.email).split("@")[0] || "Coach";
  return { name };
}

export const findProgramsForAthlete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { athleteId: string; q: string }) => ({ athleteId: str(i?.athleteId), q: str(i?.q) }))
  .handler(async ({ context, data }) => {
    if (data.q.length < 2) return { results: [] };
    const sb = context.supabase as any;
    const { data: a } = await sb.from("org_athletes").select("sport").eq("id", data.athleteId).maybeSingle();
    const safe = data.q.replace(/[%,()]/g, " ");
    const { data: rows, error } = await sb
      .from("programs")
      .select("id, sport, governing_body, division, offering_status, universities!inner(name, state)")
      .eq("sport", a?.sport ?? "baseball")
      .neq("offering_status", "not_offered")
      .ilike("universities.name", `%${safe}%`)
      .limit(12);
    if (error) throw new Error(error.message);
    return {
      results: ((rows ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: r.universities?.name as string,
        state: (r.universities?.state ?? null) as string | null,
        level: r.governing_body === "NCAA" ? String(r.division ?? "NCAA") : String(r.governing_body ?? ""),
      })),
    };
  });

export const listCoachPicks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { athleteId: string }) => ({ athleteId: str(i?.athleteId) }))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    await requireStaff(sb, context.userId);
    const { data: rows, error } = await sb
      .from("athlete_saved_schools")
      .select(
        "id, status, program_id, recommended_by_name, recommended_at, coach_message, programs:program_id (governing_body, division, universities:university_id (name, state))",
      )
      .eq("org_athlete_id", data.athleteId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const ids = list.map((r) => r.id);
    const notes = new Map<string, string>();
    if (ids.length) {
      const { data: n } = await sb.from("saved_school_staff_notes").select("saved_school_id, note").in("saved_school_id", ids);
      for (const r of (n ?? []) as any[]) notes.set(r.saved_school_id, r.note);
    }
    return {
      schools: list.map((r) => ({
        id: r.id as string,
        programId: r.program_id as string,
        status: r.status as string,
        name: (r.programs?.universities?.name ?? "College") as string,
        state: (r.programs?.universities?.state ?? null) as string | null,
        pickedBy: (r.recommended_by_name ?? null) as string | null,
        message: (r.coach_message ?? null) as string | null,
        staffNote: notes.get(r.id) ?? null,
      })),
    };
  });

export const recommendSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { athleteId: string; programId: string; message?: string | null; staffNote?: string | null }) => ({
      athleteId: str(i?.athleteId),
      programId: str(i?.programId),
      message: str(i?.message).slice(0, 500) || null,
      staffNote: str(i?.staffNote).slice(0, 2000) || null,
    }),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const { name } = await requireStaff(sb, context.userId);
    const pick = {
      recommended_by_user_id: context.userId,
      recommended_by_name: name,
      recommended_at: new Date().toISOString(),
      coach_message: data.message,
    };
    const { data: existing } = await sb
      .from("athlete_saved_schools")
      .select("id")
      .eq("org_athlete_id", data.athleteId)
      .eq("program_id", data.programId)
      .maybeSingle();
    let id: string;
    if (existing) {
      const { error } = await sb.from("athlete_saved_schools").update(pick).eq("id", existing.id);
      if (error) throw new Error(error.message);
      id = existing.id;
    } else {
      const { data: row, error } = await sb
        .from("athlete_saved_schools")
        .insert({ org_athlete_id: data.athleteId, program_id: data.programId, status: "researching", added_by_user_id: context.userId, ...pick })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = row.id;
    }
    await saveNote(sb, id, data.staffNote, context.userId);
    return { id };
  });

async function saveNote(sb: any, id: string, note: string | null, userId: string) {
  if (note) {
    const { error } = await sb
      .from("saved_school_staff_notes")
      .upsert({ saved_school_id: id, note, updated_by: userId }, { onConflict: "saved_school_id" });
    if (error) throw new Error(error.message);
  } else {
    await sb.from("saved_school_staff_notes").delete().eq("saved_school_id", id);
  }
}

export const updateCoachPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; message?: string | null; staffNote?: string | null; unpick?: boolean }) => ({
    id: str(i?.id),
    message: str(i?.message).slice(0, 500) || null,
    staffNote: str(i?.staffNote).slice(0, 2000) || null,
    unpick: !!i?.unpick,
  }))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    await requireStaff(sb, context.userId);
    const patch = data.unpick
      ? { recommended_by_user_id: null, recommended_by_name: null, recommended_at: null, coach_message: null }
      : { coach_message: data.message };
    const { error } = await sb.from("athlete_saved_schools").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!data.unpick) await saveNote(sb, data.id, data.staffNote, context.userId);
    return { ok: true };
  });
