import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
const t = readFileSync("src/lib/__tests__/fixtures/eckerd-baseball-roster.txt","utf8");
const r = parseRoster(t,"baseball");
console.log(r.counts.players);
for (const p of r.players) if (!/^[A-Z][a-z]+ /.test(p.name) || /High School|School/.test(p.name)) console.log(JSON.stringify(p));
