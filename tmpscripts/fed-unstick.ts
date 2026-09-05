import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
const { data, error } = await supabase
  .from("ingest_queue")
  .update({ status: "pending", leased_at: null, updated_at: new Date().toISOString() })
  .eq("stage", "federal_data")
  .eq("status", "running")
  .or(`leased_at.is.null,leased_at.lt.${cutoff}`)
  .select("id");
if (error) throw error;
console.log("freed", data?.length ?? 0);
