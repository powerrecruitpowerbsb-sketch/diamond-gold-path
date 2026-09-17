import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { scrapePage } from "@/lib/ingest.server";
const q=(s:string)=>execFileSync("psql",["-At","-F","\t","-c",s],{encoding:"utf8"}).trim().split("\n").map(l=>l.split("\t"));
const [[url]] = q(`select pr.roster_url from programs pr join universities u on u.id=pr.university_id where u.name='Dartmouth College' and pr.sport='softball'`);
const p:any = await scrapePage(url!); const md = p.markdown ?? p.content ?? "";
writeFileSync("/tmp/aud/dartmouth-sb.md", md);
const i = md.split("\n").findIndex((l:string)=>/academic year/i.test(l));
console.log(md.split("\n").slice(Math.max(0,i-6), i+8).join("\n"));
