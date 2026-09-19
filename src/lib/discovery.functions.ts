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

/** One page of links that actually have a URL to decide on, grouped by school. */
export const listDiscoveredUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { page?: number; pageSize?: number }) => ({
    page: Math.max(1, Number(input?.page ?? 1)),
    pageSize: Math.min(Math.max(Number(input?.pageSize ?? 50), 10), 100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await context.supabase
      .from("url_discovery_queue")
      .select(
        "id, university_id, program_id, discovery_type, discovered_url, confidence, notes, created_at, universities(name, state, website_url), programs(sport, athletic_website, offering_status)",
        { count: "exact" },
      )
      .eq("status", "pending_review")
      .not("discovered_url", "is", null)
      .order("university_id", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    // Never ask about a sport a school may not even play. Links for a program
    // we haven't confirmed is sponsored — or one we know isn't — wait until the
    // sponsorship check settles it, instead of filling this screen.
    const all = (rows ?? []) as any[];
    const visible = all.filter((row) => {
      const status = row.programs?.offering_status;
      return !status || status === "verified";
    });

    const total = count ?? 0;
    return JSON.parse(
      JSON.stringify({
        rows: visible,
        hiddenUnsponsored: all.length - visible.length,
        total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
      }),
    );
  });

/** Schools where the search came back empty — nothing to approve, retry or paste. */
export const listUnfoundLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { page?: number; pageSize?: number }) => ({
    page: Math.max(1, Number(input?.page ?? 1)),
    pageSize: Math.min(Math.max(Number(input?.pageSize ?? 50), 10), 100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await context.supabase
      .from("url_discovery_queue")
      .select(
        "id, university_id, program_id, discovery_type, notes, created_at, universities(name, state, website_url), programs(sport)",
        { count: "exact" },
      )
      .eq("status", "pending_review")
      .is("discovered_url", null)
      .order("university_id", { ascending: true })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return JSON.parse(
      JSON.stringify({
        rows: rows ?? [],
        total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
      }),
    );
  });

export const countPendingDiscoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const base = () =>
      context.supabase
        .from("url_discovery_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");

    const [withUrl, withoutUrl] = await Promise.all([
      base().not("discovered_url", "is", null),
      base().is("discovered_url", null),
    ]);
    if (withUrl.error) throw new Error(withUrl.error.message);
    if (withoutUrl.error) throw new Error(withoutUrl.error.message);
    return { pending: withUrl.count ?? 0, unfound: withoutUrl.count ?? 0 };
  });

/** Preview, or run the tidy-up pass over the whole pile of waiting links. */
export const sweepDiscoveredLinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean; limit?: number }) => ({
    apply: Boolean(input?.apply),
    limit: Math.min(Math.max(Number(input?.limit ?? 1000), 1), 1000),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { sweepLinksUntilDone } = await import("@/lib/link-sweep.server");
    const counts = await sweepLinksUntilDone(context.supabase, context.userId, {
      apply: data.apply,
    });
    return JSON.parse(JSON.stringify(counts));
  });


/** Type in the right link by hand when the search keeps coming up empty. */
export const setLinkManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; url: string }) => ({
    id: String(input.id),
    url: String(input.url ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!/^https?:\/\/\S+\.\S+/i.test(data.url)) {
      throw new Error("That doesn't look like a web address — it should start with https://");
    }

    const { data: row, error } = await context.supabase
      .from("url_discovery_queue")
      .select("id, university_id, program_id, discovery_type, status")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if ((row as any).status !== "pending_review") throw new Error("Already reviewed");

    const { applyDiscoveredUrl } = await import("@/lib/discovery.server");
    await applyDiscoveredUrl(
      context.supabase,
      { ...(row as any), discovered_url: data.url },
      { humanDecision: true },
    );

    const { error: updateError } = await context.supabase
      .from("url_discovery_queue")
      .update({
        discovered_url: data.url,
        confidence: "high",
        status: "confirmed",
        notes: "Entered by hand.",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending_review");
    if (updateError) throw new Error(updateError.message);
    return { ok: true, message: "Saved to live data." };
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
      await applyDiscoveredUrl(context.supabase, row as any, { humanDecision: true });
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


/** Decide a whole page of links at once. */
export const reviewDiscoveredUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; decision: "confirm" | "reject" }) => ({
    ids: (Array.isArray(input?.ids) ? input.ids : []).slice(0, 100).map(String),
    decision: input.decision === "confirm" ? ("confirm" as const) : ("reject" as const),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.ids.length) return { ok: true, done: 0, failed: 0, requeued: 0 };

    const { data: rows, error } = await context.supabase
      .from("url_discovery_queue")
      .select("id, university_id, program_id, discovery_type, discovered_url, status")
      .in("id", data.ids)
      .eq("status", "pending_review");
    if (error) throw new Error(error.message);

    const { applyDiscoveredUrl, requeueSchoolForDiscovery } = await import("@/lib/discovery.server");
    const now = new Date().toISOString();
    let done = 0;
    let failed = 0;
    let requeued = 0;
    const schools = new Set<string>();

    for (const row of (rows ?? []) as any[]) {
      try {
        if (data.decision === "confirm")
          await applyDiscoveredUrl(context.supabase, row, { humanDecision: true });
        const { error: updateError } = await context.supabase
          .from("url_discovery_queue")
          .update({
            status: data.decision === "confirm" ? "confirmed" : "rejected",
            reviewed_by: context.userId,
            reviewed_at: now,
          })
          .eq("id", row.id)
          .eq("status", "pending_review");
        if (updateError) throw new Error(updateError.message);
        done += 1;
        if (data.decision === "reject") schools.add(String(row.university_id));
      } catch {
        failed += 1;
      }
    }

    for (const universityId of schools) {
      const outcome = await requeueSchoolForDiscovery(context.supabase, universityId);
      if (outcome.requeued) requeued += 1;
    }

    return { ok: true, done, failed, requeued };
  });

/** The search kept guessing the wrong domain — save the real athletics site. */
export const setAthleticsSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; url: string }) => ({
    id: String(input.id),
    url: String(input.url ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!/^https?:\/\/\S+\.\S+/i.test(data.url)) {
      throw new Error("That doesn't look like a web address — it should start with https://");
    }

    const { data: row, error } = await context.supabase
      .from("url_discovery_queue")
      .select("id, university_id")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { setAthleticsSiteByHand } = await import("@/lib/discovery.server");
    const outcome = await setAthleticsSiteByHand(
      context.supabase,
      String((row as any).university_id),
      data.url,
      context.userId,
    );
    return { ok: true, ...outcome };
  });

/** This school doesn't field that sport, so its pages are never coming. */
export const markSportNotOffered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: String(input.programId) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { markProgramNotOffered } = await import("@/lib/discovery.server");
    const outcome = await markProgramNotOffered(context.supabase, data.programId, context.userId);
    return {
      ok: true,
      ...outcome,
      message: `Marked as not offered — ${outcome.closedLinks} link request${outcome.closedLinks === 1 ? "" : "s"} closed.`,
    };
  });
