import { execFileSync } from "node:child_process";
import { scrapePage } from "@/lib/ingest.server";
const url = execFileSync("psql",["-At","-c",`select pr.roster_url from programs pr join universities u on u.id=pr.university_id where u.name like 'Tompkins%' and pr.sport='baseball'`],{encoding:"utf8"}).trim();
const page:any = await scrapePage(url);
const md = page.markdown ?? page.content ?? "";
const i = md.indexOf("Barbeau");
console.log(JSON.stringify(md.slice(i-300, i+300)));
