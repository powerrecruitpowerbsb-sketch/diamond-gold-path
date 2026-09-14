import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";
const urls = [
  ["SDSU baseball","https://goaztecs.com/sports/baseball/roster","baseball"],
  ["Raritan baseball","https://www.rvccathletics.com/sports/bsb/2025-26/roster","baseball"],
];
for (const [label,url,sport] of urls) {
  try {
    const page:any = await scrapePage(url!);
    const md = page.markdown ?? page.content ?? "";
    console.log(`\n=== ${label}: chars ${md.length} error ${page.error ?? "none"}`);
    const read = await readRoster(md, sport);
    console.log(`reader ${read.reader} players ${read.players.length} rowsConsidered ${read.diagnostics.likelyRows} flags ${JSON.stringify(read.shape?.flags)} seasons ${JSON.stringify(read.shape?.seasons?.slice(0,3))}`);
    require("node:fs").writeFileSync(`/tmp/d/${label.split(" ")[0]}.md`, md);
    console.log(md.slice(0,1200));
  } catch (e) { console.log(`${label}: THREW ${(e as Error).message}`); }
}
