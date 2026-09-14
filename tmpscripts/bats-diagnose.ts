/**
 * Diagnose the blank bats/throws columns.
 *
 * 609 teams with a 20+ roster have NO batting side stored for any player. This
 * reads a sample of those pages and reports, per page, whether the page itself
 * publishes bats/throws (and under what heading) and what our reader returns —
 * so we can tell "the school doesn't publish it" apart from "our reader misses
 * it". Report only; nothing is written.
 *
 *   bun tmpscripts/bats-diagnose.ts [--n 12]
 */
import { execFileSync } from "node:child_process";
import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";

const args = process.argv.slice(2);
const at = args.indexOf("--n");
const N = at === -1 ? 12 : Number(args[at + 1]);

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

const rows = q(`
  with p as (
    select program_id, count(*) n, count(bats) b
      from roster_players group by 1
  )
  select pr.id, u.name, pr.sport::text, coalesce(pr.roster_url,''), p.n
    from p join programs pr on pr.id = p.program_id
            join universities u on u.id = pr.university_id
   where p.n >= 20 and p.b = 0 and coalesce(pr.roster_url,'') <> ''
   order by md5(pr.id::text)
   limit ${N}`);

const HEADING = /\b(bats?\s*[/|-]\s*throws?|b\s*\/\s*t|bats|throws)\b/i;

for (const [id, name, sport, url, n] of rows) {
  try {
    const page = await scrapePage(url!);
    const markdown = (page as any).markdown ?? (page as any).content ?? "";
    if (!markdown) {
      console.log(`${name} ${sport}: page unreadable (${(page as any).error ?? "no content"})`);
      continue;
    }
    const heading = markdown.split("\n").find((line: string) => HEADING.test(line)) ?? "";
    const read = await readRoster(markdown, sport);
    const withBats = read.players.filter((p) => p.bats).length;
    const rawBats = read.players.filter((p) => p.bats_raw).length;
    console.log(
      [
        `${name} ${sport} (stored ${n}, read ${read.players.length})`,
        `page mentions bats/throws: ${heading ? "YES" : "no"}`,
        heading ? `heading line: ${heading.slice(0, 120).replace(/\s+/g, " ")}` : "",
        `reader bats: ${withBats}, raw captured: ${rawBats}`,
        url,
      ]
        .filter(Boolean)
        .join("\n    "),
    );
  } catch (error) {
    console.log(`${name} ${sport}: ${(error as Error).message}`);
  }
}
