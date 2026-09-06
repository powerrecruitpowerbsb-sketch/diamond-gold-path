import { createClient } from "@supabase/supabase-js";
import { sweepPendingNoise } from "../src/lib/review.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).maybeSingle();
const apply = process.argv.includes("--apply");
const r = await sweepPendingNoise(supabase, (admin as any).id, apply, 2000);
console.log(JSON.stringify({ ...r, samples: r.samples.slice(0, 5) }, null, 2));
