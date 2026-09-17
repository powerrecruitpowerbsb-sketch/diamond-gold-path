import { readFileSync } from "node:fs";
import { readRoster } from "@/lib/roster-read.server";
for (const [f, sport] of [["NelsonUnive-baseball","baseball"],["SantiagoCan-softball","softball"],["DelawareTec-baseball","baseball"]] as const) {
  const r = await readRoster(readFileSync(`/tmp/aud/${f}.md`,"utf8"), sport);
  console.log(`=== ${f} reader=${r.reader} players=${r.players.length}`);
  for (const p of r.players.slice(0,12)) console.log(JSON.stringify({n:p.name,pos:p.position,cls:p.class_year,ht:p.hometown,st:p.home_state}));
}
