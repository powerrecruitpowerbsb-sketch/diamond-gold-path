/**
 * REPORT ONLY — nothing is written.
 *
 * Reads the NJCAA division list supplied by the user and compares it to every
 * program marked NJCAA on file.
 *
 * Groups:
 *  A. matched      — CSV row lines up with an NJCAA program on file; division to set
 *  B. no-program   — school on file, but no program of that sport (NJCAA lists one)
 *  C. no-school    — CSV school not on file at all
 *  D. gap          — NJCAA program on file that the NJCAA does not list for that
 *                    sport: does the school field the sport at all, or is the
 *                    governing body wrong?
 *
 * Run: bun tmpscripts/njcaa-divisions-report.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";

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

/* --------------------------- name normalisation --------------------------- */

const STOP = new Set([
  "the", "of", "at", "and", "college", "colleges", "community", "university",
  "technical", "tech", "institute", "junior", "school", "campus", "area",
  "district", "cc", "jc",
]);

const FULL_STATE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY",
};

/** Abbreviations the NJCAA lists that no federal or local record uses. */
const EXPAND: [RegExp, string][] = [
  [/^USC\s+/i, "University of South Carolina "],
  [/^UofSC\s+/i, "University of South Carolina "],
  [/^WVU\s+/i, "West Virginia University "],
  [/^RCSJ\b/i, "Rowan College of South Jersey"],
  [/^ASU\s+/i, "Arkansas State University "],
];

function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(name: string): string[] {
  return norm(name).split(" ").filter((t) => t && !STOP.has(t));
}
/** How much of the shorter token list is contained in the longer one. */
function containment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const setLong = new Set(long);
  return short.filter((t) => setLong.has(t)).length / short.length;
}

/**
 * Splits an NJCAA list name into a comparable name plus any state it encodes,
 * e.g. "Butler Community College-KS", "Highland Community College - Illinois",
 * "Southwestern Community College (IA)", "Triton College0".
 */
function cleanName(raw: string): { name: string; state: string | null } {
  let name = raw.trim().replace(/(\D)0$/, "$1");
  let state: string | null = null;

  const paren = /\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    const inner = paren[1]!.trim();
    const code = inner.length === 2 ? inner.toUpperCase() : FULL_STATE[inner.toLowerCase()];
    if (code) {
      state = code;
      name = name.replace(paren[0], "").trim();
    }
  }
  const dash = /[-–]\s*([A-Za-z .]+)$/.exec(name);
  if (dash) {
    const tail = dash[1]!.trim();
    const code = tail.length === 2 ? tail.toUpperCase() : FULL_STATE[tail.toLowerCase()];
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

type School = {
  id: string;
  name: string;
  state: string;
  unitid: string;
  website: string;
  tokens: string[];
};
const schools: School[] = q(`
  select id, name, coalesce(state,''), coalesce(ipeds_unitid::text,''), coalesce(website_url,'')
    from public.universities where retired_at is null`).map(([id, name, state, unitid, website]) => ({
  id: id!,
  name: name!,
  state: state!,
  unitid: unitid!,
  website: website!,
  tokens: tokens(name!),
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
  staff: string;
  players: number;
  coach: string;
};
const programs: Program[] = q(`
  select p.id, p.university_id, p.sport::text, coalesce(p.governing_body::text,''),
         coalesce(p.division,''), coalesce(p.conference,''), p.offering_status::text,
         coalesce(p.athletic_website,''), coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,''),
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
  staff: r[9]!,
  players: Number(r[10] ?? 0),
  coach: r[11]!,
}));

const schoolById = new Map(schools.map((s) => [s.id, s]));
const njcaaPrograms = programs.filter((p) => p.gb === "NJCAA");
console.log(`on file: ${njcaaPrograms.length} NJCAA programs across ${new Set(njcaaPrograms.map((p) => p.schoolId)).size} schools`);

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

/* --------------------------------- match ---------------------------------- */

function bestSchool(row: CsvRow): { school: School | null; how: string } {
  const t = tokens(row.name);
  const pool = row.state ? schools.filter((s) => s.state === row.state) : schools;
  const exact = pool.filter((s) => norm(s.name) === norm(row.name));
  if (exact.length === 1) return { school: exact[0]!, how: "exact name" };
  if (exact.length > 1) return { school: null, how: `ambiguous: ${exact.length} exact-name records` };

  const scored = pool
    .map((s) => ({ s, score: overlap(t, s.tokens) }))
    .filter((c) => c.score >= 0.7)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { school: null, how: "no candidate above threshold" };
  if (scored.length > 1 && scored[1]!.score === scored[0]!.score)
    return { school: null, how: `ambiguous: tie between ${scored[0]!.s.name} and ${scored[1]!.s.name}` };
  return { school: scored[0]!.s, how: `token overlap ${scored[0]!.score.toFixed(2)}` };
}

const matched: unknown[][] = [
  ["school_on_file", "school_id", "federal_id", "state", "sport", "csv_division", "stored_division", "change", "program_id", "matched_how"],
];
const noProgram: unknown[][] = [["csv_school", "matched_school_on_file", "school_id", "state", "sport", "csv_division", "matched_how"]];
const noSchool: unknown[][] = [["csv_school", "state_hint", "sport", "csv_division", "reason"]];

const claimed = new Set<string>(); // program ids the NJCAA does list

for (const row of csvRows) {
  const { school, how } = bestSchool(row);
  if (!school) {
    noSchool.push([row.name, row.state ?? "", row.sport, row.division, how]);
    continue;
  }
  const prog = programs.find((p) => p.schoolId === school.id && p.sport === row.sport);
  if (!prog) {
    noProgram.push([row.name, school.name, school.id, school.state, row.sport, row.division, how]);
    continue;
  }
  claimed.add(prog.id);
  matched.push([
    school.name, school.id, school.unitid || "none", school.state, row.sport,
    row.division, prog.division || "empty",
    prog.division === row.division ? "no change" : prog.division ? "correction" : "fill empty",
    prog.id, how,
  ]);
}

/* ---------------------------- D. the gap group ---------------------------- */

const gap: unknown[][] = [
  ["school", "school_id", "federal_id", "state", "sport", "stored_division", "stored_conference",
   "offering_status", "school_listed_by_njcaa_for_other_sport", "has_athletics_link", "has_roster_link",
   "players_on_file", "head_coach_on_file", "domain_is_ncaa_member", "finding", "recommended_action"],
];

const csvSchoolIds = new Map<string, Set<string>>(); // school id -> sports the NJCAA lists
for (const row of csvRows) {
  const { school } = bestSchool(row);
  if (!school) continue;
  if (!csvSchoolIds.has(school.id)) csvSchoolIds.set(school.id, new Set());
  csvSchoolIds.get(school.id)!.add(row.sport);
}

const counts = { fieldsOther: 0, notListedAtAll: 0, gbSuspect: 0 };

for (const p of njcaaPrograms) {
  if (claimed.has(p.id)) continue;
  const s = schoolById.get(p.schoolId)!;
  const listedSports = csvSchoolIds.get(p.schoolId);
  const listedOther = listedSports ? [...listedSports].filter((x) => x !== p.sport) : [];
  const dom = registrableDomain(p.athletic || s.website);
  const ncaaMember = dom ? ncaaDomains.has(dom) : false;

  let finding: string;
  let action: string;
  if (listedOther.length) {
    finding = `school is an NJCAA member (listed for ${listedOther.join("/")}) but does not field ${p.sport}`;
    action = "offering_status = not_offered";
    counts.fieldsOther += 1;
  } else if (ncaaMember) {
    finding = "school not on the NJCAA list at all and its domain appears on the NCAA member list";
    action = "governing body likely wrong — verify against NCAA before any division is set";
    counts.gbSuspect += 1;
  } else {
    finding = "school not on the NJCAA list for either sport";
    action = "verify membership; if it fields no NJCAA team, offering_status = not_offered";
    counts.notListedAtAll += 1;
  }

  gap.push([
    s.name, s.id, s.unitid || "none", s.state, p.sport, p.division || "empty", p.conference || "empty",
    p.offering, listedOther.join("/") || "no", p.athletic ? "yes" : "no", p.roster ? "yes" : "no",
    p.players, p.coach ? "yes" : "no", ncaaMember ? "yes" : "no", finding, action,
  ]);
}

/* -------------------------------- exports --------------------------------- */

write("njcaa-a-matched.csv", matched);
write("njcaa-b-no-program-on-file.csv", noProgram);
write("njcaa-c-school-not-on-file.csv", noSchool);
write("njcaa-d-gap.csv", gap);

const changes = matched.slice(1) as string[][];
console.log("\n--- summary -------------------------------------------------");
console.log(`A matched            ${changes.length}`);
console.log(`   fill empty        ${changes.filter((r) => r[7] === "fill empty").length}`);
console.log(`   correction        ${changes.filter((r) => r[7] === "correction").length}`);
console.log(`   no change         ${changes.filter((r) => r[7] === "no change").length}`);
console.log(`B school on file, no program of that sport   ${noProgram.length - 1}`);
console.log(`C CSV school not on file                     ${noSchool.length - 1}`);
console.log(`D gap: NJCAA programs the NJCAA does not list ${gap.length - 1}`);
console.log(`   fields the other sport only (not_offered)  ${counts.fieldsOther}`);
console.log(`   not listed either sport                    ${counts.notListedAtAll}`);
console.log(`   governing body suspect (NCAA domain)       ${counts.gbSuspect}`);
console.log("nothing written to the database");
