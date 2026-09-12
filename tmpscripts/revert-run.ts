/**
 * Undoes one archived run: every row in public.program_level_archive for that
 * run id is put back to its prior value and stamped restored_at.
 * Run: bun tmpscripts/revert-run.ts <run_id>
 */
import { createClient } from "@supabase/supabase-js";

const runId = process.argv[2];
if (!runId) throw new Error("pass the run id");

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const now = new Date().toISOString();

const { data: rows, error } = await sb.from("program_level_archive")
  .select("id, program_id, field, prior_value").eq("run_id", runId).is("restored_at", null);
if (error) throw new Error(error.message);

let restored = 0;
for (const r of rows!) {
  const update: Record<string, unknown> = { [r.field]: r.prior_value, updated_at: now };
  if (r.field === "division") {
    update["division_verification"] = "unverified";
    update["division_verified_at"] = null;
    update["division_source"] = null;
  }
  if (r.field === "offering_status") {
    update["offering_source"] = null;
    update["offering_verified_at"] = null;
  }
  const { error: uErr } = await sb.from("programs").update(update).eq("id", r.program_id);
  if (uErr) throw new Error(`${r.program_id}: ${uErr.message}`);
  await sb.from("program_level_archive").update({ restored_at: now }).eq("id", r.id);
  restored++;
}
console.log(JSON.stringify({ runId, rowsRestored: restored }));
