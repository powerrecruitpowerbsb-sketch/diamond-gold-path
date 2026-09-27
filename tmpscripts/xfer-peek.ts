import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
for (const u of process.argv.slice(2)) {
const r = await safeFetch(u); const t = r.markdown ?? r.html ?? "";
const s = parseRoster(t, "baseball");
const p = s.players.filter(p=>p.is_transfer).slice(0,5);
console.log(u, s.players.length, s.players.filter(p=>p.is_transfer).length);
for (const x of p) console.log("  ", x.name, "|", x.previous_school, "|", x.class_year);
const i = t.indexOf(p[0]?.name ?? "zzz"); console.log(t.slice(i, i+500));
}
