/** One-off: retire waiting link rows that have no address and requeue those teams. */
import { createClient } from "@supabase/supabase-js";
import { retireEmptyDiscoveryRows } from "../src/lib/link-sweep.server";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: superadmin } = await supabase.from("user_roles").select("user_id").eq("role", "superadmin").limit(1);
const actor = (superadmin ?? [])[0]?.user_id ?? null;
const preview = await retireEmptyDiscoveryRows(supabase, actor, { apply: false, limit: 5000 });
console.log("preview", JSON.stringify(preview));
const applied = await retireEmptyDiscoveryRows(supabase, actor, { apply: true, limit: 5000 });
console.log("applied", JSON.stringify(applied));
