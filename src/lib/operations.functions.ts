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

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Headline picture: the finished baseline read, the yearly cycles, the exceptions. */
export const getOperationsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const supabase = context.supabase;
    const { refreshCycles } = await import("@/lib/operations.server");

    const count = async (table: string, apply?: (query: any) => any) => {
      let query = (supabase as any).from(table).select("*", { count: "exact", head: true });
      if (apply) query = apply(query);
      const { count: total, error } = await query;
      if (error) throw new Error(error.message);
      return total ?? 0;
    };

    const [total, done, success, partial, skipped, failed, blocked, broken, players] =
      await Promise.all([
        count("programs", (q) => q.neq("offering_status", "not_offered")),
        count("crawl_progress"),
        count("crawl_progress", (q) => q.eq("status", "success")),
        count("crawl_progress", (q) => q.eq("status", "partial")),
        count("crawl_progress", (q) => q.eq("status", "skipped")),
        count("crawl_progress", (q) => q.eq("status", "failed")),
        count("host_protection", (q) => q.is("lifted_at", null)),
        count("link_health", (q) => q.eq("link_status", "dead")),
        count("roster_players"),
      ]);

    const { data: latest } = await supabase
      .from("crawl_progress")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return clean({
      baseline: { total, done, success, partial, skipped, failed, players, finishedAt: (latest as any)?.updated_at ?? null },
      exceptions: { blocked, broken },
      cycles: refreshCycles(),
    });
  });

/** Every site whose firewall turns us away, with the teams waiting behind it. */
export const listBlockedSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { blockedSites } = await import("@/lib/operations.server");
    return clean(await blockedSites(context.supabase));
  });

/** Try one site again, right now. */
export const probeBlockedSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { host: string }) => ({ host: String(input?.host ?? "").trim().toLowerCase() }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.host) throw new Error("No site given");
    const { probeOneHost } = await import("@/lib/operations.server");
    return clean(await probeOneHost(context.supabase, data.host));
  });

/** Try the sites waiting longest, a handful at a time, gently. */
export const probeBlockedSiteBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 25) || 25, 1), 100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { probeProtectedHosts } = await import("@/lib/host-protection.server");
    return clean(await probeProtectedHosts(context.supabase, { limit: data.limit }));
  });

/** Addresses the reader could not open. */
export const listBrokenLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { brokenLinks } = await import("@/lib/operations.server");
    return clean(await brokenLinks(context.supabase));
  });

/** Save a corrected address by hand, only if the page actually opens. */
export const fixProgramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string; field: string; url: string }) => ({
    programId: String(input?.programId ?? ""),
    field: String(input?.field ?? ""),
    url: String(input?.url ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { repairProgramLink } = await import("@/lib/operations.server");
    return clean(await repairProgramLink(context.supabase, data));
  });
