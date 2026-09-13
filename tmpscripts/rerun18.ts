import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { loadProtectedHosts } from "@/lib/host-protection.server";
const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth:{persistSession:false}});
const ACTOR="3a59de05-6a8b-49bb-8b10-9ab281b918df";
const st=JSON.parse(readFileSync("/tmp/rerun197.json","utf8")) as Record<string,any>;
const bad=Object.entries(st).filter(([,r])=>r.status==="rejected");
await loadProtectedHosts(sb);
const out:any[]=[];
for(const [id,r] of bad){
  await sb.from("programs").update({roster_url:r.url}).eq("id",id);
  await sb.from("rejected_values").delete().eq("record_id",id).eq("field_name","roster_url").eq("normalized_value",String(r.url).trim().toLowerCase());
  await sb.from("url_discovery_queue").delete().eq("program_id",id).eq("discovered_url",r.url).eq("confidence","failed");
  const o=await ingestProgram(sb,ACTOR,id,{pages:"athletics"});
  const rp=o.urlResults.find(x=>x.purpose==="Roster page");
  out.push({school:r.school,sport:r.sport,players:o.rosterPlayers,status:rp?.status,detail:String(rp?.detail??"").slice(0,140)});
}
const esc=(v:any)=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:String(v);
writeFileSync("/mnt/documents/crawl-11-rerun-18.csv",[["school","sport","players_written","page_status","detail"].join(","),...out.map(r=>[r.school,r.sport,r.players,r.status,r.detail].map(esc).join(","))].join("\n")+"\n");
console.log(JSON.stringify({n:out.length,written:out.filter(r=>r.players>0).length,players:out.reduce((a,r)=>a+r.players,0),refused:out.filter(r=>r.status==="rejected").length}));
