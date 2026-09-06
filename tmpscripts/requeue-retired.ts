/** Requeue teams whose empty searches were retired but not yet put back in line. */
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ids = new Set<string>();
const uni = new Map<string,string>();
for (let page = 0; page < 4000; page += 500) {
  const { data, error } = await supabase
    .from("url_discovery_queue")
    .select("program_id, university_id")
    .eq("status", "rejected")
    .is("discovered_url", null)
    .range(page, page + 499);
  if (error) throw error;
  for (const r of (data ?? []) as any[]) if (r.program_id) { ids.add(r.program_id); uni.set(r.program_id, r.university_id); }
  if ((data ?? []).length < 500) break;
}
const wanted = [...ids];
const existing = new Set<string>();
for (let i = 0; i < wanted.length; i += 200) {
  const { data, error } = await supabase.from("ingest_queue").select("program_id").eq("stage", "url_discovery").in("program_id", wanted.slice(i, i + 200));
  if (error) throw error;
  for (const r of (data ?? []) as any[]) existing.add(r.program_id);
}
const reset = wanted.filter((p) => existing.has(p));
const fresh = wanted.filter((p) => !existing.has(p));
for (let i = 0; i < reset.length; i += 200) {
  const { error } = await supabase.from("ingest_queue").update({ status: "pending", attempts: 0, leased_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("stage", "url_discovery").in("program_id", reset.slice(i, i + 200));
  if (error) throw error;
}
for (let i = 0; i < fresh.length; i += 300) {
  const { error } = await supabase.from("ingest_queue").insert(fresh.slice(i, i + 300).map((p) => ({ university_id: uni.get(p)!, program_id: p, stage: "url_discovery", status: "pending", attempts: 0 })));
  if (error) throw error;
}
console.log(JSON.stringify({ programs: wanted.length, reset: reset.length, inserted: fresh.length }));
