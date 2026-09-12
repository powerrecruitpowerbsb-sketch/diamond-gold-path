import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
const fx: [string,string,string][] = [
 ["eckerd-baseball-roster.txt","Eckerd College","baseball"],
 ["ucf-baseball-roster.txt","UCF","baseball"],
 ["stetson-softball-roster.txt","Stetson","softball"],
];
for (const [f,school,sport] of fx) {
  const s = parseRoster(readFileSync(`src/lib/__tests__/fixtures/${f}`,"utf8"), sport);
  const bats = s.players.filter(p=>p.bats).length, thr = s.players.filter(p=>p.throws).length;
  const dist: Record<string,number> = {};
  for (const p of s.players) { const k = `${p.bats??"-"}/${p.throws??"-"}`; dist[k]=(dist[k]??0)+1; }
  console.log(school, sport, "players", s.players.length, "bats", bats, "throws", thr, "columns", s.columns.bats, s.columns.throws, JSON.stringify(dist), "defects", JSON.stringify(s.parserDefects));
}
