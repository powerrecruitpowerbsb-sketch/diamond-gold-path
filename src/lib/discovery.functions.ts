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

/** Find athletics site + roster/coaching pages for one school. Staging only. */
export const runUrlDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string }) => ({
    universityId: String(input.universityId),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { discoverUniversityUrls } = await import("@/lib/discovery.server");
    const outcome = await discoverUniversityUrls(context.supabase, data.universityId);
    return JSON.parse(JSON.stringify(outcome));
  });

/** Run discovery across a batch of schools, one after another. */
export const runUrlDiscoveryBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityIds: string[] }) => ({
    universityIds: (Array.isArray(input?.universityIds) ? input.universityIds : [])
      .slice(0, 40)
      .map(String),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { discoverUniversityUrls } = await import("@/lib/discovery.server");
    const outcomes: {
      universityId: string;
      universityName: string;
      queued: number;
      errorMessage: string | null;
    }[] = [];

    for (const universityId of data.universityIds) {
      try {
        const outcome = await discoverUniversityUrls(context.supabase, universityId);
        outcomes.push({
          universityId,
          universityName: outcome.universityName,
          queued: outcome.results.filter((r) => r.url).length,
          errorMessage: outcome.errorMessage,
        });
      } catch (failure) {
        outcomes.push({
          universityId,
          universityName: "",
          queued: 0,
          errorMessage: failure instanceof Error ? failure.message : "Discovery failed",
        });
      }
    }

    return JSON.parse(JSON.stringify(outcomes));
  });

/** Pending discoveries, low confidence first, then high, then failures. */
export const listDiscoveredUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("url_discovery_queue")
      .select(
        "id, university_id, program_id, discovery_type, discovered_url, confidence, notes, created_at, universities(name, state), programs(sport)",
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rank: Record<string, number> = { low: 0, high: 1, failed: 2 };
    const rows = [...((data ?? []) as any[])].sort(
      (a, b) => (rank[a.confidence] ?? 3) - (rank[b.confidence] ?? 3),
    );
    return JSON.parse(JSON.stringify(rows));
  });

export const countPendingDiscoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { count, error } = await context.supabase
      .from("url_discovery_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review");
    if (error) throw new Error(error.message);
    return { pending: count ?? 0 };
  });

/** Confirm writes the URL to live data; reject only marks the item rejected. */
export const reviewDiscoveredUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "confirm" | "reject" }) => ({
    id: String(input.id),
    decision: input.decision === "confirm" ? ("confirm" as const) : ("reject" as const),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    const { data: row, error } = await context.supabase
      .from("url_discovery_queue")
      .select("id, university_id, program_id, discovery_type, discovered_url, status")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if ((row as any).status !== "pending_review") throw new Error("Already reviewed");

    if (data.decision === "confirm") {
      const { applyDiscoveredUrl } = await import("@/lib/discovery.server");
      await applyDiscoveredUrl(context.supabase, row as any);
    }

    const { error: updateError } = await context.supabase
      .from("url_discovery_queue")
      .update({
        status: data.decision === "confirm" ? "confirmed" : "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending_review");
    if (updateError) throw new Error(updateError.message);

    // A decline means "this link is wrong" — go look for a better one. The
    // rejected URL is remembered, so it can't come back as a suggestion.
    if (data.decision === "reject") {
      const { requeueSchoolForDiscovery } = await import("@/lib/discovery.server");
      const outcome = await requeueSchoolForDiscovery(
        context.supabase,
        String((row as any).university_id),
        (row as any).discovery_type,
      );
      return { ok: true, requeued: outcome.requeued, message: outcome.reason };
    }

    return { ok: true, requeued: false, message: "Saved to live data." };
  });

