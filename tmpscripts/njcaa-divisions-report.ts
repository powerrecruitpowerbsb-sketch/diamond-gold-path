/**
 * REPORT ONLY — nothing is written.
 *
 * Compares the NJCAA division lists supplied by the user with every program
 * marked NJCAA on file. Matching uses the shared, direction-aware matcher in
 * src/lib/school-name-match.ts: federal ID first, then whole-name agreement,
 * then identity-word agreement; a match that only works once a distinguishing
 * word is dropped is refused. Pools are governing-body filtered at PROGRAM
 * level and state-filtered with normalised state codes on both sides.
 *
 * Groups:
 *  A. matched      — CSV row lines up with an NJCAA program on file
 *  B. no-program   — school on file, but no program of that sport
 *  C. no-school    — CSV school not on file at all
 *  D. gap          — NJCAA program on file the NJCAA does not list
 *
 * Run: bun tmpscripts/njcaa-divisions-report.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";
import {
  nameMatch,
  normalizeName,
  resolveByName,
  sameState,
  stateCode,
  STATE_CODES,
  STATE_NAMES,
} from "@/lib/school-name-match";

const OUT = "/mnt/documents";
const CSV = "/mnt/user-uploads/njcaa-divisions-for-import.csv";

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};

/** Abbreviations the NJCAA lists that no federal or stored record uses. */
const EXPAND: [RegExp, string][] = [
  [/^USC\s+/i, "University of South Carolina "],
  [/^UofSC\s+/i, "University of South Carolina "],
  [/^WVU\s+/i, "West Virginia University "],
  [/^RCSJ\b/i, "Rowan College of South Jersey"],
  [/^ASU\s+/i, "Arkansas State University "],
];

/** Splits a listed name into a comparable name plus any state it encodes. */
function cleanName(raw: string): { name: string; state: string | null } {
  let name = raw.trim().replace(/(\D)0$/, "$1");
  let state: string | null = null;

  const readState = (text: string): string | null => {
    const inner = text.trim().replace(/\./g, "");
    if (inner.length === 2 && STATE_CODES.has(inner.toUpperCase())) return inner.toUpperCase();
    return STATE_NAMES[normalizeName(inner)] ?? null;
  };

  const paren = /\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    const code = readState(paren[1]!);
    if (code) {
      state = code;
      name = name.replace(paren[0], "").trim();
    }
  }
  const dash = /[-–]\s*([A-Za-z .]+)$/.exec(name);
  if (dash) {
    const code = readState(dash[1]!);
    if (code) {
      state = state ?? code;
      name = name.replace(dash[0], "").trim();
    }
  }
  for (const [pattern, replacement] of EXPAND) {
    if (pattern.test(name)) {
      name = name.replace(pattern, replacement).trim();
      break;
    }
  }
  return { name, state };
}

/* --------------------------------- inputs --------------------------------- */

type CsvRow = { raw: string; name: string; sport: string; division: string; state: string | null };

const csvRows: CsvRow[] = [];
const rawCsv = parseCsv(readFileSync(CSV, "utf8"));
const header = rawCsv[0]!.map((h) => h.trim().toLowerCase());
const col = (h: string) => header.indexOf(h);
for (const r of rawCsv.slice(1)) {
  const raw = (r[col("school_name")] ?? "").trim();
  if (!raw) continue;
  const { name, state } = cleanName(raw);
  csvRows.push({
    raw,
    name,
    sport: (r[col("sport")] ?? "").trim().toLowerCase(),
    division: (r[col("division")] ?? "").trim(),
    state,
  });
}
console.log(`CSV: ${csvRows.length} program rows, ${new Set(csvRows.map((r) => r.raw)).size} schools`);

type School = { id: string; name: string; state: string; unitid: string; website: string };
const schools: School[] = q(`
  select id, name, coalesce(state,''), coalesce(ipeds_unitid::text,''), coalesce(website_url,'')
    from public.universities where retired_at is null`).map(([id, name, state, unitid, website]) => ({
  id: id!,
  name: name!,
  state: stateCode(state!),
  unitid: unitid!,
  website: website!,
}));

type Program = {
  id: string;
  schoolId: string;
  sport: string;
  gb: string;
  division: string;
  conference: string;
  offering: string;
  athletic: string;
  roster: string;
  players: number;
  coach: string;
};
const programs: Program[] = q(`
  select p.id, p.university_id, p.sport::text, coalesce(p.governing_body::text,''),
         coalesce(p.division,''), coalesce(p.conference,''), p.offering_status::text,
         coalesce(p.athletic_website,''), coalesce(p.roster_url,''),
         (select count(*) from public.roster_players rp where rp.program_id = p.id),
         coalesce(p.head_coach_name,'')
    from public.programs p
    join public.universities u on u.id = p.university_id
   where u.retired_at is null`).map((r) => ({
  id: r[0]!,
  schoolId: r[1]!,
  sport: r[2]!,
  gb: r[3]!,
  division: r[4]!,
  conference: r[5]!,
  offering: r[6]!,
  athletic: r[7]!,
  roster: r[8]!,
  players: Number(r[9] ?? 0),
  coach: r[10]!,
}));

const schoolById = new Map(schools.map((s) => [s.id, s]));
const njcaaPrograms = programs.filter((p) => p.gb === "NJCAA");
console.log(
  `on file: ${njcaaPrograms.length} NJCAA programs across ` +
    `${new Set(njcaaPrograms.map((p) => p.schoolId)).size} schools`,
);

const programOf = new Map<string, Program>();
for (const p of programs) programOf.set(`${p.schoolId}::${p.sport}`, p);
const holdsSportUnder = (schoolId: string, sport: string, gb: string) =>
  programOf.get(`${schoolId}::${sport}`)?.gb === gb;

/* ------------------------- NCAA list for gb cross-check ------------------- */

const ncaaDomains = new Set<string>();
try {
  const res = await fetch("https://web3.ncaa.org/directory/api/directory/memberList?type=12", {
    headers: { Accept: "application/json" },
  });
  if (res.ok) {
    for (const m of (await res.json()) as any[]) {
      for (const field of [m?.webSiteUrl, m?.athleticWebUrl]) {
        const d = registrableDomain(String(field ?? ""));
        if (d) ncaaDomains.add(d);
      }
    }
  }
} catch {
  console.log("NCAA list unavailable — governing-body cross-check skipped");
}

/* ------------------------------ federal rows ------------------------------ */

type FedRow = { unitid: string; name: string; alias: string; state: string };
const fedRows: FedRow[] = q(`
  select unitid::text, name, coalesce(alias,''), coalesce(state,'')
    from public.federal_directory`).map(([unitid, name, alias, state]) => ({
  unitid: unitid!,
  name: name!,
  alias: alias!,
  state: stateCode(state!),
}));
const schoolByUnitid = new Map(schools.filter((s) => s.unitid).map((s) => [s.unitid, s]));

/* --------------------------------- match ---------------------------------- */

type Method = "federal id" | "exact name" | "same significant words" | "ambiguous" | "no match";
type Result = { school: School | null; how: string; method: Method; candidates: School[] };
const cache = new Map<string, Result>();

function pools(row: CsvRow): { primary: School[]; fallback: School[] } {
  const inState = (s: School) => (row.state ? sameState(s.state, row.state) : true);
  const primary = schools.filter((s) => holdsSportUnder(s.id, row.sport, "NJCAA") && inState(s));
  const fallback = schools.filter((s) => !programOf.has(`${s.id}::${row.sport}`) && inState(s));
  return { primary, fallback };
}

function resolve(row: CsvRow): Result {
  const { primary, fallback } = pools(row);
  const allowed = new Set([...primary, ...fallback].map((s) => s.id));

  // 1. Federal ID, filtered by the same state and governing-body pool.
  const target = normalizeName(row.name);
  const fedPool = row.state ? fedRows.filter((f) => sameState(f.state, row.state)) : fedRows;
  const fedIds = [
    ...new Set(
      fedPool
        .filter(
          (f) =>
            normalizeName(f.name) === target ||
            f.alias.split("|").some((a) => a.trim() && normalizeName(a) === target),
        )
        .map((f) => f.unitid),
    ),
  ];
  if (fedIds.length === 1) {
    const held = schoolByUnitid.get(fedIds[0]!);
    if (held && allowed.has(held.id))
      return { school: held, how: `federal id ${fedIds[0]}`, method: "federal id", candidates: [held] };
  }

  // 2. Name, direction-aware.
  for (const [pool, label] of [
    [primary, "same governing body and sport"],
    [fallback, "sport slot missing on file"],
  ] as [School[], string][]) {
    if (!pool.length) continue;
    const r = resolveByName(row.name, pool, (c) => holdsSportUnder(c.id, row.sport, "NJCAA"));
    if (r.school)
      return { school: r.school, how: `${r.how} (${label})`, method: r.method, candidates: r.candidates };
    if (r.method === "ambiguous")
      return { school: null, how: `${r.how} (${label})`, method: "ambiguous", candidates: r.candidates };
  }
  return { school: null, how: "no name match", method: "no match", candidates: [] };
}

function bestSchool(row: CsvRow): Result {
  const key = `${row.raw}::${row.sport}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = resolve(row);
  cache.set(key, result);
  return result;
}

function federalCandidate(row: CsvRow) {
  const pool = row.state ? fedRows.filter((f) => sameState(f.state, row.state)) : fedRows;
  const hits = pool.filter((f) => nameMatch(row.name, f.name) !== null);
  const ids = [...new Set(hits.map((h) => h.unitid))];
  return ids.length === 1 ? hits[0]! : null;
}

/* -------------------------------- grouping -------------------------------- */

type MatchRow = {
  school: School;
  program: Program;
  row: CsvRow;
  change: string;
  method: Method;
  how: string;
};

const matchRows: MatchRow[] = [];
const noProgramRows: unknown[][] = [];
const noSchoolRows: unknown[][] = [];
const ambiguousRows: unknown[][] = [];

const claimed = new Set<string>();
const listedBySchool = new Map<string, Set<string>>();

for (const row of csvRows) {
  const { school } = bestSchool(row);
  if (!school) continue;
  if (!listedBySchool.has(school.id)) listedBySchool.set(school.id, new Set());
  listedBySchool.get(school.id)!.add(row.sport);
}

for (const row of csvRows) {
  const { school, how, method, candidates } = bestSchool(row);
  if (!school) {
    if (method === "ambiguous") {
      ambiguousRows.push([
        row.raw, row.state ?? "", row.sport, row.division, how,
        candidates.map((c) => `${c.name} (${c.state})`).join(" | "),
      ]);
      continue;
    }
    const fed = federalCandidate(row);
    noSchoolRows.push([
      row.raw, row.state ?? "", row.sport, row.division, how,
      fed?.unitid ?? "", fed?.name ?? "", fed?.state ?? "",
      fed ? (schoolByUnitid.has(fed.unitid) ? "yes" : "no") : "",
    ]);
    continue;
  }
  const prog = programOf.get(`${school.id}::${row.sport}`);
  if (!prog) {
    noProgramRows.push([row.raw, school.name, school.id, school.state, row.sport, row.division, how]);
    continue;
  }
  claimed.add(prog.id);
  matchRows.push({
    school,
    program: prog,
    row,
    change:
      prog.division === row.division ? "no change" : prog.division ? "correction" : "fill empty",
    method,
    how,
  });
}

const gapRows = njcaaPrograms
  .filter((p) => !claimed.has(p.id))
  .map((p) => {
    const s = schoolById.get(p.schoolId)!;
    const listed = listedBySchool.get(p.schoolId);
    const other = listed ? [...listed].filter((x) => x !== p.sport) : [];
    const dom = registrableDomain(p.athletic || s.website);
    const ncaaMember = dom ? ncaaDomains.has(dom) : false;
    const finding = other.length
      ? `NJCAA member (listed for ${other.join("/")}) but does not field ${p.sport}`
      : ncaaMember
        ? "not on the NJCAA list at all and its domain appears on the NCAA member list"
        : "not on the NJCAA list for either sport";
    const action = other.length
      ? "offering_status = not_offered"
      : ncaaMember
        ? "governing body likely wrong — verify against NCAA before any division is set"
        : "verify membership; if it fields no NJCAA team, offering_status = not_offered";
    return { p, s, other, ncaaMember, finding, action };
  });

/* -------------------------------- exports --------------------------------- */

write("njcaa-a-matched.csv", [
  ["school_on_file", "school_id", "federal_id", "state", "sport", "csv_division", "stored_division",
   "change", "program_id", "matched_method", "matched_how"],
  ...matchRows.map((r) => [
    r.school.name, r.school.id, r.school.unitid || "none", r.school.state, r.row.sport,
    r.row.division, r.program.division || "empty", r.change, r.program.id, r.method, r.how,
  ]),
]);
write("njcaa-b-no-program-on-file.csv", [
  ["csv_school", "matched_school_on_file", "school_id", "state", "sport", "csv_division", "matched_how"],
  ...noProgramRows,
]);
write("njcaa-c-school-not-on-file.csv", [
  ["csv_school", "state_hint", "sport", "csv_division", "reason",
   "federal_candidate_id", "federal_candidate_name", "federal_candidate_state", "held_on_file"],
  ...noSchoolRows,
]);
write("njcaa-d-gap.csv", [
  ["school", "school_id", "federal_id", "state", "sport", "stored_division", "stored_conference",
   "offering_status", "school_listed_by_njcaa_for_other_sport", "has_athletics_link", "has_roster_link",
   "players_on_file", "head_coach_on_file", "domain_is_ncaa_member", "finding", "recommended_action"],
  ...gapRows.map((g) => [
    g.s.name, g.s.id, g.s.unitid || "none", g.s.state, g.p.sport, g.p.division || "empty",
    g.p.conference || "empty", g.p.offering, g.other.join("/") || "no", g.p.athletic ? "yes" : "no",
    g.p.roster ? "yes" : "no", g.p.players, g.p.coach ? "yes" : "no", g.ncaaMember ? "yes" : "no",
    g.finding, g.action,
  ]),
]);
write("njcaa-e-ambiguous.csv", [
  ["csv_school", "state_hint", "sport", "csv_division", "reason", "candidates"],
  ...ambiguousRows,
]);

/* -------------------------------- summary --------------------------------- */

console.log("\n--- summary (same arrays that produced the files) ------------");
console.log(`A matched            ${matchRows.length}`);
console.log(`   fill empty        ${matchRows.filter((r) => r.change === "fill empty").length}`);
console.log(`   correction        ${matchRows.filter((r) => r.change === "correction").length}`);
console.log(`   no change         ${matchRows.filter((r) => r.change === "no change").length}`);
console.log(`B school on file, no program of that sport    ${noProgramRows.length}`);
console.log(`C CSV school not on file                      ${noSchoolRows.length}`);
console.log(`D gap: NJCAA programs the NJCAA does not list  ${gapRows.length}`);
console.log(`   fields the other sport only (not_offered)   ${gapRows.filter((g) => g.other.length).length}`);
console.log(`   governing body suspect (NCAA domain)        ${gapRows.filter((g) => !g.other.length && g.ncaaMember).length}`);
console.log(`   not listed either sport                     ${gapRows.filter((g) => !g.other.length && !g.ncaaMember).length}`);
console.log(`E ambiguous (nothing assigned)                 ${ambiguousRows.length}`);

console.log("\nmatched_how by method:");
const byMethod = new Map<string, number>();
for (const r of matchRows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + 1);
for (const [k, v] of [...byMethod].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
const fed = matchRows.filter((r) => r.method === "federal id").length;
console.log(`  rests on federal id ${fed}, rests on name ${matchRows.length - fed}`);
console.log("\nnothing written to the database");
