import { createClient } from "@supabase/supabase-js";
import { sweepPendingNoise } from "@/lib/review.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).single();
const result = await sweepPendingNoise(supabase, (admin as any).id, true);
console.log(JSON.stringify({ ...result, samples: result.samples.slice(0, 5) }, null, 2));
