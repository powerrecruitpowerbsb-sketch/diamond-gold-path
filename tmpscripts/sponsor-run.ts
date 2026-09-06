/** Decide the remaining unconfirmed sport slots. */
import { createClient } from "@supabase/supabase-js";
import { syncSponsorshipBatch } from "../src/lib/sport-sponsorship.server";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let totals = { schoolsChecked: 0, offered: 0, notOffered: 0, conflicts: 0 };
for (let round = 0; round < 12; round += 1) {
  const r: any = await syncSponsorshipBatch(supabase, { limit: 60 });
  totals.schoolsChecked += r.schoolsChecked ?? 0;
  totals.offered += r.offered ?? 0;
  totals.notOffered += r.notOffered ?? 0;
  totals.conflicts += r.conflicts ?? 0;
  console.log(round, JSON.stringify(r));
  if (!r.schoolsChecked) break;
}
console.log("totals", JSON.stringify(totals));
