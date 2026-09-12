/**
 * REPORT ONLY — investigates the programs held on roster evidence: the league's
 * complete member list says the school does not field the sport, yet extracted
 * players are attached.
 *
 * For each one: where the players came from, which institution that domain
 * belongs to federally, whether the same player names sit on another school's
 * program, and whether the school could field the sport at all.
 *
 * Run: bun tmpscripts/roster-wrong-school.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";
import { normalizeName } from "@/lib/school-name-match";

const OUT = "/mnt/documents";
const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};

type Row = Record<string, string>;
const read = (file: string): Row[] => {
  const rows = parseCsv(readFileSync(`${OUT}/${file}`, "utf8"));
  const head = rows[0]!.map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);
};

const held = read("league-c2-hold-roster-evidence.csv").filter((r) => Number(r["players_on_file"] ?? 0) > 0);
console.log(`held with extracted players: ${held.length}`);

/* federal websites, so a domain can be traced to the institution that owns it */
const fedByDomain = new Map<string, string>();
for (const [unitid, name, state, website] of q(`
  select unitid::text, name, coalesce(state,''), coalesce(website,'') from public.federal_directory`)) {
  const d = registrableDomain(website!);
  if (d && !fedByDomain.has(d)) fedByDomain.set(d, `${name} (${state}) [${unitid}]`);
}

/* every program's links and school, to trace a domain to another program */
const programs = q(`
  select p.id, u.name, coalesce(u.state,''), p.sport::text,
         coalesce(p.roster_url,''), coalesce(p.athletic_website,''), coalesce(u.website_url,'')
    from public.programs p join public.universities u on u.id = p.university_id`);
const domainHolders = new Map<string, string[]>();
for (const [, uname, ustate, sport, roster, athletic] of programs) {
  for (const url of [roster!, athletic!]) {
    const d = registrableDomain(url);
    if (!d) continue;
    if (!domainHolders.has(d)) domainHolders.set(d, []);
    const label = `${uname} (${ustate}) ${sport}`;
    if (!domainHolders.get(d)!.includes(label)) domainHolders.get(d)!.push(label);
  }
}

/* players by program, for the "same squad on two schools" test */
const players = q(`
  select program_id, name from public.roster_players`);
const byProgram = new Map<string, Set<string>>();
for (const [pid, name] of players) {
  if (!byProgram.has(pid!)) byProgram.set(pid!, new Set());
  byProgram.get(pid!)!.add(normalizeName(name!));
}
const programMeta = new Map(programs.map((p) => [p[0]!, { school: p[1]!, state: p[2]!, sport: p[3]! }]));

/** Schools that cannot field a men's team, or a women's-only sport. */
const WOMEN_ONLY = [
  "mount mary", "cottey", "brenau", "wesleyan college", "notre dame de namur",
  "st catherine", "saint catherine", "bay path", "meredith", "converse",
  "mary baldwin", "salem college", "stephens college", "ursuline", "trinity washington",
];

const rows: unknown[][] = [];
for (const h of held) {
  const pid = h["program_id"]!;
  const rosterUrl = q(`select coalesce(roster_url,''), coalesce(athletic_website,'') from public.programs where id = '${pid}'`)[0] ?? ["", ""];
  const dom = registrableDomain(rosterUrl[0]! || rosterUrl[1]!);
  const ownDom = registrableDomain(q(`select coalesce(website_url,'') from public.universities where id = '${h["school_id"]}'`)[0]?.[0] ?? "");
  const fedOwner = dom ? fedByDomain.get(dom) : undefined;
  const alsoHeldBy = (dom ? domainHolders.get(dom) ?? [] : []).filter((l) => !l.startsWith(`${h["school"]} `));

  // Same squad on another program?
  const mine = byProgram.get(pid) ?? new Set();
  let overlap = "";
  if (mine.size >= 5) {
    for (const [other, names] of byProgram) {
      if (other === pid || names.size < 5) continue;
      let shared = 0;
      for (const n of mine) if (names.has(n)) shared++;
      if (shared >= Math.max(5, Math.floor(mine.size * 0.5))) {
        const m = programMeta.get(other);
        overlap = `${shared}/${mine.size} names also on ${m?.school} (${m?.state}) ${m?.sport}`;
        break;
      }
    }
  }

  const womenOnly = WOMEN_ONLY.some((w) => normalizeName(h["school"]!).includes(w));
  const verdict = overlap
    ? "same squad on another school's program — roster attached to the wrong program"
    : fedOwner && dom && dom !== ownDom && !fedOwner.startsWith(h["school"]!)
      ? `roster read from a domain federally owned by ${fedOwner}`
      : womenOnly && h["sport"] === "baseball"
        ? "women's college — cannot field baseball; roster belongs to another school"
        : alsoHeldBy.length
          ? "domain shared with another school's program on file"
          : "roster domain looks like this school's own — league list may be incomplete";

  rows.push([
    h["school"], h["school_id"], h["federal_id"], h["state"], h["governing_body"], h["sport"], pid,
    h["players_on_file"], rosterUrl[0], dom ?? "", ownDom ?? "", fedOwner ?? "no federal owner for this domain",
    alsoHeldBy.join(" | "), overlap, womenOnly ? "yes" : "no", verdict,
  ]);
}

write("league-c2-roster-investigation.csv", [
  ["school", "school_id", "federal_id", "state", "governing_body", "sport", "program_id",
   "players_on_file", "roster_url", "roster_domain", "school_own_domain",
   "federal_owner_of_roster_domain", "domain_also_on_these_programs",
   "same_players_elsewhere", "women_only_school", "verdict"],
  ...rows,
]);

const tally = new Map<string, number>();
for (const r of rows) tally.set(String(r[15]), (tally.get(String(r[15])) ?? 0) + 1);
console.log("\nverdicts:");
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
console.log("\nnothing written to the database");
