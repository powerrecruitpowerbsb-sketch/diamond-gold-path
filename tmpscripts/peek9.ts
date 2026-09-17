import { execFileSync } from "node:child_process";
import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";
const url = execFileSync("psql",["-At","-c",`select pr.roster_url from programs pr join universities u on u.id=pr.university_id where u.name like 'Tompkins%' and pr.sport='baseball'`],{encoding:"utf8"}).trim();
const page:any = await scrapePage(url);
const read = await readRoster(page.markdown ?? page.content ?? "", "baseball");
for (const p of read.players) if (/barbeau|joly|meerburg/i.test(p.name)) console.log(p.name, "|", p.hometown, "|", p.home_state, p.home_country);
