/**
 * REPORT ONLY — nothing is written.
 *
 * Reads the NAIA / CCCAA / NWAC participation list supplied by the user and
 * compares it with every program on file under those governing bodies.
 *
 * Groups:
 *  A. matched     — list row lines up with a program on file (offering agrees?)
 *  B. not-on-file — list school (or its sport slot) missing from our database
 *  C. gap         — program on file that the league does not list for that sport
 *  D. ambiguous   — name resolves to more than one school; assign nothing
 *
 * Matching never uses a fuzzy name alone: every candidate pool is filtered by
 * governing body first and by state (explicit hint, or the league's own
 * footprint) second; only a unique survivor is accepted.
 *
 * Run: bun tmpscripts/league-participation-report.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "@/lib/csv";

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

/* ----------------------------- normalisation ------------------------------ */

const STOP = new Set([
  "the", "of", "at", "and", "college", "colleges", "community", "university",
  "institute", "junior", "school", "campus", "area", "district", "cc", "jc",
]);

const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
]);

/** Full names and AP-style abbreviations the league lists use in parentheses. */
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", ala: "AL", alaska: "AK", arizona: "AZ", ariz: "AZ",
  arkansas: "AR", ark: "AR", california: "CA", calif: "CA", cal: "CA",
  colorado: "CO", colo: "CO", connecticut: "CT", conn: "CT", delaware: "DE", del: "DE",
  florida: "FL", fla: "FL", georgia: "GA", ga: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", ill: "IL", indiana: "IN", ind: "IN",
  iowa: "IA", kansas: "KS", kan: "KS", kans: "KS", kentucky: "KY", ky: "KY",
  louisiana: "LA", la: "LA", maine: "ME", maryland: "MD", md: "MD",
  massachusetts: "MA", mass: "MA", michigan: "MI", mich: "MI",
  minnesota: "MN", minn: "MN", mississippi: "MS", miss: "MS",
  missouri: "MO", mo: "MO", montana: "MT", mont: "MT", nebraska: "NE", neb: "NE", nebr: "NE",
  nevada: "NV", nev: "NV", "new hampshire": "NH", "n h": "NH",
  "new jersey": "NJ", "n j": "NJ", "new mexico": "NM", "n m": "NM",
  "new york": "NY", "n y": "NY", "north carolina": "NC", "n c": "NC",
  "north dakota": "ND", "n d": "ND", ohio: "OH", oklahoma: "OK", okla: "OK",
  oregon: "OR", ore: "OR", pennsylvania: "PA", pa: "PA", penn: "PA",
  "rhode island": "RI", "r i": "RI", "south carolina": "SC", "s c": "SC",
  "south dakota": "SD", "s d": "SD", tennessee: "TN", tenn: "TN",
  texas: "TX", tex: "TX", utah: "UT", vermont: "VT", vt: "VT",
  virginia: "VA", va: "VA", washington: "WA", wash: "WA",
  "west virginia": "WV", "w va": "WV", wisconsin: "WI", wis: "WI", wisc: "WI",
  wyoming: "WY", wyo: "WY",
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

/** States each league actually operates in — used as a pool filter, not a guess. */
const LEAGUE_STATES: Record<string, string[]> = {
  CCCAA: ["CA"],
  NWAC: ["WA", "OR", "ID"],
  NAIA: [],
};

function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const STEM: Record<string, string> = {
  technology: "tech", technical: "tech", technological: "tech",
  univ: "university", saint: "st", mount: "mt",
};
function tokens(name: string): string[] {
  return norm(name)
    .split(" ")
    .map((t) => STEM[t] ?? t)
    .filter((t) => t && !STOP.has(t));
}

/** Stored states are a mix of two-letter codes and spelled-out names. */
function stateCode(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.length === 2 && STATE_CODES.has(v.toUpperCase())) return v.toUpperCase();
  return STATE_NAMES[norm(v)] ?? v.toUpperCase();
}
/**
 * Directional: what share of the LISTED name's words appear in the stored name.
 * League names are shorthand of the full name, never the other way round, so a
 * shorter stored name must not score 1.0 just by being a subset.
 */
function containment(listed: string[], stored: string[]): number {
  if (!listed.length || !stored.length) return 0;
  const set = new Set(stored);
  return listed.filter((t) => set.has(t)).length / listed.length;
}

/** Splits a listed name into a comparable name plus any state it encodes. */
function cleanName(raw: string): { name: string; state: string | null } {
  let name = raw.trim();
  let state: string | null = null;

  const paren = /\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    const inner = paren[1]!.trim().replace(/\./g, "");
    const code =
      inner.length === 2 && STATE_CODES.has(inner.toUpperCase())
        ? inner.toUpperCase()
        : STATE_NAMES[norm(inner)];
    if (code) {
      state = code;
      name = name.replace(paren[0], "").trim();
    }
  }
  const dash = /[-–]\s*([A-Za-z .]+)$/.exec(name);
  if (dash) {
    const tail = dash[1]!.trim().replace(/\./g, "");
    const code =
      tail.length === 2 && STATE_CODES.has(tail.toUpperCase())
        ? tail.toUpperCase()
        : STATE_NAMES[norm(tail)];
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

type School = { id: string; name: string; state: string; unitid: string; tokens: string[] };
const schools: School[] = q(`
  select id, name, coalesce(state,''), coalesce(ipeds_unitid::text,'')
    from public.universities where retired_at is null`).map(([id, name, state, unitid]) => ({
  id: id!,
  name: name!,
  state: stateCode(state!),
  unitid: unitid!,
  tokens: tokens(name!),
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

/** Schools that already hold at least one program under a given governing body. */
const gbSchools = new Map<string, Set<string>>();
for (const p of leaguePrograms) {
  if (!gbSchools.has(p.gb)) gbSchools.set(p.gb, new Set());
  gbSchools.get(p.gb)!.add(p.schoolId);
}

/* ------------------------- federal directory (by ID) ---------------------- */

type FedRow = { unitid: string; name: string; alias: string; state: string; tokens: string[] };
const fedRows: FedRow[] = q(`
  select unitid::text, name, coalesce(alias,''), coalesce(state,'')
    from public.federal_directory`).map(([unitid, name, alias, state]) => ({
  unitid: unitid!,
  name: name!,
  alias: alias!,
  state: stateCode(state!),
  tokens: tokens(name!),
}));
const schoolByUnitid = new Map(schools.filter((s) => s.unitid).map((s) => [s.unitid, s]));

/* --------------------------------- match ---------------------------------- */

type Result = { school: School | null; how: string; candidates: School[] };
const cache = new Map<string, Result>();

function resolve(row: CsvRow): Result {
  const target = norm(row.name);
  const t = tokens(row.name);

  // Pool: schools already carrying this governing body, else the league's states.
  const gbPool = schools.filter((s) => gbSchools.get(row.gb)?.has(s.id));
  const stateFilter = (pool: School[], strict: boolean) => {
    if (row.state) return pool.filter((s) => s.state === row.state || !s.state);
    if (!strict) return pool; // governing body already carries the school
    const league = LEAGUE_STATES[row.gb] ?? [];
    return league.length ? pool.filter((s) => league.includes(s.state) || !s.state) : pool;
  };

  // 1. Federal ID: exact federal name or alias inside the league's states.
  const fedStates = row.state ? [row.state] : (LEAGUE_STATES[row.gb] ?? []);
  const fedPool = fedStates.length ? fedRows.filter((f) => fedStates.includes(f.state)) : fedRows;
  const fedIds = [
    ...new Set(
      fedPool
        .filter(
          (f) =>
            norm(f.name) === target ||
            f.alias.split("|").some((a) => a.trim() && norm(a) === target),
        )
        .map((f) => f.unitid),
    ),
  ];
  if (fedIds.length === 1) {
    const held = schoolByUnitid.get(fedIds[0]!);
    if (held && (!row.state || held.state === row.state || !held.state))
      return { school: held, how: `federal id ${fedIds[0]}`, candidates: [held] };
  }

  // 2. Exact stored name inside the governing-body + state pool.
  for (const [pool, label] of [
    [stateFilter(gbPool, false), "exact stored name, same governing body"],
    [stateFilter(schools, true), "exact stored name, league state"],
  ] as [School[], string][]) {
    const exact = pool.filter((s) => norm(s.name) === target);
    if (exact.length === 1) return { school: exact[0]!, how: label, candidates: exact };
    if (exact.length > 1) return { school: null, how: `ambiguous on exact name`, candidates: exact };
  }

  // 3. Token containment, governing-body pool first, then league states.
  const score = (pool: School[]) =>
    pool
      .map((s) => ({ s, score: containment(t, s.tokens) }))
      .filter((c) => c.score >= 0.8 && c.s.tokens.some((x) => t.includes(x)))
      .sort((a, b) => b.score - a.score || a.s.tokens.length - b.s.tokens.length);

  for (const [pool, label] of [
    [stateFilter(gbPool, false), "name match within same governing body"],
    [stateFilter(schools, true), "name match within league state"],
  ] as [School[], string][]) {
    const hits = score(pool);
    if (!hits.length) continue;
    const top = hits[0]!.score;
    const tied = hits.filter((c) => c.score === top);
    if (tied.length === 1)
      return { school: tied[0]!.s, how: `${label} ${top.toFixed(2)}`, candidates: [tied[0]!.s] };
    // A tie is only broken by holding the sport under this governing body.
    const league = tied.filter((c) =>
      programs.some((p) => p.schoolId === c.s.id && p.sport === row.sport && p.gb === row.gb),
    );
    if (league.length === 1)
      return {
        school: league[0]!.s,
        how: `${label}; tie broken by existing ${row.gb} ${row.sport} program`,
        candidates: [league[0]!.s],
      };
    return { school: null, how: "ambiguous name", candidates: tied.map((c) => c.s) };
  }
  return { school: null, how: "no candidate above threshold", candidates: [] };
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

const matched: unknown[][] = [
  ["school_on_file", "school_id", "federal_id", "state", "governing_body", "sport",
   "program_id", "current_offering_status", "league_says", "agrees", "proposed_offering_status",
   "proposed_source", "roster_url_on_file", "players_on_file", "matched_how"],
];
const notOnFile: unknown[][] = [
  ["listed_name", "governing_body", "sport", "state_hint", "why",
   "school_matched_but_no_program", "school_id", "federal_candidate_id", "federal_candidate_name",
   "federal_candidate_state", "held_on_file"],
];
const gap: unknown[][] = [
  ["school", "school_id", "federal_id", "state", "governing_body", "sport",
   "current_offering_status", "league_lists_school_for_other_sport", "roster_url_on_file",
   "players_on_file", "finding", "proposed_offering_status"],
];
const ambiguous: unknown[][] = [
  ["listed_name", "governing_body", "sport", "state_hint", "reason", "candidates"],
];

function federalCandidate(row: CsvRow) {
  const t = tokens(row.name);
  const states = row.state ? [row.state] : (LEAGUE_STATES[row.gb] ?? []);
  const pool = states.length ? fedRows.filter((f) => states.includes(f.state)) : fedRows;
  const hits = pool
    .map((f) => ({ f, score: containment(t, f.tokens) }))
    .filter((c) => c.score >= 0.85 && c.f.tokens.some((x) => t.includes(x)))
    .sort((a, b) => b.score - a.score || a.f.tokens.length - b.f.tokens.length);
  const top = hits[0];
  if (!top || (hits[1] && hits[1].score === top.score)) return null;
  return top.f;
}

const claimed = new Set<string>(); // program ids the league does list
const listedBySchool = new Map<string, Set<string>>(); // school id -> sports listed

for (const row of csvRows) {
  const { school } = bestSchool(row);
  if (!school) continue;
  if (!listedBySchool.has(school.id)) listedBySchool.set(school.id, new Set());
  listedBySchool.get(school.id)!.add(row.sport);
}

for (const row of csvRows) {
  const { school, how, candidates } = bestSchool(row);
  if (!school) {
    if (candidates.length > 1) {
      ambiguous.push([
        row.raw, row.gb, row.sport, row.state ?? "", how,
        candidates.map((c) => `${c.name} (${c.state})`).join(" | "),
      ]);
      continue;
    }
    const fed = federalCandidate(row);
    notOnFile.push([
      row.raw, row.gb, row.sport, row.state ?? "", how, "no", "",
      fed?.unitid ?? "", fed?.name ?? "", fed?.state ?? "",
      fed ? (schoolByUnitid.has(fed.unitid) ? "yes" : "no") : "",
    ]);
    continue;
  }
  const prog = programs.find((p) => p.schoolId === school.id && p.sport === row.sport);
  if (!prog) {
    notOnFile.push([
      row.raw, row.gb, row.sport, row.state ?? "", "school on file, sport slot missing",
      school.name, school.id, school.unitid || "", "", "", "yes",
    ]);
    continue;
  }
  claimed.add(prog.id);
  matched.push([
    school.name, school.id, school.unitid || "none", school.state, prog.gb || row.gb, row.sport,
    prog.id, prog.offering, "fields the sport",
    prog.offering === "offered" ? "yes" : prog.offering === "not_offered" ? "no — contradicts" : "unconfirmed on file",
    "offered", "league participation list",
    prog.roster ? "yes" : "no", prog.players, how,
  ]);
}

for (const p of leaguePrograms) {
  if (claimed.has(p.id)) continue;
  const s = schoolById.get(p.schoolId)!;
  const listed = listedBySchool.get(p.schoolId);
  const other = listed ? [...listed].filter((x) => x !== p.sport) : [];
  const finding = other.length
    ? `league lists this school for ${other.join("/")} but not ${p.sport}`
    : "school not on the league list for either sport — membership needs confirming";
  gap.push([
    s.name, s.id, s.unitid || "none", s.state, p.gb, p.sport, p.offering,
    other.join("/") || "no", p.roster ? "yes" : "no", p.players, finding,
    other.length ? "not_offered" : "hold — confirm membership first",
  ]);
}

/* -------------------------------- exports --------------------------------- */

write("league-a-matched.csv", matched);
write("league-b-not-on-file.csv", notOnFile);
write("league-c-gap.csv", gap);
write("league-d-ambiguous.csv", ambiguous);

const m = matched.slice(1) as string[][];
console.log("\n--- summary -------------------------------------------------");
for (const gb of ["NAIA", "CCCAA", "NWAC"]) {
  const rows = m.filter((r) => r[4] === gb);
  console.log(
    `${gb.padEnd(6)} matched ${String(rows.length).padStart(3)}  ` +
      `already offered ${rows.filter((r) => r[7] === "offered").length}  ` +
      `unverified/other ${rows.filter((r) => r[7] !== "offered" && r[7] !== "not_offered").length}  ` +
      `contradicts not_offered ${rows.filter((r) => r[7] === "not_offered").length}`,
  );
}
console.log(`A matched total                 ${m.length}`);
console.log(`B in league list, not on file    ${notOnFile.length - 1}`);
console.log(`C on file, league does not list   ${gap.length - 1}`);
console.log(`   -> proposed not_offered        ${(gap.slice(1) as string[][]).filter((r) => r[11] === "not_offered").length}`);
console.log(`D ambiguous (nothing assigned)    ${ambiguous.length - 1}`);

// Cross-check the user's known case.
const mm = m.filter((r) => String(r[0]).toLowerCase().includes("mount mary"));
const mmGap = (gap.slice(1) as string[][]).filter((r) => String(r[0]).toLowerCase().includes("mount mary"));
console.log("\nMount Mary cross-check:");
for (const r of mm) console.log(`  matched  ${r[5]} — stored ${r[7]}`);
for (const r of mmGap) console.log(`  gap      ${r[5]} — stored ${r[6]} — ${r[10]}`);
console.log("\nnothing written to the database");
