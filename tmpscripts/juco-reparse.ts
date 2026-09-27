import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
for (const f of ["p0","p1","p3","p9","p10","e0","e1","e2"]) { const s = parseRoster(readFileSync(`/tmp/j/${f}.md`,"utf8"), "baseball");
 console.log(f, s.players.length, JSON.stringify(s.players.slice(0,2).map(p=>[p.number,p.name,p.position,p.class_year,p.bats,p.height,p.hometown,(p as any).previous_school]))); }
