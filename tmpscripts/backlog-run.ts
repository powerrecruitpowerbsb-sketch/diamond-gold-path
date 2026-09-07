import { createClient } from "@supabase/supabase-js";
import { sweepPendingUntilDone } from "../src/lib/review.server";
import { sweepLinksUntilDone, retireEmptyDiscoveryRows } from "../src/lib/link-sweep.server";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const actor = null as any;
for (let round = 1; round <= 12; round += 1) {
  const facts = await sweepPendingUntilDone(supabase, actor, true, { budgetMs: 25_000 });
  const empty = await retireEmptyDiscoveryRows(supabase, actor, { apply: true });
  const links = await sweepLinksUntilDone(supabase, actor, { apply: true, budgetMs: 25_000 });
  console.log(round, JSON.stringify({ facts, empty, links }));
  if (!facts.applied && !links.approve && !links.reject && !(empty.retired ?? 0)) break;
}
console.log("done");
