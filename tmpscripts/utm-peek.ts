import { scrapePage } from "@/lib/ingest.server";
import { parseRoster } from "@/lib/roster-extract";
const page:any = await scrapePage("https://utmsports.com/sports/baseball/roster");
const md = page.markdown ?? page.content ?? "";
const s = parseRoster(md, "baseball");
console.log("players", s.counts.players, "duplicates", s.duplicates?.length ?? "n/a", JSON.stringify(s.flags));
const names = s.players.map(p=>p.name.toLowerCase());
const dup = names.filter((n,i)=>names.indexOf(n)!==i);
console.log("repeated names:", dup.length, dup.slice(0,5));
