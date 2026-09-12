import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const dom = (u: string | null) => (u ? registrableDomain(hostOf(u)) || "" : "");
const all: any[] = [];
for (let f = 0; ; f += 1000) {
  const { data } = await supabaseAdmin.from("universities").select("id,name,state,website_url,ipeds_unitid").order("name").range(f, f + 999);
  const rows = data ?? []; all.push(...rows); if (rows.length < 1000) break;
}
const fed = new Map<number, string | null>();
for (let f = 0; ; f += 1000) {
  const { data } = await supabaseAdmin.from("federal_directory").select("unitid,website").order("unitid").range(f, f + 999);
  const rows = data ?? []; for (const r of rows as any[]) fed.set(Number(r.unitid), r.website); if (rows.length < 1000) break;
}
for (const s of all) {
  if (!s.ipeds_unitid || !s.website_url) continue;
  const w = fed.get(Number(s.ipeds_unitid)); if (!w || !dom(w)) continue;
  if (dom(s.website_url) !== dom(w)) console.log(`${s.name} (${s.state}, ${s.ipeds_unitid}): ${s.website_url}  vs federal ${w}`);
}
