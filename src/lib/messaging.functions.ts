import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const str = (value: unknown) => String(value ?? "").trim();

type Ctx = { supabase: any; userId: string };

async function actor(context: Ctx) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, name, organization_id, linked_org_athlete_id, user_type")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  return {
    userId: context.userId,
    roles,
    role: (roles[0] ?? (profile as any)?.user_type ?? "org_staff") as string,
    isSuperadmin: roles.includes("superadmin"),
    organizationId: ((profile as any)?.organization_id ?? null) as string | null,
  };
}

/** Names for the people on a thread; unreadable rows read as "Member". */
async function nameMap(context: Ctx, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, string>();
  const { data } = await context.supabase.from("users").select("id, name, email").in("id", unique);
  return new Map(
    ((data ?? []) as Record<string, any>[]).map((u) => [
      u['id'] as string,
      (u['name'] || u['email'] || "Member") as string,
    ]),
  );
}

/**
 * Opens (or finds) the conversation about one school for one athlete. Every
 * parent on file joins automatically and cannot be taken off by a coach.
 */
export const openThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; programId: string }) => ({
    athleteId: str(input?.athleteId),
    programId: str(input?.programId),
  }))
  .handler(async ({ context, data }) => {
    const me = await actor(context as any);
    if (!data.athleteId || !data.programId) throw new Error("Missing athlete or school");

    const { data: existing } = await context.supabase
      .from("message_threads")
      .select("id")
      .eq("org_athlete_id", data.athleteId)
      .eq("program_id", data.programId)
      .maybeSingle();

    let threadId = (existing as any)?.id as string | undefined;

    if (!threadId) {
      const { data: athlete } = await context.supabase
        .from("org_athletes")
        .select("id, organization_id")
        .eq("id", data.athleteId)
        .maybeSingle();
      if (!athlete) throw new Error("Athlete not found");

      const { data: row, error } = await context.supabase
        .from("message_threads")
        .insert({
          organization_id: (athlete as any).organization_id,
          org_athlete_id: data.athleteId,
          program_id: data.programId,
          created_by: me.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      threadId = (row as any).id as string;
    }

    // Parents first, then the player, then whoever opened it.
    const [{ data: links }, { data: playerRows }] = await Promise.all([
      context.supabase
        .from("athlete_family_links")
        .select("user_id, relationship")
        .eq("org_athlete_id", data.athleteId),
      context.supabase.from("users").select("id").eq("linked_org_athlete_id", data.athleteId),
    ]);

    const wanted: { user_id: string; participant_role: any; removable: boolean }[] = [];
    for (const link of (links ?? []) as Record<string, any>[]) {
      wanted.push({
        user_id: link['user_id'] as string,
        participant_role: (link['relationship'] ?? "parent") as string,
        // A parent is always on the thread and a coach cannot remove them.
        removable: false,
      });
    }
    for (const player of (playerRows ?? []) as Record<string, any>[]) {
      wanted.push({ user_id: player['id'] as string, participant_role: "player", removable: false });
    }
    wanted.push({ user_id: me.userId, participant_role: me.role, removable: true });

    const { data: already } = await context.supabase
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", threadId);
    const have = new Set(((already ?? []) as Record<string, any>[]).map((p) => p['user_id']));
    const missing = wanted.filter((w) => !have.has(w.user_id));
    if (missing.length) {
      await context.supabase
        .from("thread_participants")
        .insert(missing.map((m) => ({ ...m, thread_id: threadId })) as any);
    }

    return { threadId };
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => ({ threadId: str(input?.threadId) }))
  .handler(async ({ context, data }) => {
    const { data: thread, error } = await context.supabase
      .from("message_threads")
      .select("id, org_athlete_id, program_id, is_closed, last_message_at, created_at")
      .eq("id", data.threadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!thread) throw new Error("That conversation is not available to this account");

    const [{ data: messages }, { data: participants }] = await Promise.all([
      context.supabase
        .from("messages")
        .select("id, author_user_id, body, body_original, edited_at, created_at")
        .eq("thread_id", data.threadId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("thread_participants")
        .select("id, user_id, participant_role, removable, last_read_at")
        .eq("thread_id", data.threadId),
    ]);

    const rows = (messages ?? []) as Record<string, any>[];
    const people = (participants ?? []) as Record<string, any>[];
    const names = await nameMap(context as any, [
      ...rows.map((m) => m['author_user_id'] as string),
      ...people.map((p) => p['user_id'] as string),
    ]);

    return {
      thread: thread as Record<string, any>,
      myUserId: context.userId,
      messages: rows.map((m) => ({
        id: m['id'],
        body: m['body'],
        bodyOriginal: m['body_original'],
        editedAt: m['edited_at'],
        createdAt: m['created_at'],
        authorId: m['author_user_id'],
        authorName: names.get(m['author_user_id'] as string) ?? "Member",
        mine: m['author_user_id'] === context.userId,
      })),
      participants: people.map((p) => ({
        id: p['id'],
        userId: p['user_id'],
        name: names.get(p['user_id'] as string) ?? "Member",
        role: p['participant_role'],
        removable: p['removable'],
        lastReadAt: p['last_read_at'],
      })),
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; body: string }) => ({
    threadId: str(input?.threadId),
    body: str(input?.body),
  }))
  .handler(async ({ context, data }) => {
    if (!data.body) throw new Error("Write something first");
    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({ thread_id: data.threadId, author_user_id: context.userId, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId);

    return { id: (row as any).id };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => ({ threadId: str(input?.threadId) }))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const reportThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; messageId?: string | null; reason?: string }) => ({
    threadId: str(input?.threadId),
    messageId: str(input?.messageId) || null,
    reason: str(input?.reason) || null,
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("message_reports").insert({
      thread_id: data.threadId,
      message_id: data.messageId,
      reported_by: context.userId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Console: flagged conversations                                      */
/* ------------------------------------------------------------------ */

export const listThreadReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await actor(context as any);
    if (!me.isSuperadmin) throw new Error("Forbidden: Power Recruit staff only");

    const { data, error } = await context.supabase
      .from("message_reports")
      .select("id, thread_id, message_id, reported_by, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, any>[];

    const threadIds = Array.from(new Set(rows.map((r) => r['thread_id'] as string)));
    let threads: Record<string, any>[] = [];
    if (threadIds.length) {
      const { data: t } = await context.supabase
        .from("message_threads")
        .select("id, org_athlete_id, program_id, organizations(name), org_athletes(name)")
        .in("id", threadIds);
      threads = (t ?? []) as Record<string, any>[];
    }
    const names = await nameMap(context as any, rows.map((r) => r['reported_by'] as string));

    return rows.map((r) => {
      const thread = threads.find((t) => t['id'] === r['thread_id']);
      return {
        id: r['id'],
        threadId: r['thread_id'],
        messageId: r['message_id'],
        reason: r['reason'],
        status: r['status'],
        createdAt: r['created_at'],
        reportedBy: names.get(r['reported_by'] as string) ?? "Member",
        organization: (thread as any)?.organizations?.name ?? null,
        athlete: (thread as any)?.org_athletes?.name ?? null,
      };
    });
  });

export const resolveThreadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string }) => ({
    id: str(input?.id),
    status: str(input?.status) === "open" ? "open" : "closed",
  }))
  .handler(async ({ context, data }) => {
    const me = await actor(context as any);
    if (!me.isSuperadmin) throw new Error("Forbidden: Power Recruit staff only");
    const { error } = await context.supabase
      .from("message_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
