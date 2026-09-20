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

/**
 * Where the nationwide crawl has got to. Read straight from the checkpoint
 * table, so it is true across restarts.
 */
export const getCrawlProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const supabase = context.supabase;

    const count = async (status?: string) => {
      let query = supabase.from("crawl_progress").select("program_id", { count: "exact", head: true });
      if (status) query = query.eq("status", status);
      const { count: total, error } = await query;
      if (error) throw new Error(error.message);
      return total ?? 0;
    };

    const [done, success, partial, skipped, failed] = await Promise.all([
      count(),
      count("success"),
      count("partial"),
      count("skipped"),
      count("failed"),
    ]);

    const { count: population } = await supabase
      .from("programs")
      .select("id", { count: "exact", head: true })
      .neq("offering_status", "not_offered");

    const { data: latest } = await supabase
      .from("crawl_progress")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastAt = (latest as { updated_at?: string } | null)?.updated_at ?? null;
    const idleMinutes = lastAt
      ? Math.round((Date.now() - new Date(lastAt).getTime()) / 60000)
      : null;

    return {
      done,
      success,
      partial,
      skipped,
      failed,
      total: population ?? 0,
      lastAt,
      idleMinutes,
      moving: idleMinutes !== null && idleMinutes < 5,
    };
  });
