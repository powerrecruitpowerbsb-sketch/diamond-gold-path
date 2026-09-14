import { execFileSync } from "node:child_process";
import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";
const q=(s:string)=>execFileSync("psql",["-At","-F","\t","-c",s],{encoding:"utf8",maxBuffer:1<<28}).trim().split("\n").map(l=>l.split("\t"));
for (const name of ["Northwestern University","University of Texas at San Antonio"]) {
  const [row] = q(`select pr.roster_url, pr.sport::text from programs pr join universities u on u.id=pr.university_id where u.name='${name}' and pr.sport='baseball'`);
  const url = row![0]!;
  const page:any = await scrapePage(url);
  const md = page.markdown ?? page.content ?? "";
  console.log(`\n### ${name} ${url} chars=${md.length}`);
  const read = await readRoster(md, row![1]);
  console.log("players", read.players.length, "flags", JSON.stringify(read.shape?.flags));
  console.log(read.players.slice(0,3));
  const hit = md.split("\n").filter((l:string)=>/senior|junior|sophomore|freshman|\bCl\b|Class|Yr\./i.test(l)).slice(0,8);
  console.log("class-ish lines:", JSON.stringify(hit));
}
