/**
 * REPORT ONLY — complete inventory of every field held at school level.
 *
 * Reads the live column list (so nothing is a hand-picked selection), counts
 * how many of the 1,885 school records carry a value, and joins what the code
 * actually does to fill each field. Writes nothing.
 *
 * Run: bun tmpscripts/inventory-schools.ts
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "/mnt/documents";

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) =>
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

/**
 * What each school-level field holds and where the value actually comes from.
 * "federal" names the IPEDS survey component the value is published in.
 */
const FIELDS: Record<string, { holds: string; source: string; refresh: string }> = {
  // identity
  name: { holds: "school name", source: "federal/IPEDS Institutional Characteristics (HD 2023) on match, otherwise seed import or manual", refresh: "one-time at import; federal name not overwritten" },
  city: { holds: "city", source: "federal/IPEDS HD 2023 (directory)", refresh: "automated federal sync" },
  state: { holds: "two-letter state", source: "federal/IPEDS HD 2023 (directory)", refresh: "automated federal sync" },
  address: { holds: "street address", source: "manual", refresh: "one-time" },
  region: { holds: "recruiting region label", source: "derived from state in app code", refresh: "derived on write" },
  website_url: { holds: "school's own website", source: "federal/IPEDS HD 2023 (WEBADDR), else scrape", refresh: "automated federal sync" },
  admissions_url: { holds: "admissions page", source: "scrape", refresh: "one-time" },
  financial_aid_url: { holds: "financial aid page", source: "scrape", refresh: "one-time" },
  tuition_source_url: { holds: "page a cost figure came from", source: "scrape", refresh: "one-time" },
  ipeds_unitid: { holds: "federal institution ID", source: "federal match", refresh: "automated federal sync" },
  federal_match_status: { holds: "how identity was resolved", source: "federal match", refresh: "automated federal sync" },
  federal_match_name: { holds: "federal legal name matched", source: "federal/IPEDS HD 2023", refresh: "automated federal sync" },
  federal_synced_at: { holds: "last federal sync time", source: "federal sync bookkeeping", refresh: "automated" },
  facts_refresh_due_at: { holds: "when school facts are next due", source: "scheduler bookkeeping", refresh: "automated" },
  // campus / size
  campus_setting: { holds: "urban/suburban/rural", source: "scrape (IPEDS publishes degree of urbanization, LOCALE, HD 2023 — not imported)", refresh: "one-time" },
  undergrad_enrollment: { holds: "undergraduate headcount", source: "federal/IPEDS Fall Enrollment (EF 2023) where synced, otherwise scrape", refresh: "partly automated" },
  school_size_bucket: { holds: "small/medium/large", source: "derived from enrollment", refresh: "derived on write" },
  public_private: { holds: "control of institution", source: "federal/IPEDS HD 2023 (CONTROL) where synced, otherwise scrape", refresh: "partly automated" },
  religious_affiliation: { holds: "religious school flag", source: "scrape (IPEDS HD 2023 RELAFFIL publishes this — not imported)", refresh: "one-time" },
  religious_tradition: { holds: "denomination", source: "scrape (IPEDS HD 2023 RELAFFIL — not imported)", refresh: "one-time" },
  nearest_airport: { holds: "nearest airport", source: "manual", refresh: "one-time" },
  distance_to_airport_miles: { holds: "miles to airport", source: "manual", refresh: "one-time" },
  // academics
  avg_gpa: { holds: "average admitted GPA", source: "scrape (not published by IPEDS)", refresh: "one-time" },
  avg_sat: { holds: "average SAT", source: "scrape (IPEDS Admissions ADM 2023 publishes SAT percentiles — not imported)", refresh: "one-time" },
  avg_act: { holds: "average ACT", source: "scrape (IPEDS ADM 2023 — not imported)", refresh: "one-time" },
  acceptance_rate: { holds: "admit rate", source: "scrape (IPEDS ADM 2023 admissions/applicants — not imported)", refresh: "one-time" },
  test_optional: { holds: "test-optional flag", source: "scrape (IPEDS ADM 2023 test policy — not imported)", refresh: "one-time" },
  graduation_rate: { holds: "graduation rate", source: "scrape (IPEDS Graduation Rates GR 2023 — not imported)", refresh: "one-time" },
  student_faculty_ratio: { holds: "student:faculty ratio", source: "scrape (derivable from IPEDS EF + HR 2023 — not imported)", refresh: "one-time" },
  // cost
  tuition_in_state: { holds: "in-state tuition", source: "scrape (IPEDS Institutional Characteristics IC 2023 — not imported)", refresh: "one-time" },
  tuition_out_state: { holds: "out-of-state tuition", source: "scrape (IPEDS IC 2023 — not imported)", refresh: "one-time" },
  room_board: { holds: "room and board", source: "scrape (IPEDS IC 2023 — not imported)", refresh: "one-time" },
  est_cost_of_attendance: { holds: "total cost estimate", source: "scrape (IPEDS IC 2023 — not imported)", refresh: "one-time" },
  est_net_price: { holds: "average net price", source: "scrape (IPEDS Student Financial Aid SFA 2023 — not imported)", refresh: "one-time" },
  created_at: { holds: "record created", source: "bookkeeping", refresh: "n/a" },
  updated_at: { holds: "record last written", source: "bookkeeping", refresh: "automated" },
  id: { holds: "internal record ID", source: "bookkeeping", refresh: "n/a" },
};

const PROGRAM_SCHOOL_FIELDS: Record<string, { holds: string; source: string; refresh: string }> = {
  governing_body: { holds: "NCAA/NAIA/NJCAA/CCCAA/NWAC", source: "governing-body feed (NCAA member list) and seed import", refresh: "one-time" },
  division: { holds: "D1/D2/D3/NAIA etc.", source: "governing-body feed and scrape", refresh: "one-time" },
  conference: { holds: "conference", source: "scrape", refresh: "one-time" },
  athletic_website: { holds: "athletics site", source: "identity-bound discovery", refresh: "on demand" },
  roster_url: { holds: "team roster page", source: "identity-bound discovery", refresh: "on demand" },
  coaching_staff_url: { holds: "team staff page", source: "identity-bound discovery", refresh: "on demand" },
  facility_url: { holds: "facility page", source: "scrape", refresh: "one-time" },
  head_coach_name: { holds: "head coach", source: "athletics staff page read", refresh: "on demand" },
  recruiting_coordinator_name: { holds: "recruiting coordinator", source: "athletics staff page read", refresh: "on demand" },
  scholarships_available: { holds: "scholarship flag", source: "scrape/manual", refresh: "one-time" },
  scholarship_details: { holds: "scholarship notes", source: "manual", refresh: "one-time" },
};

const columns = (table: string) =>
  q(
    `select column_name from information_schema.columns where table_schema='public' and table_name='${table}' order by ordinal_position`,
  ).map((r) => r[0]!);

const total = Number(q("select count(*) from universities")[0]![0]);

const inventory: unknown[][] = [
  ["level", "field", "what it holds", "where it comes from", "filled", "of", "% filled", "provenance rows", "last touched", "refresh"],
];

const provenance = new Map(
  q(
    "select field_name, count(*), max(coalesce(last_verified_at, created_at))::date from data_field_sources group by 1",
  ).map((r) => [r[0]!, { rows: r[1], last: r[2] }]),
);

for (const column of columns("universities")) {
  const meta = FIELDS[column] ?? { holds: "unknown", source: "unknown", refresh: "unknown" };
  const filled = Number(
    q(`select count(*) from universities where ${column} is not null and ${column}::text <> ''`)[0]![0],
  );
  const p = provenance.get(column);
  inventory.push([
    "school",
    column,
    meta.holds,
    meta.source,
    filled,
    total,
    `${((filled / total) * 100).toFixed(1)}%`,
    p?.rows ?? 0,
    p?.last ?? "",
    meta.refresh,
  ]);
}

for (const [column, meta] of Object.entries(PROGRAM_SCHOOL_FIELDS)) {
  const filled = Number(
    q(
      `select count(distinct university_id) from programs where ${column} is not null and ${column}::text <> ''`,
    )[0]![0],
  );
  const p = provenance.get(column);
  inventory.push([
    "program (per school)",
    column,
    meta.holds,
    meta.source,
    filled,
    total,
    `${((filled / total) * 100).toFixed(1)}%`,
    p?.rows ?? 0,
    p?.last ?? "",
    meta.refresh,
  ]);
}

write("inventory-school-fields.csv", inventory);

// Fields we scrape or infer that the federal directory already publishes.
const federalInstead: unknown[][] = [
  ["field", "we get it by", "federal source that publishes it", "why federal is better"],
  ["campus_setting", "scrape/AI", "IPEDS HD 2023 LOCALE (degree of urbanization)", "single national definition, no page reading"],
  ["undergrad_enrollment", "scrape/AI for many rows", "IPEDS EF 2023 fall enrollment", "one number per year, audited"],
  ["public_private", "scrape/AI for many rows", "IPEDS HD 2023 CONTROL", "definitive"],
  ["religious_affiliation", "scrape/AI", "IPEDS HD 2023 RELAFFIL", "coded list, no guessing denomination"],
  ["religious_tradition", "scrape/AI", "IPEDS HD 2023 RELAFFIL", "coded list"],
  ["avg_sat", "scrape/AI", "IPEDS ADM 2023 SAT 25th/75th percentiles", "reported by the school federally"],
  ["avg_act", "scrape/AI", "IPEDS ADM 2023 ACT percentiles", "reported federally"],
  ["acceptance_rate", "scrape/AI", "IPEDS ADM 2023 applicants/admissions", "computable exactly"],
  ["test_optional", "scrape/AI", "IPEDS ADM 2023 test score policy", "coded field"],
  ["graduation_rate", "scrape/AI", "IPEDS GR 2023 / Outcome Measures", "standard cohort definition"],
  ["student_faculty_ratio", "scrape/AI", "IPEDS EF 2023 + HR 2023", "derivable, consistent"],
  ["tuition_in_state", "scrape/AI", "IPEDS IC 2023 tuition and fees", "published per year"],
  ["tuition_out_state", "scrape/AI", "IPEDS IC 2023", "published per year"],
  ["room_board", "scrape/AI", "IPEDS IC 2023 room and board", "published per year"],
  ["est_cost_of_attendance", "scrape/AI", "IPEDS IC 2023 total price of attendance", "published per year and per living arrangement"],
  ["est_net_price", "scrape/AI", "IPEDS SFA 2023 average net price", "published by income band too"],
  ["city", "already federal", "IPEDS HD 2023", "already sourced federally"],
  ["state", "already federal", "IPEDS HD 2023", "already sourced federally"],
  ["website_url", "already federal", "IPEDS HD 2023 WEBADDR", "already sourced federally"],
];
write("inventory-federal-instead-of-scrape.csv", federalInstead);

// Everything the federal directory publishes that we do not import at all.
const notImported: unknown[][] = [
  ["IPEDS survey component", "field group not imported", "recruiting value"],
  ["Institutional Characteristics — directory (HD)", "OPEID, sector, ICLEVEL, HBCU, tribal, land-grant, Carnegie classification, locale, county, congressional district, latitude/longitude, phone, admissions office URL, financial aid URL, net price calculator URL, veterans/athletic association fields (including NCAA/NAIA membership flag)", "level and association flags, campus setting, precise location for travel distance, and official aid/admissions links"],
  ["Institutional Characteristics (IC)", "tuition and required fees by level, room and board, books and supplies, total price of attendance by living arrangement, calendar system, credit for prior learning, ROTC, study abroad, distance education, on-campus housing capacity, meal plans", "full cost picture and whether a school can house an athlete"],
  ["Institutional Characteristics — Academic Year (IC-AY)", "published charges over four prior years", "cost trend"],
  ["Admissions (ADM)", "applicants/admits/enrolled by sex, open admission policy, test score submission policy, SAT/ACT 25th-75th percentiles by section, admission consideration factors", "academic fit banding"],
  ["Student Financial Aid (SFA)", "average net price by income band, grant/loan participation and amounts, athletic aid recipients and total athletic aid awarded (SFA athletic aid section)", "athletic aid is directly relevant to scholarship expectations"],
  ["Fall Enrollment (EF)", "total and undergraduate enrollment by level, race/ethnicity, sex, age, full/part-time, first-time cohort size, residence of first-time students, retention rate, student-to-faculty ratio", "size, retention, and how far students travel to attend"],
  ["12-Month Enrollment (E12)", "unduplicated headcount, instructional activity", "true annual size for two-year schools"],
  ["Completions (C)", "degrees conferred by CIP code, award level, sex, race", "which majors actually graduate students — better than our scraped majors list"],
  ["Graduation Rates (GR) and GR200", "150%/200% completion rates by cohort, including athletic aid recipient cohorts (GR — student athletes receiving aid)", "graduation outcomes for athletes specifically"],
  ["Outcome Measures (OM)", "eight-year award/enrollment outcomes for all four entering cohorts including transfers and part-timers", "the only fair outcome measure for JUCO transfers"],
  ["Human Resources (HR)", "staff counts by occupation, instructional staff FTE, salaries", "student-faculty ratio input"],
  ["Finance (F)", "revenues, expenses, endowment per FTE, scholarships and fellowships expense", "institutional stability and aid capacity"],
  ["Academic Libraries (AL)", "collections, expenses, services", "low recruiting value"],
  ["Student Financial Aid — Military (SFA/MIL)", "veterans benefits and Post-9/11 GI Bill", "niche"],
];
write("inventory-federal-not-imported.csv", notImported);

const manualOnly: unknown[][] = [
  ["field", "why there is no reliable source"],
  ["avg_gpa", "not published federally; schools state it inconsistently or not at all"],
  ["nearest_airport", "not published anywhere; needs a geo lookup or manual entry"],
  ["distance_to_airport_miles", "same — derivable from IPEDS latitude/longitude once imported"],
  ["address", "IPEDS publishes street address; not imported today, so manual"],
  ["region", "our own recruiting label, derived from state"],
  ["scholarship_details", "narrative, only ever manual"],
  ["conference", "no federal source; governing-body sites are the only source and only NCAA is machine-readable"],
  ["division", "same — NCAA feed covers NCAA only; NAIA, NJCAA, CCCAA, NWAC are manual or scraped"],
  ["facility_url", "athletics site only"],
];
write("inventory-manual-only.csv", manualOnly);

// Federal coverage by level.
const coverage = q(`
  select coalesce(p.governing_body::text, 'none recorded') as body,
         coalesce(p.division, '(none)') as division,
         count(distinct u.id) filter (where u.ipeds_unitid is not null) as with_id,
         count(distinct u.id) filter (where u.ipeds_unitid is null) as without_id
  from universities u
  left join programs p on p.university_id = u.id
  group by 1,2 order by 1,2
`);
write("inventory-federal-coverage-by-level.csv", [
  ["governing body", "division", "schools with a federal record", "schools with none"],
  ...coverage,
]);

const missing = q(`
  select u.name, coalesce(u.state,''), coalesce(u.federal_match_status,''),
         coalesce(string_agg(distinct p.governing_body::text, '/'), 'none'),
         coalesce(string_agg(distinct coalesce(p.division,''), '/'), ''),
         coalesce(min(p.athletic_website), '')
  from universities u left join programs p on p.university_id = u.id
  where u.ipeds_unitid is null
  group by 1,2,3 order by 2,1
`);
write("inventory-no-federal-record.csv", [
  ["school", "state", "match status", "governing body", "division", "athletics site"],
  ...missing,
]);

console.log(
  JSON.stringify(
    {
      schools: total,
      schoolFieldsInventoried: inventory.length - 1,
      schoolsWithoutFederalRecord: missing.length,
    },
    null,
    2,
  ),
);
