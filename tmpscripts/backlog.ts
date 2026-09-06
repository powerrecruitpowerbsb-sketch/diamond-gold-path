/** Clear the waiting backlog. Run: bun tmpscripts/backlog.ts [--apply] */
import { createClient } from "@supabase/supabase-js";
import { sweepPendingUntilDone } from "../src/lib/review.server";
import { sweepLinksUntilDone } from "../src/lib/link-sweep.server";

const apply = process.argv.includes("--apply");
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).maybeSingle();
const actor = admin?.id ?? null;
if (!actor) throw new Error("no superadmin found");

const facts = await sweepPendingUntilDone(supabase, actor, apply, { maxPasses: 20, budgetMs: 240_000 });
console.log("facts:", { examined: facts.examined, noChange: facts.noChange, gapFills: facts.gapFills, remaining: facts.remaining, failures: facts.failures, more: facts.moreWaiting, passes: facts.passes });
console.log("  reasons:", facts.reasons.slice(0, 10));

const links = await sweepLinksUntilDone(supabase, actor, { apply, maxPasses: 20, budgetMs: 240_000 });
console.log("links:", { scanned: links.scanned, approve: links.approve, reject: links.reject, ask: links.ask, requeued: links.requeuedSchools, failures: links.failures, more: links.moreWaiting, passes: links.passes });
console.log("  byReason:", links.byReason);
