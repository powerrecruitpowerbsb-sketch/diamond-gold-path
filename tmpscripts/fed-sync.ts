/**
 * One-off driver: drain the federal_data queue across the whole universe.
 * Run with: bun tmpscripts/fed-sync.ts
 */
import { createClient } from "@supabase/supabase-js";
import { leaseQueueItems, completeQueueItem, failQueueItem, enqueueMissingWork } from "../src/lib/ingest-queue.server";
import { syncUniversityFromFederal } from "../src/lib/federal-data.server";

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
const userId = admin?.id as string;
if (!userId) throw new Error("no superadmin user found");

const created = await enqueueMissingWork(supabase);
console.log("enqueued missing work:", created);

let done = 0;
let failed = 0;
let needsHelp = 0;

async function work(item: any) {
  try {
    const result = await syncUniversityFromFederal(supabase, userId, item.university_id!);
    if (result.status === "confirmed") {
      await completeQueueItem(supabase, item.id);
      done += 1;
    } else {
      needsHelp += 1;
      await failQueueItem(
        supabase,
        item.id,
        result.status === "unmatched"
          ? "No federal record found for this school name"
          : "More than one federal record could be this school",
        true,
      );
    }
  } catch (error) {
    failed += 1;
    await failQueueItem(supabase, item.id, (error as Error).message);
    console.error("fail", item.university_id, (error as Error).message.slice(0, 120));
  }
}

for (;;) {
  const items = await leaseQueueItems(supabase, "federal_data", 24);
  if (!items.length) break;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await work(next);
      }
    }),
  );
  console.log(`progress: confirmed=${done} needsHelp=${needsHelp} errors=${failed}`);
}
console.log(`FINISHED confirmed=${done} needsHelp=${needsHelp} errors=${failed}`);

