import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Tables the review queue is allowed to write into. */
const REVIEWABLE_TABLES = ["universities", "programs"] as const;

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

const str = (value: unknown) => String(value ?? "").trim();

type PendingRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  field_name: string | null;
  proposed_value: any;
  source_url: string | null;
  source_type: string;
  ai_confidence: number | null;
  status: string;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Queue read                                                          */
/* ------------------------------------------------------------------ */

export const listPendingChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { tableName?: string | null; status?: string | null }) => ({
    tableName: input?.tableName ? str(input.tableName) : null,
    status: input?.status ? str(input.status) : "pending",
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    let query = context.supabase
      .from("pending_data_changes")
      .select(
        "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at, reviewed_at, reviewer:users!pending_data_changes_reviewed_by_fkey(name, email)",
      )
      .order("ai_confidence", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.tableName) query = query.eq("table_name", data.tableName);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as PendingRow[];

    // Resolve the current live value so the reviewer can compare side by side.
    const byTable = new Map<string, Set<string>>();
    for (const row of list) {
      if (!row.record_id) continue;
      if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
      byTable.get(row.table_name)!.add(row.record_id);
    }

    const live: Record<string, Record<string, any>> = {};
    for (const [table, ids] of byTable) {
      if (!REVIEWABLE_TABLES.includes(table as any)) continue;
      const select =
        table === "programs"
          ? "*, universities(name)"
          : "*";
      const { data: records } = await context.supabase
        .from(table)
        .select(select)
        .in("id", Array.from(ids));
      live[table] = {};
      for (const record of (records ?? []) as any[]) live[table][record.id] = record;
    }

    return {
      rows: list.map((row) => ({
        ...row,
        live: row.record_id ? (live[row.table_name]?.[row.record_id] ?? null) : null,
        liveValue:
          row.record_id && row.field_name
            ? (live[row.table_name]?.[row.record_id]?.[row.field_name] ?? null)
            : null,
      })),
      tables: Array.from(new Set(list.map((row) => row.table_name))).sort(),
    };
  });

/* ------------------------------------------------------------------ */
/* Apply / reject                                                      */
/* ------------------------------------------------------------------ */

async function applyOne(context: { supabase: any; userId: string }, row: PendingRow) {
  if (!REVIEWABLE_TABLES.includes(row.table_name as any)) {
    throw new Error(`Cannot apply changes to ${row.table_name}`);
  }

  let recordId = row.record_id;

  if (!recordId) {
    // Brand-new record proposal — proposed_value is the full row.
    const payload = row.proposed_value;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("New-record proposals must carry an object payload");
    }
    const { data: inserted, error } = await context.supabase
      .from(row.table_name)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    recordId = (inserted as any).id as string;
  } else if (!row.field_name) {
    // Whole-record patch.
    const payload = row.proposed_value;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Record patches must carry an object payload");
    }
    const { error } = await context.supabase
      .from(row.table_name)
      .update(payload)
      .eq("id", recordId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await context.supabase
      .from(row.table_name)
      .update({ [row.field_name]: row.proposed_value })
      .eq("id", recordId);
    if (error) throw new Error(error.message);
  }

  // Record provenance for every field this change touched.
  const fields = row.field_name
    ? [row.field_name]
    : Object.keys((row.proposed_value ?? {}) as Record<string, unknown>);
  const now = new Date().toISOString();

  for (const field of fields) {
    const { data: existing } = await context.supabase
      .from("data_field_sources")
      .select("id")
      .eq("table_name", row.table_name)
      .eq("record_id", recordId)
      .eq("field_name", field)
      .maybeSingle();

    const patch = {
      table_name: row.table_name,
      record_id: recordId,
      field_name: field,
      source_url: row.source_url,
      source_type: row.source_type,
      last_verified_at: now,
      verified_by: context.userId,
    };

    if ((existing as any)?.id) {
      await context.supabase.from("data_field_sources").update(patch).eq("id", (existing as any).id);
    } else {
      await context.supabase.from("data_field_sources").insert(patch);
    }
  }

  const { error: statusError } = await context.supabase
    .from("pending_data_changes")
    .update({ status: "approved", reviewed_by: context.userId, reviewed_at: now })
    .eq("id", row.id)
    .eq("status", "pending");
  if (statusError) throw new Error(statusError.message);

  return recordId;
}

export const approvePendingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({
    ids: (input?.ids ?? []).map(str).filter(Boolean).slice(0, 100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (data.ids.length === 0) throw new Error("Nothing selected");

    const { data: rows, error } = await context.supabase
      .from("pending_data_changes")
      .select(
        "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
      )
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const applied: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const row of (rows ?? []) as PendingRow[]) {
      try {
        await applyOne(context as any, row);
        applied.push(row.id);
      } catch (err) {
        failed.push({ id: row.id, message: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { applied: applied.length, failed };
  });

export const rejectPendingChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({
    ids: (input?.ids ?? []).map(str).filter(Boolean).slice(0, 100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (data.ids.length === 0) throw new Error("Nothing selected");

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

/* ------------------------------------------------------------------ */
/* Roster history                                                      */
/* ------------------------------------------------------------------ */

export const listRosterSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: str(input?.programId) }))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("roster_snapshots")
      .select(
        "id, season_year, pulled_at, position_counts, class_year_counts, transfer_count, juco_transfer_count, source_url",
      )
      .eq("program_id", data.programId)
      .order("pulled_at", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
