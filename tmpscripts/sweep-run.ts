import { createClient } from "@supabase/supabase-js";
import { sweepPendingNoise } from "../src/lib/review.server";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).maybeSingle();
for (let pass = 1; pass <= 12; pass += 1) {
  const r = await sweepPendingNoise(supabase, (admin as any).id, true, 1000);
  console.log(`pass ${pass}: examined ${r.examined} cleared ${r.noChange} applied ${r.gapFills} left ${r.remaining} failures ${r.failures} more ${r.moreWaiting}`);
  if (r.noChange + r.gapFills === 0) break;
}
const { count } = await supabase.from("pending_data_changes").select("id", { count: "exact", head: true }).eq("status", "pending");
console.log("still pending:", count);
