import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Scrape + extract + file proposals for one program. Superadmin only. */
export const runProgramIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: String(input.programId) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { findActiveRun, ingestProgram } = await import("@/lib/ingest.server");

    const active = await findActiveRun(context.supabase, data.programId);
    if (active) {
      throw new Error("A data pull is already running for this program. Wait for it to finish.");
    }

    const outcome = await ingestProgram(context.supabase, context.userId, data.programId);
    return JSON.parse(JSON.stringify(outcome));
  });

/** Recent pull history for a program, newest first. */
export const listIngestRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: String(input.programId) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { data: rows, error } = await context.supabase
      .from("ingestion_runs")
      .select(
        "id, status, url_results, proposals_created, snapshot_written, error_message, started_at, finished_at",
      )
      .eq("program_id", data.programId)
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return JSON.parse(JSON.stringify(rows ?? []));
  });
