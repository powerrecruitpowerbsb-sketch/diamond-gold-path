import { createClient } from "@supabase/supabase-js";
import { syncSponsorshipBatch } from "../src/lib/sport-sponsorship.server";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
for (let round = 1; round <= 40; round += 1) {
  const out = await syncSponsorshipBatch(supabase, { limit: 25, onlyUnverified: true });
  console.log(round, JSON.stringify({ ...out, samples: out.samples.slice(0, 2) }));
  if (!out.schoolsChecked) break;
}
console.log("done");
