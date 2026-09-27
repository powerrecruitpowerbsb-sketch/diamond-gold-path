import { readFileSync, writeFileSync } from "node:fs";
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
const miss = JSON.parse(readFileSync("/tmp/j/miss.json","utf8"));
const sample = miss.sort(()=>Math.random()-0.5).slice(0,30);
const rows:any[] = [];
let i=0;
async function worker(){ while(i<sample.length){ const p=sample[i++]; const r = await safeFetch(p.roster_url,{ignoreProtection:true} as any); const s = parseRoster(r.ok?(r.markdown??r.html??""):"", p.sport);
  rows.push({gb:p.governing_body,url:p.roster_url,ok:r.ok,how:r.fetch_method,why:r.failure_category,n:s.players.length,withPos:s.counts.withPosition,withCl:s.counts.withClass,first:s.players[0]?.name,flags:s.flags.filter(f=>/defect|no player/.test(f))}); } }
await Promise.all([1,2,3,4,5,6].map(worker));
writeFileSync("/tmp/j/s30.json", JSON.stringify(rows,null,1));
const read = rows.filter(r=>r.n>=8);
console.log("read", read.length, "of", rows.length);
const why:any={}; rows.filter(r=>r.n<8).forEach(r=>{const k=r.ok?"loaded, no rows":r.why; why[k]=(why[k]??0)+1}); console.log(why);
for (const r of rows) console.log(r.gb, r.n, r.withPos, r.withCl, r.ok?r.how:r.why, r.url, r.first??"");
