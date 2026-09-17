import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { scrapePage } from "@/lib/ingest.server";
const q = (sql: string) => execFileSync("psql", ["-At","-F","\t","-c",sql],{encoding:"utf8"}).trim().split("\n").map(l=>l.split("\t"));
const names = ["Delaware Technical Community College-Terry Campus","Santiago Canyon College","Nelson University","Independence Community College"];
for (const n of names) {
  const rows = q(`select pr.sport::text, pr.roster_url, u.name from programs pr join universities u on u.id=pr.university_id where u.name = '${n.replace(/'/g,"''")}' and coalesce(pr.roster_url,'')<>''`);
  for (const [sport,url] of rows) {
    try {
      const p:any = await scrapePage(url!);
      const md = p.markdown ?? p.content ?? "";
      const f = `/tmp/aud/${n.slice(0,12).replace(/\W/g,"")}-${sport}.md`;
      writeFileSync(f, md);
      console.log(f, md.length);
    } catch(e){ console.log(n, sport, "ERR", (e as Error).message); }
  }
}
