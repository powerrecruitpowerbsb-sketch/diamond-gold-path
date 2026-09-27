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

    // One row per person: a player may also appear as their own family link.
    const seen = new Set<string>();
    const deduped = wanted.filter((w) => {
      if (seen.has(w.user_id)) return false;
      seen.add(w.user_id);
      return true;
    });

    const { data: already } = await context.supabase
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", threadId);
    const have = new Set(((already ?? []) as Record<string, any>[]).map((p) => p['user_id']));
    const missing = deduped.filter((w) => !have.has(w.user_id));
    if (missing.length) {
      const { error: participantError } = await context.supabase
        .from("thread_participants")
        .insert(missing.map((m) => ({ ...m, thread_id: threadId })) as any);
      if (participantError) throw new Error(participantError.message);
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
    await joinThreadIfNeeded(context as any, data.threadId);
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
    if (!me.isSuperadmin) throw new Error("Forbidden: Curve Recruit staff only");

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
    if (!me.isSuperadmin) throw new Error("Forbidden: Curve Recruit staff only");
    const { error } = await context.supabase
      .from("message_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Messages hub: every conversation this account can see               */
/* ------------------------------------------------------------------ */

export const listMyThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: threads, error } = await context.supabase
      .from("message_threads")
      .select(
        "id, org_athlete_id, program_id, is_closed, last_message_at, created_at, org_athletes(name), programs(sport, universities(name)), thread_participants(user_id, last_read_at)",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (threads ?? []) as Record<string, any>[];
    const ids = rows.map((t) => t['id'] as string);

    let msgs: Record<string, any>[] = [];
    if (ids.length) {
      const { data } = await context.supabase
        .from("messages")
        .select("thread_id, author_user_id, body, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(3000);
      msgs = (data ?? []) as Record<string, any>[];
    }
    const names = await nameMap(context as any, msgs.map((m) => m['author_user_id'] as string));

    const list = rows.map((t) => {
      const mine = ((t['thread_participants'] ?? []) as any[]).find((p) => p.user_id === context.userId);
      const lastRead = mine?.last_read_at ? new Date(mine.last_read_at).getTime() : 0;
      const tm = msgs.filter((m) => m['thread_id'] === t['id']);
      const last = tm[0];
      const unread = mine
        ? tm.filter((m) => m['author_user_id'] !== context.userId && new Date(m['created_at']).getTime() > lastRead).length
        : 0;
      return {
        id: t['id'] as string,
        athleteId: t['org_athlete_id'] as string,
        athlete: (t['org_athletes']?.name ?? "Player") as string,
        school: (t['programs']?.universities?.name ?? "School") as string,
        sport: (t['programs']?.sport ?? null) as string | null,
        closed: Boolean(t['is_closed']),
        lastAt: (last?.['created_at'] ?? t['last_message_at'] ?? t['created_at']) as string,
        preview: (last?.['body'] ?? "") as string,
        lastAuthor: last ? (last['author_user_id'] === context.userId ? "You" : names.get(last['author_user_id']) ?? "Member") : null,
        unread,
        participating: Boolean(mine),
      };
    });
    list.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return { threads: list, unreadTotal: list.reduce((s, t) => s + t.unread, 0) };
  });

/** Staff who reply to a thread they were not on join it (removable). */
const joinThreadIfNeeded = async (context: Ctx, threadId: string) => {
  const { data } = await context.supabase
    .from("thread_participants")
    .select("id")
    .eq("thread_id", threadId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (data) return;
  const me = await actor(context);
  await context.supabase
    .from("thread_participants")
    .insert({ thread_id: threadId, user_id: context.userId, participant_role: me.role, removable: true });
};

/* ------------------------------------------------------------------ */
/* New conversation: school lookup                                     */
/* ------------------------------------------------------------------ */

export const newThreadSchools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[]; q?: string; sport?: string | null }) => ({
    ids: Array.isArray(input?.ids) ? input.ids.slice(0, 150).map(String) : [],
    q: str(input?.q).slice(0, 80),
    sport: str(input?.sport) || null,
  }))
  .handler(async ({ context, data }) => {
    const shape = (rows: any[]) =>
      rows.map((p) => ({
        id: p.id as string,
        name: (p.universities?.name ?? "School") as string,
        state: (p.universities?.state ?? null) as string | null,
        sport: p.sport as string,
        division: (p.division ?? p.governing_body ?? null) as string | null,
      }));
    const cols = "id, sport, division, governing_body, universities!inner(name, state)";
    const saved = data.ids.length
      ? shape(((await context.supabase.from("programs").select(cols).in("id", data.ids)).data ?? []) as any[])
      : [];
    let results: ReturnType<typeof shape> = [];
    if (data.q.length >= 2) {
      let q = context.supabase
        .from("programs")
        .select(cols)
        .ilike("universities.name", `%${data.q.replace(/[%_,]/g, " ")}%`)
        .limit(25);
      if (data.sport === "baseball" || data.sport === "softball") q = q.eq("sport", data.sport);
      results = shape(((await q).data ?? []) as any[]);
    }
    return { saved, results };
  });
