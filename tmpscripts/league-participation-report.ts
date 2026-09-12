/**
 * REPORT ONLY — nothing is written.
 *
 * Compares the NAIA / CCCAA / NWAC participation list with every program on
 * file under those governing bodies.
 *
 * Matching rules (shared with the NJCAA pass, see src/lib/school-name-match.ts):
 *  - the federal ID is tried first, on exact federal name or alias;
 *  - names are compared direction-aware: the STORED name must be accounted
 *    for by the listed name, never the reverse;
 *  - a match that only works once a distinguishing word ("community", "state",
 *    "city", "technical") is dropped is refused;
 *  - every candidate pool is filtered by governing body AT PROGRAM LEVEL and by
 *    state (explicit hint, else the league's footprint) — including the federal
 *    path and the fallback pool;
 *  - states are compared as two-letter codes on both sides.
 *
 * Groups:
 *  A. matched     — list row lines up with a program on file
 *  B. not-on-file — list school (or its sport slot) missing from our database
 *  C. gap         — program on file the league does not list for that sport
 *  D. ambiguous   — name resolves to more than one school; assign nothing
 *
 * Run: bun tmpscripts/league-participation-report.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "@/lib/csv";
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
const CSV = "/mnt/user-uploads/naia-cccaa-nwac-participation.csv";

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

/** League shorthand that no federal or stored record uses. */
const EXPAND: [RegExp, string][] = [
  [/^LA\s+/i, "Los Angeles "],
  [/^LSU\s+/i, "Louisiana State University "],
  [/^WVU\s+/i, "West Virginia University "],
  [/^IU\s+/i, "Indiana University "],
  [/^SW\s+/i, "Southwestern "],
  [/^Park-Gilbert$/i, "Park University Gilbert"],
  [/^West LA$/i, "West Los Angeles"],
  [/^Mt\.?\s+/i, "Mount "],
  [/^A&M-Victoria$/i, "Texas A&M University-Victoria"],
  [/^OUAZ$/i, "Ottawa University Arizona"],
  [/^UHSP$/i, "University of Health Sciences and Pharmacy"],
  [/^Canyons$/i, "College of the Canyons"],
  [/^Cañada$/i, "Canada College"],
  [/^Redwoods$/i, "College of the Redwoods"],
  [/^Sequoias$/i, "College of the Sequoias"],
  [/^Siskiyous$/i, "College of the Siskiyous"],
  [/^Marin$/i, "College of Marin"],
  [/^Alameda$/i, "College of Alameda"],
  [/^San Mateo$/i, "College of San Mateo"],
  [/^Desert$/i, "College of the Desert"],
];

/** States each league actually operates in — a pool filter, not a guess. */
const LEAGUE_STATES: Record<string, string[]> = {
  CCCAA: ["CA"],
  NWAC: ["WA", "OR", "ID"],
  NAIA: [],
};

/** Splits a listed name into a comparable name plus any state it encodes. */
function cleanName(raw: string): { name: string; state: string | null } {
  let name = raw.trim();
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

type CsvRow = { raw: string; name: string; gb: string; sport: string; state: string | null };

const csvRows: CsvRow[] = [];
const rawCsv = parseCsv(readFileSync(CSV, "utf8"));
const header = rawCsv[0]!.map((h) => h.trim().toLowerCase());
const col = (h: string) => header.indexOf(h);
for (const r of rawCsv.slice(1)) {
  const raw = (r[col("school_name_as_listed")] ?? "").trim();
  if (!raw) continue;
  const { name, state } = cleanName(raw);
  csvRows.push({
    raw,
    name,
    gb: (r[col("governing_body")] ?? "").trim().toUpperCase(),
    sport: (r[col("sport")] ?? "").trim().toLowerCase(),
    state,
  });
}
console.log(
  `list: ${csvRows.length} program rows, ${new Set(csvRows.map((r) => `${r.gb}::${r.raw}`)).size} schools`,
);

type School = { id: string; name: string; state: string; unitid: string };
const schools: School[] = q(`
  select id, name, coalesce(state,''), coalesce(ipeds_unitid::text,'')
    from public.universities where retired_at is null`).map(([id, name, state, unitid]) => ({
  id: id!,
  name: name!,
  state: stateCode(state!),
  unitid: unitid!,
}));

type Program = {
  id: string;
  schoolId: string;
  sport: string;
  gb: string;
  offering: string;
  roster: string;
  players: number;
};
const programs: Program[] = q(`
  select p.id, p.university_id, p.sport::text, coalesce(p.governing_body::text,''),
         p.offering_status::text, coalesce(p.roster_url,''),
         (select count(*) from public.roster_players rp where rp.program_id = p.id)
    from public.programs p
    join public.universities u on u.id = p.university_id
   where u.retired_at is null`).map((r) => ({
  id: r[0]!,
  schoolId: r[1]!,
  sport: r[2]!,
  gb: r[3]!,
  offering: r[4]!,
  roster: r[5]!,
  players: Number(r[6] ?? 0),
}));

const schoolById = new Map(schools.map((s) => [s.id, s]));
const leagueGbs = new Set(["NAIA", "CCCAA", "NWAC"]);
const leaguePrograms = programs.filter((p) => leagueGbs.has(p.gb));
console.log(
  `on file: ${leaguePrograms.length} NAIA/CCCAA/NWAC programs across ` +
    `${new Set(leaguePrograms.map((p) => p.schoolId)).size} schools`,
);

/** Program-level index: which school holds which sport under which body. */
const programOf = new Map<string, Program>(); // `${schoolId}::${sport}`
for (const p of programs) programOf.set(`${p.schoolId}::${p.sport}`, p);
const holdsSportUnder = (schoolId: string, sport: string, gb: string) =>
  programOf.get(`${schoolId}::${sport}`)?.gb === gb;

/* ------------------------- federal directory (by ID) ---------------------- */

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

/**
 * Candidate pools. Both are governing-body filtered at PROGRAM level, so a
 * school's NJCAA baseball row cannot answer for an NWAC softball listing.
 *  - primary: the school already holds this sport under this governing body;
 *  - fallback: the school has no program of this sport at all (its slot may be
 *    missing) and sits in the state the listing points at.
 */
function pools(row: CsvRow): { primary: School[]; fallback: School[]; conflict: School[] } {
  const states = row.state ? [row.state] : (LEAGUE_STATES[row.gb] ?? []);
  const inStates = (s: School) =>
    states.length === 0 ? true : states.some((code) => sameState(s.state, code));

  const primary = schools.filter((s) => holdsSportUnder(s.id, row.sport, row.gb) && inStates(s));
  const fallback = schools.filter(
    (s) => !programOf.has(`${s.id}::${row.sport}`) && inStates(s),
  );
  // Explains a refusal only: the school holds this sport under a DIFFERENT body.
  const conflict = schools.filter(
    (s) =>
      programOf.has(`${s.id}::${row.sport}`) &&
      !holdsSportUnder(s.id, row.sport, row.gb) &&
      inStates(s),
  );
  return { primary, fallback, conflict };
}

function resolve(row: CsvRow): Result {
  const { primary, fallback, conflict } = pools(row);
  const allowed = new Set([...primary, ...fallback].map((s) => s.id));

  // 1. Federal ID — same governing-body and state filter as every other path.
  const states = row.state ? [row.state] : (LEAGUE_STATES[row.gb] ?? []);
  const fedPool = states.length
    ? fedRows.filter((f) => states.some((code) => sameState(f.state, code)))
    : fedRows;
  const target = normalizeName(row.name);
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

  // 2. Name, direction-aware, primary pool then fallback pool.
  for (const [pool, label] of [
    [primary, "same governing body and sport"],
    [fallback, "sport slot missing on file"],
  ] as [School[], string][]) {
    if (!pool.length) continue;
    const r = resolveByName(row.name, pool, (c) => holdsSportUnder(c.id, row.sport, row.gb));
    if (r.school)
      return {
        school: r.school,
        how: `${r.how} (${label})`,
        method: r.method,
        candidates: r.candidates,
      };
    if (r.method === "ambiguous")
      return { school: null, how: `${r.how} (${label})`, method: "ambiguous", candidates: r.candidates };
  }

  // 3. Nothing assignable — but say so precisely when the school IS on file and
  //    simply carries this sport under another governing body.
  const c = resolveByName(row.name, conflict);
  if (c.school) {
    const held = programOf.get(`${c.school.id}::${row.sport}`)!;
    return {
      school: null,
      how: `school on file as ${held.gb || "no governing body"} for ${row.sport} — league says ${row.gb}`,
      method: "governing body disagreement",
      candidates: [c.school],
    };
  }
  return { school: null, how: "no name match", method: "no match", candidates: [] };
}

function bestSchool(row: CsvRow): Result {
  const key = `${row.gb}::${row.raw}::${row.sport}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = resolve(row);
  cache.set(key, result);
  return result;
}

/* -------------------------------- grouping -------------------------------- */

/**
 * One pass builds every row of every group. The prose summary at the bottom is
 * computed from these same arrays — the file and the summary cannot disagree.
 */
type MatchRow = {
  school: School;
  program: Program;
  gb: string;
  sport: string;
  agrees: string;
  proposed: string;
  method: Method;
  how: string;
};

const matchRows: MatchRow[] = [];
const notOnFileRows: unknown[][] = [];
const ambiguousRows: unknown[][] = [];

function federalCandidate(row: CsvRow) {
  const states = row.state ? [row.state] : (LEAGUE_STATES[row.gb] ?? []);
  const pool = states.length
    ? fedRows.filter((f) => states.some((code) => sameState(f.state, code)))
    : fedRows;
  const hits = pool.filter((f) => nameMatch(row.name, f.name) !== null);
  const ids = [...new Set(hits.map((h) => h.unitid))];
  return ids.length === 1 ? hits[0]! : null;
}

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
        row.raw, row.gb, row.sport, row.state ?? "", how,
        candidates.map((c) => `${c.name} (${c.state})`).join(" | "),
      ]);
      continue;
    }
    const fed = federalCandidate(row);
    notOnFileRows.push([
      row.raw, row.gb, row.sport, row.state ?? "", how, "no", "",
      fed?.unitid ?? "", fed?.name ?? "", fed?.state ?? "",
      fed ? (schoolByUnitid.has(fed.unitid) ? "yes" : "no") : "",
    ]);
    continue;
  }
  const prog = programOf.get(`${school.id}::${row.sport}`);
  if (!prog) {
    notOnFileRows.push([
      row.raw, row.gb, row.sport, row.state ?? "", "school on file, sport slot missing",
      school.name, school.id, school.unitid || "", "", "", "yes",
    ]);
    continue;
  }
  claimed.add(prog.id);
  // offering_status holds unverified | verified | not_offered — never "offered".
  const agrees =
    prog.offering === "verified"
      ? "yes — already verified"
      : prog.offering === "not_offered"
        ? "no — stored not_offered contradicts the league list"
        : "not yet confirmed on file (unverified)";
  matchRows.push({
    school,
    program: prog,
    gb: prog.gb || row.gb,
    sport: row.sport,
    agrees,
    proposed: prog.offering === "verified" ? "no change (already verified)" : "verified",
    method,
    how,
  });
}

const gapRows = leaguePrograms
  .filter((p) => !claimed.has(p.id))
  .map((p) => {
    const s = schoolById.get(p.schoolId)!;
    const listed = listedBySchool.get(p.schoolId);
    const other = listed ? [...listed].filter((x) => x !== p.sport) : [];
    return {
      p,
      s,
      other,
      finding: other.length
        ? `league lists this school for ${other.join("/")} but not ${p.sport}`
        : "school not on the league list for either sport — membership needs confirming",
      proposed: other.length ? "not_offered" : "hold — confirm membership first",
    };
  });

/* -------------------------------- exports --------------------------------- */

write("league-a-matched.csv", [
  ["school_on_file", "school_id", "federal_id", "state", "governing_body", "sport",
   "program_id", "current_offering_status", "league_says", "agrees", "proposed_offering_status",
   "proposed_source", "roster_url_on_file", "players_on_file", "matched_method", "matched_how"],
  ...matchRows.map((r) => [
    r.school.name, r.school.id, r.school.unitid || "none", r.school.state, r.gb, r.sport,
    r.program.id, r.program.offering, "fields the sport", r.agrees, r.proposed,
    "league participation list", r.program.roster ? "yes" : "no", r.program.players,
    r.method, r.how,
  ]),
]);
write("league-b-not-on-file.csv", [
  ["listed_name", "governing_body", "sport", "state_hint", "why",
   "school_matched_but_no_program", "school_id", "federal_candidate_id", "federal_candidate_name",
   "federal_candidate_state", "held_on_file"],
  ...notOnFileRows,
]);
write("league-c-gap.csv", [
  ["school", "school_id", "federal_id", "state", "governing_body", "sport",
   "current_offering_status", "league_lists_school_for_other_sport", "roster_url_on_file",
   "players_on_file", "finding", "proposed_offering_status"],
  ...gapRows.map((g) => [
    g.s.name, g.s.id, g.s.unitid || "none", g.s.state, g.p.gb, g.p.sport, g.p.offering,
    g.other.join("/") || "no", g.p.roster ? "yes" : "no", g.p.players, g.finding, g.proposed,
  ]),
]);
write("league-d-ambiguous.csv", [
  ["listed_name", "governing_body", "sport", "state_hint", "reason", "candidates"],
  ...ambiguousRows,
]);

/* -------------------------------- summary --------------------------------- */

console.log("\n--- summary (same arrays that produced the files) ------------");
for (const gb of ["NAIA", "CCCAA", "NWAC"]) {
  const rows = matchRows.filter((r) => r.gb === gb);
  console.log(
    `${gb.padEnd(6)} matched ${String(rows.length).padStart(3)}  ` +
      `already verified ${rows.filter((r) => r.program.offering === "verified").length}  ` +
      `unverified ${rows.filter((r) => r.program.offering === "unverified").length}  ` +
      `contradicts not_offered ${rows.filter((r) => r.program.offering === "not_offered").length}`,
  );
}
console.log(`A matched total                   ${matchRows.length}`);
console.log(`B in league list, not on file      ${notOnFileRows.length}`);
console.log(`C on file, league does not list    ${gapRows.length}`);
console.log(`   -> proposed not_offered         ${gapRows.filter((g) => g.proposed === "not_offered").length}`);
console.log(`   -> hold, membership unconfirmed ${gapRows.filter((g) => g.proposed !== "not_offered").length}`);
console.log(`D ambiguous (nothing assigned)     ${ambiguousRows.length}`);

console.log("\nmatched_how by method:");
const byMethod = new Map<string, number>();
for (const r of matchRows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + 1);
for (const [k, v] of [...byMethod].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
const fed = matchRows.filter((r) => r.method === "federal id").length;
console.log(`  rests on federal id ${fed}, rests on name ${matchRows.length - fed}`);

const mm = matchRows.filter((r) => r.school.name.toLowerCase().includes("mount mary"));
const mmGap = gapRows.filter((g) => g.s.name.toLowerCase().includes("mount mary"));
console.log("\nMount Mary cross-check:");
for (const r of mm) console.log(`  matched  ${r.sport} — stored ${r.program.offering} — ${r.method}`);
for (const g of mmGap) console.log(`  gap      ${g.p.sport} — stored ${g.p.offering} — ${g.proposed}`);
console.log("\nnothing written to the database");
