import { readFileSync } from "node:fs";
import { readRoster } from "@/lib/roster-read.server";
const r = await readRoster(readFileSync("/tmp/aud/NelsonUnive-baseball.md","utf8"),"baseball");
console.log(r.players.length);
console.log(r.players.map(p=>p.name).join(" | "));
