import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
import { extractCoaches } from "@/lib/coach-extract";
for (const [f,s] of [["ucf-baseball-roster.txt","baseball"],["eckerd-baseball-roster.txt","baseball"],["stetson-softball-roster.txt","softball"]] as const) {
  const t = readFileSync(`/tmp/cap-${f}`,"utf8");
  const r = parseRoster(t, s);
  console.log(f, r.counts.players, r.players.slice(0,2).map(p=>p.name).join(" / "));
}
const lsu = readFileSync("/tmp/cap-lsu-softball-staff-directory.txt","utf8");
const c = extractCoaches(lsu,"softball",{url:"https://lsusports.net/staff-directory/"});
console.log("lsu", c.coaches.length, c.headCoach?.name, c.pageKind);
