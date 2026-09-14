/**
 * Hand check by machine: read 20 stored rosters again and report every field
 * where the page and our stored value disagree.
 *
 * Report only — nothing is written, and the pages are read once, not crawled.
 *
 *   bun tmpscripts/page-audit-20.ts [--n 20]
 */
import { execFileSync } from "node:child_process";
import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";

const args = process.argv.slice(2);
const at = args.indexOf("--n");
const N = at === -1 ? 20 : Number(args[at + 1]);

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

const programs = q(`
  with p as (select program_id, count(*) n from roster_players group by 1)
  select pr.id, u.name, pr.sport::text, pr.roster_url, p.n, coalesce(pr.coach_source_domain,'')
    from p join programs pr on pr.id = p.program_id
            join universities u on u.id = pr.university_id
   where p.n >= 15 and coalesce(pr.roster_url,'') <> ''
   order by md5(pr.id::text || 'audit')
   limit ${N}`);

type Tally = Record<string, number>;
const totals: Tally = {};
const bump = (key: string, by = 1) => (totals[key] = (totals[key] ?? 0) + by);

for (const [id, school, sport, url, stored] of programs) {
  let page;
  try {
    page = await scrapePage(url!);
  } catch (error) {
    console.log(`${school} ${sport}: unreadable — ${(error as Error).message}`);
    bump("pages unreadable");
    continue;
  }
  const markdown = (page as any).markdown ?? (page as any).content ?? "";
  if (!markdown) {
    console.log(`${school} ${sport}: unreadable — ${(page as any).error ?? "no content"}`);
    bump("pages unreadable");
    continue;
  }
  const read = await readRoster(markdown, sport);
  const rows = q(
    `select lower(trim(name)), coalesce(position::text,''), coalesce(class_year::text,''),
            coalesce(bats::text,''), coalesce(throws::text,''), coalesce(home_state,'')
       from roster_players where program_id = '${id}'`,
  );
  const storedByName = new Map(rows.map((r) => [r[0]!, r]));
  const fresh = new Map(read.players.map((p) => [p.name.trim().toLowerCase(), p]));

  const diffs: string[] = [];
  let gained = 0;
  let changed = 0;
  for (const [name, p] of fresh) {
    const row = storedByName.get(name);
    if (!row) continue;
    const pairs: [string, string, string | null][] = [
      ["position", row[1]!, p.position],
      ["class year", row[2]!, p.class_year],
      ["bats", row[3]!, p.bats],
      ["throws", row[4]!, p.throws],
      ["home state", row[5]!, p.home_state],
    ];
    for (const [field, was, now] of pairs) {
      const nowText = now ?? "";
      if (was === nowText) continue;
      if (!was && nowText) {
        gained += 1;
        bump(`${field}: gained`);
        diffs.push(`${name}: ${field} blank → ${nowText}`);
      } else if (was && nowText && was !== nowText) {
        changed += 1;
        bump(`${field}: disagrees`);
        diffs.push(`${name}: ${field} ${was} → ${nowText}`);
      } else {
        bump(`${field}: lost on re-read`);
        diffs.push(`${name}: ${field} ${was} → blank`);
      }
    }
  }
  const missing = [...fresh.keys()].filter((name) => !storedByName.has(name)).length;
  console.log(
    `${school} ${sport}: stored ${stored}, read ${read.players.length}, ${gained} values gained, ${changed} disagree, ${missing} players on the page we do not hold`,
  );
  for (const line of diffs.slice(0, 8)) console.log(`    ${line}`);
  if (diffs.length > 8) console.log(`    … ${diffs.length - 8} more`);
}

console.log("\nacross the sample:");
for (const [key, value] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${value}`);
}
