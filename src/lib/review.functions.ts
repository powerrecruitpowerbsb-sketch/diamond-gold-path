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
    let query = context.supabase
      .from("pending_data_changes")
      .select(PENDING_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(3000);
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

    const { decoratePending, groupPending } = await import("@/lib/review.server");
    const decorated = await decoratePending(context.supabase, (rows ?? []) as any[]);
    let groups = await groupPending(context.supabase, decorated as any[]);

    const totalItems = decorated.length;

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
    const start = (data.page - 1) * data.pageSize;
    const page = groups.slice(start, start + data.pageSize);

    return {
      groups: page,
      totalGroups,
      totalItems,
      filteredItems,
      conflicts: groups.reduce((sum, group) => sum + group.conflicts, 0),
      page: data.page,
      pageSize: data.pageSize,
    };
  });


export const countPendingChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { count, error } = await context.supabase
      .from("pending_data_changes")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: autoCount } = await context.supabase
      .from("pending_data_changes")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("decided_via", "auto")
      .gte("reviewed_at", since);

    return { pending: count ?? 0, autoAppliedLast7Days: autoCount ?? 0 };
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

export const rejectPendingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({ ids: (input.ids ?? []).map(String) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.ids.length) throw new Error("Nothing selected");
    const { error } = await context.supabase
      .from("pending_data_changes")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { rejected: data.ids.length };
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
