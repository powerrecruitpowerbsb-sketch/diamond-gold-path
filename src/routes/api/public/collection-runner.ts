/**
 * Scheduled nationwide collection runner.
 *
 * Called with the cron bearer secret. Each call does one bounded pass — a
 * handful of schools for link discovery and a handful of teams for collection —
 * then returns. Queue leasing means overlapping calls never duplicate work and
 * an interrupted pass is picked up again once its lease goes stale, so the run
 * resumes on its own. A stop request ends the run at the next call.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/collection-runner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const {
          readCollectionState,
          runCollectionPass,
          markCollectionFinished,
        } = await import("@/lib/collection.server");

        const { data: admin } = await supabase
          .from("users")
          .select("id")
          .eq("user_type", "superadmin")
          .limit(1)
          .maybeSingle();
        const actorId = (admin as { id?: string } | null)?.id;
        if (!actorId) {
          return Response.json({ ok: false, reason: "no superadmin account" }, { status: 503 });
        }

        const state = await readCollectionState(supabase);
        if (!state.isRunning || state.stopRequested) {
          if (state.isRunning) await markCollectionFinished(supabase, "Stopped by request");
          return Response.json({ ok: true, running: false, idle: true });
        }

        const url = new URL(request.url);
        const num = (name: string, fallback: number) => {
          const raw = Number(url.searchParams.get(name));
          return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
        };

        const pass = await runCollectionPass(supabase, actorId, {
          discoverySchools: num("discovery", 6),
          scrapePrograms: num("scrape", 6),
          workers: num("workers", 4),
        });

        if (pass.idle) await markCollectionFinished(supabase, "All queued work is finished");

        return Response.json({ ok: true, running: !pass.idle, ...pass });
      },
    },
  },
});
