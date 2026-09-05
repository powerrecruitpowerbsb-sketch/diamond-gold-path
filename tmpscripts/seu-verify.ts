import { createClient } from "@supabase/supabase-js";
import { applyDiscoveredUrl } from "@/lib/discovery.server";
import { ingestProgram } from "@/lib/ingest.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).single();
const { data: rows } = await supabase
  .from("url_discovery_queue")
  .select("id, university_id, program_id, discovery_type, discovered_url, confidence")
  .eq("university_id", "dc1fdf16-bb76-4756-864b-2287ffe67e2e");
for (const row of rows ?? []) {
  if ((row as any).confidence !== "high") continue;
  await applyDiscoveredUrl(supabase, row as any);
  await supabase.from("url_discovery_queue").update({ status: "confirmed" }).eq("id", (row as any).id);
}
// The athletics site itself was flagged low, so set it by hand for this test.
await supabase.from("programs").update({ athletic_website: "https://fire.seu.edu" }).eq("university_id", "dc1fdf16-bb76-4756-864b-2287ffe67e2e");
const out = await ingestProgram(supabase, (admin as any).id, "6069e904-c2a3-49a1-9571-3cfacebcef2c");
console.log(JSON.stringify(out, null, 2));
const { data: proposal } = await supabase
  .from("pending_data_changes")
  .select("proposed_value")
  .eq("table_name", "roster_players")
  .eq("record_id", "6069e904-c2a3-49a1-9571-3cfacebcef2c")
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const players = (proposal as any)?.proposed_value?.players ?? [];
console.log("season:", (proposal as any)?.proposed_value?.season_year, "players:", players.length);
const counts: Record<string, number> = {};
for (const p of players) counts[String(p.position ?? "none")] = (counts[String(p.position ?? "none")] ?? 0) + 1;
console.log(counts);
