/**
 * Scheduled nationwide collection runner.
 *
 * The database's minute-by-minute schedule calls this while collection is
 * switched on. Each call does one bounded pass — a handful of schools for link
 * discovery and a handful of teams for collection — then returns. Queue leasing
 * means overlapping calls never duplicate work and an interrupted pass is
 * picked up again once its lease goes stale, so the run resumes on its own. A
 * stop request ends the run at the next call.
 *
 * Two callers are accepted: the platform cron secret, or the private runner key
 * held in `collection_state` (never exposed to browsers) that the database
 * schedule sends. Anything else is rejected.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/collection-runner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const bearer = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];

        let authorized = false;
        if (bearer) {
          const { data: tokenRow } = await supabase
            .from("collection_state")
            .select("runner_token")
            .eq("id", "singleton")
            .maybeSingle();
          const expected = (tokenRow as { runner_token?: string } | null)?.runner_token;
          if (expected) {
            const { timingSafeEqual, createHash } = await import("node:crypto");
            const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
            authorized = timingSafeEqual(digest(bearer), digest(expected));
          }
        }

        if (!authorized) {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const denied = await authenticateCronRequest(request);
          if (denied) {
            return Response.json(
              { ok: false, reason: "unauthorized", accepts: "runner key or cron secret" },
              { status: 401 },
            );
          }
        }

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
