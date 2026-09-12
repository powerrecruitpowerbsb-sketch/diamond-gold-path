import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeFileSync } from "node:fs";
const RUN = "a6baa828-f264-4e33-a070-fe45ebe3203a";
const dom = (u: string | null) => (u ? registrableDomain(hostOf(u)) || "" : "");
async function all(t: string, c: string, o: string) { const out: any[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await supabaseAdmin.from(t as any).select(c).order(o).range(f, f + 999); if (error) throw new Error(error.message); const rows = (data ?? []) as any[]; out.push(...rows); if (rows.length < 1000) break; } return out; }
const schools = new Map((await all("universities", "id,name,state,website_url,ipeds_unitid", "name")).map((s) => [s.id, s]));
const arch = (await all("university_website_archive", "id,university_id,prior_value,new_value", "university_id")).filter((r: any) => true);
const applied: any[] = []; const withheld: any[] = [];
for (const a of arch) { const s = schools.get(a.university_id); if (!s) continue; (dom(s.website_url) === dom(a.new_value) ? applied : withheld).push({ ...a, name: s.name, state: s.state, unitid: s.ipeds_unitid, current: s.website_url }); }
console.log("archive rows:", arch.length, "applied:", applied.length, "withheld by the guard:", withheld.length);
const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
writeFileSync("/mnt/documents/step10-website-restore-applied.csv", [["school","state","institution_id","previous_website","restored_website","archive_run_id"].join(","), ...applied.map((r) => [r.name, r.state, r.unitid, r.prior_value, r.new_value, RUN].map(csv).join(","))].join("\n") + "\n");
writeFileSync("/mnt/documents/step10-website-restore-withheld.csv", [["school","state","institution_id","current_website","federal_website","reason"].join(","), ...withheld.map((r) => [r.name, r.state, r.unitid, r.current, r.new_value, "the federal domain is attached to another school record — needs an identity decision"].map(csv).join(","))].join("\n") + "\n");
console.log("withheld ids:", withheld.map((w) => w.id).join(","));
