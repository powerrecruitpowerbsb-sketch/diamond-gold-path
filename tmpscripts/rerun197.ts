import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { loadProtectedHosts, watchForProtection } from "@/lib/host-protection.server";
const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth:{persistSession:false}});
const ACTOR="3a59de05-6a8b-49bb-8b10-9ab281b918df";
const done = Object.values(JSON.parse(readFileSync("/tmp/full-crawl-state.json","utf8")).done) as any[];
const targets = done.filter(o=>o.pages.some((p:any)=>p.status==="rejected"&&p.purpose==="Roster page"));
const S="/tmp/rerun197.json";
const st: Record<string,any> = existsSync(S)?JSON.parse(readFileSync(S,"utf8")):{};
await loadProtectedHosts(sb); watchForProtection(sb);
let cursor=0;
await Promise.all(Array.from({length:6},async()=>{
  while(cursor<targets.length){
    const t=targets[cursor++]!;
    if(st[t.id])continue;
    try{
      const o=await ingestProgram(sb,ACTOR,t.id,{pages:"athletics"});
      const rp=o.urlResults.find(r=>r.purpose==="Roster page");
      st[t.id]={school:t.school,sport:t.sport,players:o.rosterPlayers,status:rp?.status??"none",detail:String(rp?.detail??"").slice(0,200),url:rp?.url??""};
    }catch(e){st[t.id]={school:t.school,sport:t.sport,players:0,status:"error",detail:(e as Error).message.slice(0,200),url:""};}
    writeFileSync(S,JSON.stringify(st));
  }
}));
const rows=Object.values(st) as any[];
const g=new Map<string,number>();
for(const r of rows){const k=r.players>0?"roster written":r.status==="rejected"?"still refused":r.status==="error"?"error":"read, nothing extracted";g.set(k,(g.get(k)??0)+1);}
const esc=(v:any)=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:String(v);
writeFileSync("/mnt/documents/crawl-10-rerun-197.csv",[["school","sport","players_written","page_status","detail","roster_url"].join(","),...rows.map(r=>[r.school,r.sport,r.players,r.status,r.detail,r.url].map(esc).join(","))].join("\n")+"\n");
console.log(JSON.stringify({programs:rows.length,players:rows.reduce((a,r)=>a+r.players,0),groups:Object.fromEntries(g)}));
