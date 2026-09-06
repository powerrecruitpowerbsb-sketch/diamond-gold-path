import { createClient } from "@supabase/supabase-js";
import { decoratePending, pendingVerdict, approvePending } from "../src/lib/review.server";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).maybeSingle();
const { data: rows } = await supabase.from("pending_data_changes").select("id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at").eq("status","pending").order("created_at").limit(1000);
const dec = await decoratePending(supabase, rows as any);
for (const row of dec as any[]) {
  if (pendingVerdict(row).kind === "no_change" || pendingVerdict(row).kind === "auto_apply") {
    try { await approvePending(supabase, (admin as any).id, row); console.log("ok", row.id, row.field_name); }
    catch (e) { console.log("FAIL", row.id, row.table_name, row.field_name, row.recordLabel, (e as Error).message); }
  }
}
