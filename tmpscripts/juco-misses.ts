import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const bodies = ["NJCAA","CCCAA","NWAC","NAIA"];
let all: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("programs").select("id,sport,governing_body,roster_url,athletic_website,offering_status").in("governing_body", bodies).neq("offering_status","not_offered").range(from, from+999);
  if (error) throw error; all = all.concat(data); if (data.length < 1000) break;
}
const have = new Set<string>();
for (let i = 0; i < all.length; i += 200) {
  const ids = all.slice(i,i+200).map(p=>p.id);
  for (let f=0;;f+=1000){ const { data } = await sb.from("roster_players").select("program_id").in("program_id", ids).range(f,f+999); (data??[]).forEach((r:any)=>have.add(r.program_id)); if(!data||data.length<1000)break;}
}
const miss = all.filter(p=>!have.has(p.id));
const byBody: any = {};
for (const p of all) { const b = byBody[p.governing_body] ??= {total:0,have:0,missNoUrl:0,missUrl:0}; b.total++; if(have.has(p.id)) b.have++; else if(p.roster_url) b.missUrl++; else b.missNoUrl++; }
console.log(byBody);
const hosts: any = {};
for (const p of miss.filter(p=>p.roster_url)) { const h = new URL(p.roster_url).hostname.replace(/^www\./,""); const k = h.includes("prestosports")||/\/sports\/[a-z]+\/\d{4}-\d{2}\/roster/.test(p.roster_url)?"presto-path":/\/sports\/[a-z-]+\/roster/.test(p.roster_url)?"sidearm-path":p.roster_url.endsWith(".pdf")?"pdf":"other"; hosts[k]=(hosts[k]??0)+1; }
console.log(hosts);
writeFileSync("/tmp/j/miss.json", JSON.stringify(miss.filter(p=>p.roster_url)));
