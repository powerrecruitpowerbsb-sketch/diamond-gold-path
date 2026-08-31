/**
 * Step 3 pilot: link discovery + coaches/roster scrape for a small slice of
 * programs, spread across all five governing bodies, so accuracy and real cost
 * per program can be measured before running wide.
 */
import { createClient } from "@supabase/supabase-js";
import { leaseQueueItems, completeQueueItem, failQueueItem } from "../src/lib/ingest-queue.server";
import { discoverUniversityUrls, applyDiscoveredUrl } from "../src/lib/discovery.server";
import { ingestProgram } from "../src/lib/ingest.server";

const PER_BODY = Number(process.env["PER_BODY"] ?? 10);

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: admin } = await supabase
  .from("users")
  .select("id")
  .eq("user_type", "superadmin")
  .limit(1)
  .maybeSingle();
const userId = admin!.id as string;

// Lease a generous pool, then keep a balanced slice across governing bodies.
const pool = await leaseQueueItems(supabase, "url_discovery", PER_BODY * 40);
const { data: programRows } = await supabase
  .from("programs")
  .select("id, sport, governing_body, university_id")
  .in("id", pool.map((i) => i.program_id!));
const byProgram = new Map((programRows ?? []).map((p: any) => [p.id, p]));

const perBody = new Map<string, number>();
const picked: typeof pool = [];
const released: typeof pool = [];
for (const item of pool) {
  const body = String(byProgram.get(item.program_id!)?.governing_body ?? "unknown");
  const count = perBody.get(body) ?? 0;
  if (count >= PER_BODY) {
    released.push(item);
    continue;
  }
  perBody.set(body, count + 1);
  picked.push(item);
}
// Hand back everything we leased but aren't working, so it stays queued.
for (const item of released) {
  await supabase
    .from("ingest_queue")
    .update({ status: "pending", leased_at: null, attempts: Math.max(0, item.attempts - 1) })
    .eq("id", item.id);
}

console.log(`pilot: ${picked.length} programs`, Object.fromEntries(perBody));

// Discovery is school-level, so group the picked programs by school.
const bySchool = new Map<string, typeof picked>();
for (const item of picked) {
  const list = bySchool.get(item.university_id!) ?? [];
  list.push(item);
  bySchool.set(item.university_id!, list);
}

const stats = { discovered: 0, urlsApplied: 0, discoveryFailed: 0, scraped: 0, scrapeFailed: 0, proposals: 0, autoApplied: 0, rosterPlayers: 0 };

async function runSchool(universityId: string, items: typeof picked) {
  try {
    const outcome = await discoverUniversityUrls(supabase, universityId);
    if (outcome.errorMessage) throw new Error(outcome.errorMessage);
    stats.discovered += 1;

    // Auto-confirm high-confidence links; low/failed stay in the review queue.
    const { data: staged } = await supabase
      .from("url_discovery_queue")
      .select("id, university_id, program_id, discovery_type, discovered_url, confidence")
      .eq("university_id", universityId)
      .eq("status", "pending_review");
    for (const row of (staged ?? []) as any[]) {
      if (row.confidence !== "high" || !row.discovered_url) continue;
      await applyDiscoveredUrl(supabase, row);
      await supabase
        .from("url_discovery_queue")
        .update({ status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("id", row.id);
      stats.urlsApplied += 1;
    }
  } catch (error) {
    stats.discoveryFailed += 1;
    for (const item of items) await failQueueItem(supabase, item.id, (error as Error).message);
    return;
  }

  for (const item of items) await completeQueueItem(supabase, item.id);

  // Straight into the scrape for these programs while their links are fresh.
  for (const item of items) {
    const { data: scrapeRow } = await supabase
      .from("ingest_queue")
      .select("id")
      .eq("program_id", item.program_id)
      .eq("stage", "program_scrape")
      .maybeSingle();
    try {
      const result = await ingestProgram(supabase, userId, item.program_id!);
      if (result.status === "failed") throw new Error(result.errorMessage ?? "Scrape failed");
      stats.scraped += 1;
      stats.proposals += result.proposalsCreated ?? 0;
      stats.autoApplied += result.autoApplied ?? 0;
      stats.rosterPlayers += result.rosterPlayers ?? 0;
      if (scrapeRow) await completeQueueItem(supabase, scrapeRow.id);
    } catch (error) {
      stats.scrapeFailed += 1;
      console.log("scrape failed", item.program_id, (error as Error).message);
      if (scrapeRow) await failQueueItem(supabase, scrapeRow.id, (error as Error).message);
    }
  }
}

const schools = [...bySchool.entries()];
const CONCURRENCY = 4;
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= schools.length) return;
      const [universityId, items] = schools[index]!;
      await runSchool(universityId, items);
      console.log(`[${index + 1}/${schools.length}]`, stats);
    }
  }),
);

console.log("done", stats);
