import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
const r = await safeFetch("https://goheels.com/sports/baseball/roster");
const t = r.markdown ?? r.html ?? "";
const i = t.indexOf("Sawyer Black");
console.log(t.slice(i-200, i+900));
const s = parseRoster(t, "baseball");
console.log(s.players.length, s.players.filter(p=>p.is_transfer).length);
for (const p of s.players.slice(0,6)) console.log(p.name, p.previous_school, p.is_transfer, p.is_juco_transfer);
