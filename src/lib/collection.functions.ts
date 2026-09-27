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

/** Live picture of the nationwide collection run. */
export const getCollectionProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { collectionProgress } = await import("@/lib/collection.server");
    return clean(await collectionProgress(context.supabase));
  });

/**
 * Begin collecting: top the queue up, clear the tallies, open the gate, and ask
 * the database to nudge the runner every minute so the work continues with no
 * page open.
 */
export const startCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { enqueueMissingWork } = await import("@/lib/ingest-queue.server");
    const { markCollectionStarted, collectionProgress } = await import("@/lib/collection.server");
    const queued = await enqueueMissingWork(context.supabase);
    await markCollectionStarted(context.supabase);
    const { error } = await context.supabase.rpc("collection_cron_start");
    if (error) throw new Error(error.message);
    return clean({ queued, progress: await collectionProgress(context.supabase) });
  });

/** Ask the run to stop, and take the every-minute schedule away. */
export const stopCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { requestCollectionStop, markCollectionFinished, collectionProgress } = await import(
      "@/lib/collection.server"
    );
    await requestCollectionStop(context.supabase, "Stopped by a superadmin");
    await markCollectionFinished(context.supabase, "Stopped by a superadmin");
    const { error } = await context.supabase.rpc("collection_cron_stop");
    if (error) throw new Error(error.message);
    return clean(await collectionProgress(context.supabase));
  });

/**
 * Do one bounded pass. The admin screen calls this repeatedly while the run is
 * open, so progress keeps moving without any single long-lived request.
 */
export const runCollectionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { discoverySchools?: number; scrapePrograms?: number; workers?: number }) => ({
    discoverySchools: Math.min(Math.max(Number(input?.discoverySchools ?? 6) || 0, 0), 40),
    scrapePrograms: Math.min(Math.max(Number(input?.scrapePrograms ?? 6) || 0, 0), 40),
    workers: Math.min(Math.max(Number(input?.workers ?? 4) || 4, 1), 8),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const {
      readCollectionState,
      runCollectionPass,
      markCollectionFinished,
      collectionProgress,
    } = await import("@/lib/collection.server");

    const state = await readCollectionState(context.supabase);
    if (state.stopRequested || !state.isRunning) {
      return clean({
        stopped: true,
        pass: null,
        progress: await collectionProgress(context.supabase),
      });
    }

    const pass = await runCollectionPass(context.supabase, context.userId, data);
    if (pass.idle) await markCollectionFinished(context.supabase, "All queued work is finished");

    return clean({
      stopped: false,
      pass,
      progress: await collectionProgress(context.supabase),
    });
  });

/** Which competition level the run should work on next. */
export const getCollectionWaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { waveProgress } = await import("@/lib/waves.server");
    return clean(await waveProgress(context.supabase));
  });

/** Release one level's work and set the rest aside until its turn. */
export const chooseCollectionWave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wave: string }) => ({ wave: String(input?.wave ?? "all") }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { setCollectionWave, WAVES } = await import("@/lib/waves.server");
    const known = WAVES.some((wave) => wave.key === data.wave);
    if (!known) throw new Error("Unknown level");
    return clean(await setCollectionWave(context.supabase, data.wave as any));
  });

/** Work through the levels in order without being asked each time. */
export const setCollectionAutoAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { on: boolean }) => ({ on: Boolean(input?.on) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { setAutoAdvance } = await import("@/lib/waves.server");
    return clean({ autoAdvance: await setAutoAdvance(context.supabase, data.on) });
  });


/** Autopilot: the daily hands-off check that sends due rosters and school facts for refresh. */
export const getAutopilot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state } = await supabaseAdmin
      .from("collection_state")
      .select("autopilot_on, autopilot_last_run, autopilot_last_note, is_running, last_beat_at, last_message")
      .eq("id", "singleton")
      .maybeSingle();
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86400_000).toISOString();
    const count = async (table: string, col: string, lte: string) => {
      const { count } = await supabaseAdmin
        .from(table as any)
        .select("id", { count: "exact", head: true })
        .lte(col, lte);
      return count ?? 0;
    };
    const { count: federalWaiting } = await supabaseAdmin
      .from("ingest_queue")
      .select("id", { count: "exact", head: true })
      .eq("stage", "federal_data")
      .in("status", ["pending", "failed"]);
    const { count: rosterWaiting } = await supabaseAdmin
      .from("ingest_queue")
      .select("id", { count: "exact", head: true })
      .in("stage", ["url_discovery", "program_scrape"])
      .in("status", ["pending", "failed", "running"]);
    return clean({
      state: (state ?? null) as any,
      rostersDueNow: await count("programs", "roster_refresh_due_at", now.toISOString()),
      rostersDueSoon: await count("programs", "roster_refresh_due_at", soon),
      factsDueNow: await count("universities", "facts_refresh_due_at", now.toISOString()),
      factsDueSoon: await count("universities", "facts_refresh_due_at", soon),
      federalWaiting: federalWaiting ?? 0,
      rosterWaiting: rosterWaiting ?? 0,
    });
  });

export const runAutopilotNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase.rpc("autopilot_run_now" as any);
    if (error) throw new Error(error.message);
    return clean(data as { ok: boolean; note?: string; reason?: string });
  });

export const setAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { on: boolean }) => ({ on: Boolean(input?.on) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { error } = await context.supabase.rpc("autopilot_set" as any, { _on: data.on });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Queue one team for an immediate roster + coach re-read and make sure the runner is going. */
export const recrawlProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: String(input?.programId ?? "") }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!/^[0-9a-f-]{36}$/i.test(data.programId)) throw new Error("Pick a team first");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prog } = await supabaseAdmin.from("programs").select("university_id").eq("id", data.programId).maybeSingle();
    if (!prog) throw new Error("That team was not found");
    const reset = { status: "pending", attempts: 0, leased_at: null, updated_at: new Date().toISOString() };
    const { data: updated, error: upError } = await supabaseAdmin
      .from("ingest_queue")
      .update(reset as any)
      .eq("program_id", data.programId)
      .eq("stage", "program_scrape")
      .select("id");
    if (upError) throw new Error("Could not queue that team");
    if (!updated?.length) {
      const { error } = await supabaseAdmin.from("ingest_queue").insert({
        ...reset,
        program_id: data.programId,
        university_id: (prog as any).university_id,
        stage: "program_scrape",
      } as any);
      if (error) throw new Error("Could not queue that team");
    }
    const { markCollectionStarted } = await import("@/lib/collection.server");
    const { data: st } = await supabaseAdmin.from("collection_state").select("is_running").eq("id", "singleton").maybeSingle();
    if (!(st as any)?.is_running) {
      await markCollectionStarted(context.supabase);
      const { error: cronError } = await context.supabase.rpc("collection_cron_start");
      if (cronError) throw new Error(cronError.message);
    }
    return { ok: true };
  });

/** Name search for the single-team refresh box. */
export const findTeamsForRecrawl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: String(input?.q ?? "").trim().slice(0, 80) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (data.q.length < 2) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.q.replace(/[%_,()]/g, " ");
    const { data: schools } = await supabaseAdmin
      .from("universities")
      .select("id, name, state")
      .ilike("name", `%${safe}%`)
      .limit(8);
    const ids = (schools ?? []).map((s: any) => s.id);
    if (!ids.length) return [];
    const { data: programs } = await supabaseAdmin
      .from("programs")
      .select("id, sport, university_id, roster_refresh_due_at, offering_status")
      .in("university_id", ids)
      .neq("offering_status", "not_offered");
    const byId = new Map((schools ?? []).map((s: any) => [s.id, s]));
    return clean(
      (programs ?? []).map((p: any) => ({
        id: p.id as string,
        sport: p.sport as string,
        school: (byId.get(p.university_id) as any)?.name as string,
        state: (byId.get(p.university_id) as any)?.state as string | null,
        nextRefresh: p.roster_refresh_due_at as string | null,
      })),
    );
  });
