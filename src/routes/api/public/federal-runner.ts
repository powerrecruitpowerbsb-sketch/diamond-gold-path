/**
 * Scheduled school-facts runner.
 *
 * pg_cron calls this every few minutes with the cron bearer secret. Each call
 * does a small, bounded amount of work and then stops: it leases a handful of
 * queued schools, matches each against the federal records, and hands anything
 * it cannot settle to the review screens. Leasing is the single-flight guard —
 * two overlapping runs cannot claim the same school, and a run that dies
 * mid-flight has its rows reclaimed automatically once the lease goes stale, so
 * an interrupted pass resumes on its own instead of needing a manual restart.
 */
import { createFileRoute } from "@tanstack/react-router";

/** api.data.gov allows ~1,000 requests an hour, so each run stays small. */
const BATCH = 8;

export const Route = createFileRoute("/api/public/federal-runner")({
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

        const { leaseQueueItems, completeQueueItem, failQueueItem } = await import(
          "@/lib/ingest-queue.server"
        );
        const { syncUniversityFromFederal } = await import("@/lib/federal-data.server");

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

        const items = await leaseQueueItems(supabase, "federal_data", BATCH);
        let confirmed = 0;
        let needsHelp = 0;
        let errors = 0;
        let rateLimited = false;

        for (const item of items) {
          if (!item.university_id) {
            await failQueueItem(supabase, item.id, "Queue item has no school", true);
            continue;
          }
          try {
            const outcome = await syncUniversityFromFederal(supabase, actorId, item.university_id);
            if (outcome.status === "confirmed") {
              await completeQueueItem(supabase, item.id);
              confirmed += 1;
            } else {
              needsHelp += 1;
              await failQueueItem(
                supabase,
                item.id,
                outcome.status === "unmatched"
                  ? "No federal record found for this school name"
                  : "More than one federal record could be this school",
                true,
              );
            }
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : "Federal sync failed";
            if (/rate limit/i.test(message)) {
              // Not this school's fault: give the job back untouched and stop.
              // The next scheduled run picks it up once the window rolls over.
              await supabase
                .from("ingest_queue")
                .update({
                  status: "pending",
                  attempts: Math.max((item.attempts ?? 1) - 1, 0),
                  leased_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", item.id);
              rateLimited = true;
              break;
            }
            errors += 1;
            await failQueueItem(supabase, item.id, message);
          }
        }

        return Response.json({
          ok: true,
          processed: items.length,
          confirmed,
          needsHelp,
          errors,
          rateLimited,
        });
      },
    },
  },
});
