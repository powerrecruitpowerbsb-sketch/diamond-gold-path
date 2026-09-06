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

