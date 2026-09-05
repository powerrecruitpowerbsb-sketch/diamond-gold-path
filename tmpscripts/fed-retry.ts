/** Hand unresolved school-fact jobs back to the queue so the better matcher retries them. */
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase
  .from("universities")
  .select("id")
  .in("federal_match_status", ["ambiguous", "unmatched"])
  .not("federal_synced_at", "is", null)
  .limit(5000);
if (error) throw error;
const ids = (data ?? []).map((r: any) => r.id);
let reset = 0;
for (let i = 0; i < ids.length; i += 100) {
  const { data: up, error: e } = await supabase
    .from("ingest_queue")
    .update({ status: "pending", attempts: 0, last_error: null, leased_at: null, updated_at: new Date().toISOString() })
    .eq("stage", "federal_data")
    .in("university_id", ids.slice(i, i + 100))
    .select("id");
  if (e) throw e;
  reset += (up ?? []).length;
}
console.log(JSON.stringify({ schools: ids.length, reset }));
