import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PENDING_COLUMNS =
  "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, reviewed_by, reviewed_at, created_at";

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

export const listPendingChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: {
      status?: string | null;
      programId?: string | null;
      search?: string | null;
      confidence?: string | null;
      kind?: string | null;
      page?: number | null;
      pageSize?: number | null;
    }) => ({
      status: input?.status ?? "pending",
      programId: input?.programId ? String(input.programId) : null,
      search: input?.search ? String(input.search).trim() : "",
      confidence: input?.confidence ?? "all",
      kind: input?.kind ?? "all",
      page: Math.max(Number(input?.page ?? 1) || 1, 1),
      pageSize: Math.min(Math.max(Number(input?.pageSize ?? 25) || 25, 5), 100),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    // Read one window of items straight from the database instead of pulling
    // thousands of rows and slicing them here — that's what made this screen
    // sit blank for the better part of a minute.
    // A smaller window per page: preparing 200 items with their live values took
    // most of a minute, which read as a blank screen.
    const itemsPerPage = data.pageSize * 2;

    const from = (data.page - 1) * itemsPerPage;
    let query = context.supabase
      .from("pending_data_changes")
      .select(PENDING_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, from + itemsPerPage - 1);
    if (data.status && data.status !== "all") query = query.eq("status", data.status as any);

    if (data.programId) {
      // A program's items live under the program id and its school's id.
      const { data: program } = await context.supabase
        .from("programs")
        .select("id, university_id")
        .eq("id", data.programId)
        .maybeSingle();
      const ids = [data.programId, (program as any)?.university_id].filter(Boolean) as string[];
      query = query.in("record_id", ids);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // The total comes from its own count, and falls back to an estimate: an
    // exact count over tens of thousands of rows can time out and used to take
    // the whole screen down with it.
    const countFilter = () => {
      let base = context.supabase.from("pending_data_changes");
      return base;
    };
    let totalItems = 0;
    {
      let exact = countFilter().select("id", { count: "exact", head: true });
      if (data.status && data.status !== "all") exact = exact.eq("status", data.status as any);
      const exactResult = await exact;
      if (exactResult.error) {
        let planned = countFilter().select("id", { count: "planned", head: true });
        if (data.status && data.status !== "all") planned = planned.eq("status", data.status as any);
        const plannedResult = await planned;
        totalItems = plannedResult.count ?? 0;
      } else {
        totalItems = exactResult.count ?? 0;
      }
    }

    const { decoratePending, groupPending } = await import("@/lib/review.server");
    const decorated = await decoratePending(context.supabase, (rows ?? []) as any[]);
    let groups = await groupPending(context.supabase, decorated as any[]);




    if (data.confidence !== "all" || data.kind !== "all") {
      groups = groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item: any) => {
            const score = item.ai_confidence;
            if (data.confidence === "low" && !(score == null || score < 0.7)) return false;
            if (data.confidence === "medium" && !(score != null && score >= 0.7 && score < 0.9))
              return false;
            if (data.confidence === "high" && !(score != null && score >= 0.9)) return false;
            if (data.kind === "roster" && item.table_name !== "roster_players") return false;
            if (data.kind === "new" && item.record_id) return false;
            if (data.kind === "conflict") {
              const value = item.proposed_value;
              if (!value || typeof value !== "object" || !Array.isArray(value["_alternates"]))
                return false;
            }
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0);
    }

    if (data.search) {
      const needle = data.search.toLowerCase();
      groups = groups.filter((group) => group.schoolName.toLowerCase().includes(needle));
    }

    const filteredItems = groups.reduce((sum, group) => sum + group.items.length, 0);
    const totalGroups = groups.length;

    return {
      groups,
      totalGroups,
      totalItems,
      filteredItems,
      totalPages: Math.max(1, Math.ceil(totalItems / itemsPerPage)),
      conflicts: groups.reduce((sum, group) => sum + group.conflicts, 0),
      page: data.page,
      pageSize: data.pageSize,
    };

  });


export const countPendingChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);

    // Exact counts can time out on a large table — fall back to a planned
    // estimate instead of failing the whole page.
    let pending = 0;
    const exact = await context.supabase
      .from("pending_data_changes")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (exact.error) {
      const planned = await context.supabase
        .from("pending_data_changes")
        .select("id", { count: "planned", head: true })
        .eq("status", "pending");
      pending = planned.count ?? 0;
    } else {
      pending = exact.count ?? 0;
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: autoCount } = await context.supabase
      .from("pending_data_changes")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("decided_via", "auto")
      .gte("reviewed_at", since);

    return { pending, autoAppliedLast7Days: autoCount ?? 0 };
  });


export const approvePendingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({ ids: (input.ids ?? []).map(String) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.ids.length) throw new Error("Nothing selected");

    const { data: rows, error } = await context.supabase
      .from("pending_data_changes")
      .select(PENDING_COLUMNS)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const { approvePending } = await import("@/lib/review.server");
    let applied = 0;
    const failures: { id: string; message: string }[] = [];
    for (const row of (rows ?? []) as any[]) {
      try {
        await approvePending(context.supabase, context.userId, row);
        applied += 1;
      } catch (failure) {
        failures.push({ id: row.id, message: (failure as Error).message });
      }
    }
    return { applied, failures };
  });

/**
 * Tidy the whole open queue: drop items whose proposed value already matches
 * what we store, and apply blank-field fills confirmed by an official source.
 * `apply: false` is a preview.
 */
export const sweepReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean; limit?: number | null }) => ({
    apply: Boolean(input?.apply),
    // Bounded batches: a backlog of thousands is worked a slice at a time so a
    // single request never runs past its budget.
    limit: Math.min(Math.max(Number(input?.limit ?? 1000) || 1000, 100), 1000),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { sweepPendingUntilDone } = await import("@/lib/review.server");
    return sweepPendingUntilDone(context.supabase, context.userId, data.apply);

  });

/**
 * Approve every open item matching the current filters — across all pages, not
 * just the ones on screen. Rosters and brand-new records are never included:
 * those always get looked at individually.
 */
export const approveMatchingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { search?: string | null; minConfidence?: number | null; officialOnly?: boolean }) => ({
      search: input?.search ? String(input.search).trim().toLowerCase() : "",
      minConfidence: Math.min(Math.max(Number(input?.minConfidence ?? 0.9) || 0.9, 0), 1),
      officialOnly: input?.officialOnly !== false,
    }),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    const { data: rows, error } = await context.supabase
      .from("pending_data_changes")
      .select(PENDING_COLUMNS)
      .eq("status", "pending")
      .in("table_name", ["universities", "programs"])
      .not("field_name", "is", null)
      .not("record_id", "is", null)
      .gte("ai_confidence", data.minConfidence)
      .limit(5000);
    if (error) throw new Error(error.message);

    const { approvePending, decoratePending } = await import("@/lib/review.server");
    let candidates = await decoratePending(context.supabase, (rows ?? []) as any[]);
    if (data.officialOnly) {
      candidates = candidates.filter((row: any) => row.source_type === "official");
    }
    if (data.search) {
      candidates = candidates.filter((row: any) =>
        String(row.recordLabel ?? "").toLowerCase().includes(data.search),
      );
    }

    let applied = 0;
    const failures: { id: string; message: string }[] = [];
    for (const row of candidates as any[]) {
      try {
        await approvePending(context.supabase, context.userId, row);
        applied += 1;
      } catch (failure) {
        failures.push({ id: row.id, message: (failure as Error).message });
      }
    }
    return { applied, failures: failures.slice(0, 5), failureCount: failures.length };
  });


/**
 * Approve an item after a human edited the value (e.g. the scraper read the
 * wrong roster season). The system's original proposal is kept for the record.
 */
export const approveCorrectedChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; value: unknown; note?: string | null }) => ({
    id: String(input.id),
    value: input.value,
    note: input.note ? String(input.note).slice(0, 500) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    const { data: row, error } = await context.supabase
      .from("pending_data_changes")
      .select(`${PENDING_COLUMNS}, original_value, review_note`)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That item is no longer in the queue");
    const current = row as any;
    if (current.status !== "pending") throw new Error("Already reviewed");

    const original = current.original_value ?? current.proposed_value;
    let corrected: any = data.value;
    if (current.field_name) {
      const previous =
        current.proposed_value && typeof current.proposed_value === "object"
          ? current.proposed_value[current.field_name]
          : current.proposed_value;
      corrected = coerceLike(previous, data.value);
      if (current.proposed_value && typeof current.proposed_value === "object") {
        corrected = { ...current.proposed_value, [current.field_name]: corrected };
      }
    } else if (current.table_name === "roster_players") {
      corrected = { ...(current.proposed_value ?? {}), ...(data.value as any) };
    }

    const { error: saveError } = await context.supabase
      .from("pending_data_changes")
      .update({
        proposed_value: corrected,
        original_value: original,
        review_note: data.note,
        decided_via: "human_corrected",
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (saveError) throw new Error(saveError.message);

    const { approvePending } = await import("@/lib/review.server");
    await approvePending(context.supabase, context.userId, {
      ...current,
      proposed_value: corrected,
    } as any);
    return { applied: 1 };
  });

/** Keep a corrected value in the shape the column expects. */
function coerceLike(previous: unknown, next: unknown) {
  if (typeof next !== "string") return next;
  const text = next.trim();
  if (text === "") return null;
  if (typeof previous === "number") {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : text;
  }
  if (typeof previous === "boolean") return /^(true|yes|1)$/i.test(text);
  return text;
}

export const rejectPendingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; reason?: string | null }) => ({
    ids: (input.ids ?? []).map(String),
    reason: input.reason ? String(input.reason).slice(0, 500) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.ids.length) throw new Error("Nothing selected");

    const { data: rows } = await context.supabase
      .from("pending_data_changes")
      .select("id, table_name, record_id, proposed_value")
      .in("id", data.ids);

    const { error } = await context.supabase
      .from("pending_data_changes")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.reason,
        decided_via: "human",
      })
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    // Declining always means "read this program again" — no opt-in needed.
    let requeued = 0;
    const programIds = new Set<string>();
    for (const row of (rows ?? []) as any[]) {
      const candidate =
        row.table_name === "programs"
          ? row.record_id
          : row.table_name === "roster_players"
            ? (row.proposed_value?.program_id ?? row.record_id)
            : null;
      if (candidate) programIds.add(String(candidate));
    }
    for (const programId of programIds) {
      const { error: queueError } = await context.supabase
        .from("ingest_queue")
        .update({ status: "pending", attempts: 0, last_error: null, leased_at: null })
        .eq("program_id", programId)
        .eq("stage", "program_scrape");
      if (!queueError) requeued += 1;
    }


    return { rejected: data.ids.length, requeued };
  });


export const listRosterSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: String(input.programId) }))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("roster_snapshots")
      .select(
        "id, program_id, season_year, pulled_at, position_counts, class_year_counts, transfer_count, juco_transfer_count, source_url",
      )
      .eq("program_id", data.programId)
      .order("pulled_at", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
