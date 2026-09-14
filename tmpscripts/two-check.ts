import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
for (const k of ["SDSU","Raritan"]) {
  const md = readFileSync(`/tmp/d/${k}.md`,"utf8");
  const s = parseRoster(md,"baseball");
  console.log(`${k}: players ${s.counts.players} flags ${JSON.stringify(s.flags)}`);
  for (const p of s.players.slice(0,5)) console.log("   ", JSON.stringify({n:p.name,num:p.number,pos:p.position,cl:p.class_year,ht:p.height,wt:p.weight,town:p.hometown,st:p.home_state}));
}
