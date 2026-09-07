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

/** The four stages, with what each one still has left and whether it can start. */
export const getBuildStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { stageBoard } = await import("@/lib/build-stages.server");
    return clean(await stageBoard(context.supabase));
  });

/**
 * Start (or carry on) one stage. Pressing this while a stage is already going is
 * harmless: page checking picks up from its saved position, and collecting only
 * ever queues gaps that are still gaps.
 */
export const runBuildStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stage: string }) => ({ stage: String(input?.stage ?? "") }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const {
      runLeftoversPass,
      startCollectingFor,
      startCoaches,
      startPagesCheck,
      stopPagesCheck,
      pagesCheckIsOn,
    } = await import("@/lib/build-stages.server");

    if (data.stage === "pages") {
      // The same button pauses it while it is going.
      if (await pagesCheckIsOn(context.supabase)) {
        await stopPagesCheck(context.supabase);
        return clean({ stage: "pages", result: { running: false } });
      }
      await startPagesCheck(context.supabase);
      return clean({ stage: "pages", result: { running: true } });
    }
    if (data.stage === "rosters") {
      return clean({
        stage: "rosters",
        result: await startCollectingFor(context.supabase, "rosters"),
      });
    }
    if (data.stage === "coaches") {
      return clean({ stage: "coaches", result: await startCoaches(context.supabase) });
    }
    if (data.stage === "leftovers") {
      return clean({
        stage: "leftovers",
        result: await runLeftoversPass(context.supabase, context.userId),
      });
    }
    throw new Error("Unknown stage");
  });

/** Stop the collecting stages. Everything gathered so far is kept. */
export const stopBuildStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { stopCollecting } = await import("@/lib/build-stages.server");
    await stopCollecting(context.supabase);
    return clean({ stopped: true });
  });

/** The coach safety cases and how they came out, for the held-back message. */
export const getCoachSafetyCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { coachGuardSelfCheck } = await import("@/lib/coach-selfcheck");
    return clean(coachGuardSelfCheck());
  });
