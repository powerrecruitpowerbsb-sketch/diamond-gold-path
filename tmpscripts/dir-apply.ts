import { createClient } from "@supabase/supabase-js";
import { sweepUnresolvedSchools } from "../src/lib/federal-directory.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).maybeSingle();
const out = await sweepUnresolvedSchools(supabase, admin!.id as string, { apply: true, limit: 400 });
console.log("examined", out.examined, "matched", out.matched, "applied", out.applied);
for (const r of out.results.filter((x) => x.errorMessage)) console.log("ERR", r.schoolName, r.errorMessage);
