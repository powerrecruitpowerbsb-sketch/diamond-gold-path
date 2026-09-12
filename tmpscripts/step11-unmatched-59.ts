/**
 * REPORT ONLY — nothing is written.
 *
 * 1. Try to match every school with no federal institution ID against the
 *    federal directory (name + state, plus known former/campus names).
 *    Groups: matched / no-match / ambiguous.
 * 2. For no-match records, cost of retirement: programs, addresses, extracted
 *    rows, and whether a surviving institution is already on file.
 * 3. Three wrong-ID records: the fix, not applied.
 * 4. Joint athletics record (CMS) and schools whose website is a retail domain.
 *
 * Run: bun tmpscripts/step11-unmatched-59.ts
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { matchTokens, nameSimilarity, scoreCandidates, verdictFor } from "@/lib/federal-match";
import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";

const OUT = "/mnt/documents";
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
const write = (name: string, rows: unknown[][]) =>
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

/* ------------------------------- load ------------------------------- */

const STATE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
const code = (v: string) => {
  const f = (v ?? "").trim().toLowerCase().replace(/\./g, "");
  if (!f) return null;
  if (/^[a-z]{2}$/.test(f)) return f.toUpperCase();
  return STATE[f] ?? null;
};
const CANADIAN = new Set(["BC", "ON", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE"]);

type Fed = {
  unitid: number; name: string; alias: string | null; city: string | null; state: string | null;
  mainCampus: boolean | null; enrollment: number | null; website: string | null;
};
const federal: Fed[] = q(`
  select unitid, coalesce(name,''), coalesce(alias,''), coalesce(city,''), coalesce(state,''),
         coalesce(main_campus::text,''), coalesce(enrollment::text,''), coalesce(website,'')
  from federal_directory`).map((r) => ({
  unitid: Number(r[0]), name: r[1]!, alias: r[2] || null, city: r[3] || null, state: r[4] || null,
  mainCampus: r[5] === "" ? null : r[5] === "t" || r[5] === "true",
  enrollment: r[6] ? Number(r[6]) : null, website: r[7] || null,
}));
const fedByUnitid = new Map(federal.map((f) => [f.unitid, f]));

const heldUnitids = new Set(
  q(`select ipeds_unitid::text from universities where ipeds_unitid is not null`).map((r) => Number(r[0])),
);
const heldNameByUnitid = new Map(
  q(`select ipeds_unitid::text, name from universities where ipeds_unitid is not null`).map(
    (r) => [Number(r[0]), r[1]!] as const,
  ),
);

type School = { id: string; name: string; state: string; city: string; website: string };
const unmatched: School[] = q(`
  select id, coalesce(name,''), coalesce(state,''), coalesce(city,''), coalesce(website_url,'')
  from universities where ipeds_unitid is null order by name`).map((r) => ({
  id: r[0]!, name: r[1]!, state: r[2]!, city: r[3]!, website: r[4]!,
}));

const progRows = q(`
  select p.university_id, p.id, p.sport::text, coalesce(p.athletic_website,''),
         coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,''),
         (select count(*) from roster_players rp where rp.program_id = p.id),
         (select count(*) from roster_snapshots rs where rs.program_id = p.id),
         coalesce(p.head_coach_name,''),
         (select count(*) from recruiting_intelligence ri where ri.program_id = p.id)
  from programs p`);
type Prog = {
  universityId: string; id: string; sport: string; athletic: string; roster: string; staff: string;
  players: number; snapshots: number; headCoach: string; intel: number;
};
const programs: Prog[] = progRows.map((r) => ({
  universityId: r[0]!, id: r[1]!, sport: r[2]!, athletic: r[3]!, roster: r[4]!, staff: r[5]!,
  players: Number(r[6]), snapshots: Number(r[7]), headCoach: r[8]!, intel: Number(r[9]),
}));
const progsOf = (id: string) => programs.filter((p) => p.universityId === id);

/* ------------------- known former / campus names -------------------- */

/** Extra names to try for records whose stored name is not the federal one. */
const ALSO_TRY: Record<string, string[]> = {
  "Adirondack Community College": ["SUNY Adirondack"],
  "SUNY Niagara": ["Niagara County Community College"],
  "Cañada College": ["Canada College"],
  "CCBC-Catonsville": ["Community College of Baltimore County Catonsville"],
  "CCBC-Dundalk": ["Community College of Baltimore County Dundalk"],
  "Gateway Community College": ["GateWay Community College", "Maricopa GateWay Community College"],
  "Grayson County College": ["Grayson College"],
  "Hibbing Community College": ["Minnesota North College Hibbing", "Minnesota North College"],
  "Itasca Community College": ["Minnesota North College Itasca"],
  "Rainy River Community College": ["Minnesota North College Rainy River"],
  "Vermilion Community College": ["Minnesota North College Vermilion"],
  "Jamestown Community College": ["SUNY Jamestown Community College"],
  "McCook Community College": ["Mid-Plains Community College McCook", "Mid-Plains Community College"],
  "North Platte Community College": ["Mid-Plains Community College North Platte"],
  "Reid State Community College": ["Reid State Technical College"],
  "Northern Oklahoma College Enid": ["Northern Oklahoma College"],
  "Coastal Alabama Community College Brewton": ["Coastal Alabama Community College"],
  "Lock Haven University of Pennsylvania": ["Commonwealth University of Pennsylvania Lock Haven", "Lock Haven University"],
  "Mansfield University of Pennsylvania": ["Commonwealth University of Pennsylvania Mansfield", "Mansfield University"],
  "Pennsylvania Western University, California": ["Pennsylvania Western University California", "California University of Pennsylvania"],
  "Pennsylvania Western University, Edinboro": ["Pennsylvania Western University Edinboro", "Edinboro University of Pennsylvania"],
  "Vermont State University Lyndon": ["Vermont State University", "Northern Vermont University Lyndon"],
  "Vermont State University-Johnson": ["Vermont State University", "Northern Vermont University Johnson"],
  "Utah State University Eastern": ["Utah State University Eastern", "Utah State University"],
  "Texas A&M University–Victoria": ["Texas A&M University Victoria"],
  "California Polytechnic State University": ["California Polytechnic State University San Luis Obispo"],
  "Trinity University (Texas)": ["Trinity University"],
  "St. Joseph's University NY (Brooklyn)": ["St Joseph's University New York Brooklyn", "St. Joseph's College New York"],
  "University at Buffalo, the State University of New York": ["University at Buffalo"],
  "Benedictine University at Mesa": ["Benedictine University Mesa"],
  "Ottawa University Arizona": ["Ottawa University Surprise", "Ottawa University Arizona"],
  "Park University Gilbert": ["Park University Gilbert", "Park University"],
  "San Jacinto College-Central": ["San Jacinto Community College"],
  "Spokane Colleges": ["Spokane Community College", "Spokane Falls Community College"],
  "Gloucester County College": ["Rowan College of South Jersey Gloucester", "Rowan College at Gloucester County"],
  "Waycross College": ["South Georgia State College", "Waycross College"],
  "Clinton Community College (Iowa)": ["Clinton Community College", "Eastern Iowa Community College"],
  "Metropolitan Community College-Longview": ["Metropolitan Community College Kansas City"],
  "Metropolitan Community College-Penn Valley": ["Metropolitan Community College Kansas City"],
  "Gillette College": ["Gillette College", "Northern Wyoming Community College"],
  "University of Wisconsin–Whitewater at Rock County": ["University of Wisconsin Whitewater"],
  "Community Christian College": ["Community Christian College"],
  "Detroit Community Christian College": ["Detroit Community Christian College"],
  "Brown Mackie College": ["Brown Mackie College"],
  "ASA College": ["ASA College"],
};

/** What the record is, when nothing in the federal directory corresponds. */
const DISPOSITION: Record<string, { kind: string; survivor: string | null }> = {
  "Brookhaven College": { kind: "merged", survivor: "Dallas College" },
  "Cedar Valley College": { kind: "merged", survivor: "Dallas College" },
  "Mountain View College (Texas)": { kind: "merged", survivor: "Dallas College" },
  "North Lake College": { kind: "merged", survivor: "Dallas College" },
  "Richland College": { kind: "merged", survivor: "Dallas College" },
  "Brown Mackie College": { kind: "closed", survivor: null },
  "ASA College": { kind: "closed", survivor: null },
  "Batten University": { kind: "never existed / bad record", survivor: null },
  "Detroit Community Christian College": { kind: "closed or unaccredited", survivor: null },
  "Community Christian College": { kind: "unaccredited, not in federal directory", survivor: null },
  "Waycross College": { kind: "merged", survivor: "South Georgia State College" },
  "Gloucester County College": { kind: "renamed / merged", survivor: "Rowan College of South Jersey" },
  "Spokane Colleges": { kind: "district, not an institution", survivor: "Spokane Community College" },
  "Lock Haven University of Pennsylvania": { kind: "merged", survivor: "Commonwealth University of Pennsylvania" },
  "Mansfield University of Pennsylvania": { kind: "merged", survivor: "Commonwealth University of Pennsylvania" },
  "Hibbing Community College": { kind: "merged", survivor: "Minnesota North College" },
  "Itasca Community College": { kind: "merged", survivor: "Minnesota North College" },
  "Rainy River Community College": { kind: "merged", survivor: "Minnesota North College" },
  "Vermilion Community College": { kind: "merged", survivor: "Minnesota North College" },
  "McCook Community College": { kind: "merged", survivor: "Mid-Plains Community College" },
  "North Platte Community College": { kind: "merged", survivor: "Mid-Plains Community College" },
  "Douglas College": { kind: "Canadian, outside the federal directory", survivor: null },
  "Simon Fraser University": { kind: "Canadian, outside the federal directory", survivor: null },
  "Trinity Western University": { kind: "Canadian, outside the federal directory", survivor: null },
  "University of British Columbia": { kind: "Canadian, outside the federal directory", survivor: null },
  "Claremont McKenna-Harvey Mudd-Scripps Colleges": { kind: "joint athletics program, not an institution", survivor: "Claremont McKenna College" },
  "Pomona-Pitzer Colleges": { kind: "joint athletics program, not an institution", survivor: "Pomona College" },
};

/* ---------------------------- the matching --------------------------- */

type Row = {
  school: School;
  group: "matched" | "ambiguous" | "no_match" | "duplicate_of_record_on_file";
  best: { unitid: number; name: string; state: string | null; score: number } | null;
  runnerUp: { unitid: number; name: string; score: number } | null;
  evidence: string;
};

const results: Row[] = [];

for (const s of unmatched) {
  const st = code(s.state);
  const names = [s.name, ...(ALSO_TRY[s.name] ?? [])];

  // Candidate pool: any federal record sharing an identifying word, in-state.
  const pool = new Map<number, Fed>();
  for (const name of names) {
    const tokens = new Set(matchTokens(name));
    for (const f of federal) {
      if (st && f.state && f.state.toUpperCase() !== st) continue;
      const theirs = matchTokens(`${f.name} ${f.alias ?? ""}`);
      const shared = theirs.filter((t) => tokens.has(t)).length;
      if (shared >= 2 || (shared === 1 && tokens.size <= 2)) pool.set(f.unitid, f);
    }
  }
  const candidates = [...pool.values()].map((f) => ({
    unitid: f.unitid, name: f.name, alias: f.alias, city: f.city, state: f.state,
    mainCampus: f.mainCampus, enrollment: f.enrollment,
  }));

  // Score every name form we know for this school; keep the best outcome.
  let bestScored: ReturnType<typeof scoreCandidates> = [];
  let usedName = s.name;
  for (const name of names) {
    const scored = scoreCandidates(name, st, candidates, s.city || null);
    if ((scored[0]?.score ?? 0) > (bestScored[0]?.score ?? 0)) {
      bestScored = scored;
      usedName = name;
    }
  }
  const verdict = verdictFor(bestScored);
  const best = bestScored[0];
  const runnerUp = bestScored[1];
  const d = DISPOSITION[s.name];

  let group: Row["group"] = "no_match";
  let evidence = "";
  if (st && CANADIAN.has(st)) {
    evidence = "Canadian institution — the federal directory covers U.S. institutions only, so no ID can ever be assigned";
  } else if (verdict === "confirmed" && best) {
    group = "matched";
    evidence = [
      `name form used: "${usedName}"`,
      `federal name "${best.name}"`,
      `similarity ${nameSimilarity(usedName, best.name).toFixed(2)}`,
      st ? `state ${st} agrees` : "no stored state to check",
      best.city && s.city && best.city.toLowerCase() === s.city.toLowerCase() ? `city ${best.city} agrees` : "",
      runnerUp ? `clear of runner-up by ${(best.score - runnerUp.score).toFixed(2)}` : "only candidate in state",
    ].filter(Boolean).join("; ");
  } else if (verdict === "ambiguous" && !d) {
    group = "ambiguous";
    evidence = `${bestScored.filter((c) => c.score >= 0.5).length} plausible federal records; top two within ${(
      (best?.score ?? 0) - (runnerUp?.score ?? 0)
    ).toFixed(2)} of each other`;
  } else {
    evidence = d
      ? `${d.kind}${d.survivor ? `; survives as ${d.survivor}` : ""}`
      : `no federal record comes close; best candidate was ${best ? `${best.name} (${best.score.toFixed(2)})` : "nothing"}`;
  }

  results.push({
    school: s,
    group,
    best: best ? { unitid: best.unitid, name: best.name, state: best.state, score: best.score } : null,
    runnerUp: runnerUp ? { unitid: runnerUp.unitid, name: runnerUp.name, score: runnerUp.score } : null,
    evidence,
  });
}

/* ------- one federal institution is never paired to two records ------- */

/**
 * A confident match whose federal institution is already on file — or wanted by
 * a second unidentified record — is not an ID assignment. It means this record
 * is another campus/duplicate of an institution we already hold, which is a
 * record decision, not a matching one.
 */
const proposedCount = new Map<number, number>();
for (const r of results) if (r.group === "matched") proposedCount.set(r.best!.unitid, (proposedCount.get(r.best!.unitid) ?? 0) + 1);

type DupRow = { row: Row; heldBy: string | null; rivals: string[] };
const duplicates: DupRow[] = [];
for (const r of results) {
  if (r.group !== "matched") continue;
  const unitid = r.best!.unitid;
  const heldBy = heldUnitids.has(unitid) ? heldNameByUnitid.get(unitid) ?? "another record" : null;
  const rivals = results
    .filter((o) => o !== r && o.group === "matched" && o.best!.unitid === unitid)
    .map((o) => o.school.name);
  if (!heldBy && rivals.length === 0) continue;
  r.group = "duplicate_of_record_on_file";
  duplicates.push({ row: r, heldBy, rivals });
}

/* --------------------------- group exports --------------------------- */

const matched = results.filter((r) => r.group === "matched");
const ambiguous = results.filter((r) => r.group === "ambiguous");
const noMatch = results.filter((r) => r.group === "no_match");

write("step11-a-matched.csv", [
  ["record_id", "stored_name", "stored_state", "stored_city", "proposed_unitid", "federal_name", "federal_state", "federal_website", "score", "evidence", "programs"],
  ...matched.map((r) => [
    r.school.id, r.school.name, r.school.state, r.school.city, r.best!.unitid, r.best!.name,
    r.best!.state ?? "", fedByUnitid.get(r.best!.unitid)?.website ?? "", r.best!.score.toFixed(2),
    r.evidence, progsOf(r.school.id).length,
  ]),
]);

write("step11-c-ambiguous.csv", [
  ["record_id", "stored_name", "stored_state", "candidate_1_unitid", "candidate_1_name", "candidate_1_score", "candidate_1_already_held_by", "candidate_2_unitid", "candidate_2_name", "candidate_2_score", "why_it_stays_unidentified"],
  ...ambiguous.map((r) => [
    r.school.id, r.school.name, r.school.state,
    r.best?.unitid ?? "", r.best?.name ?? "", r.best?.score.toFixed(2) ?? "",
    r.best && heldUnitids.has(r.best.unitid) ? heldNameByUnitid.get(r.best.unitid) ?? "" : "",
    r.runnerUp?.unitid ?? "", r.runnerUp?.name ?? "", r.runnerUp?.score.toFixed(2) ?? "",
    r.evidence,
  ]),
]);

write("step11-d-duplicate-of-record-on-file.csv", [
  ["record_id", "stored_name", "stored_state", "federal_institution", "unitid", "already_held_by", "other_unidentified_records_wanting_it", "programs", "extracted_players", "note", "DECISION"],
  ...duplicates.map(({ row, heldBy, rivals }) => {
    const progs = progsOf(row.school.id);
    return [
      row.school.id, row.school.name, row.school.state, row.best!.name, row.best!.unitid,
      heldBy ?? "", rivals.join(" | "), progs.length, progs.reduce((n, p) => n + p.players, 0),
      "one federal institution, more than one record on our side — a record decision (keep one, retire or fold the rest), not an ID assignment",
      "",
    ];
  }),
]);

/* ------------------ group (b): what retirement costs ----------------- */

const survivorOnFile = (survivor: string | null) => {
  if (!survivor) return "";
  const hits = [...heldNameByUnitid.entries()].filter(([, name]) => nameSimilarity(survivor, name) >= 0.85);
  return hits.length ? hits.map(([unitid, name]) => `${name} [${unitid}]`).join(" | ") : "no record on file";
};

write("step11-b-retire.csv", [
  [
    "record_id", "stored_name", "stored_state", "why_no_match", "surviving_institution",
    "survivor_already_on_file", "programs", "sports", "athletics_addresses", "roster_addresses",
    "coach_addresses", "extracted_players", "roster_snapshots", "head_coaches_stored",
    "intel_rows", "website_url", "DECISION",
  ],
  ...noMatch.map((r) => {
    const progs = progsOf(r.school.id);
    const d = DISPOSITION[r.school.name];
    return [
      r.school.id, r.school.name, r.school.state,
      d?.kind ?? "no current federal institution corresponds", d?.survivor ?? "",
      survivorOnFile(d?.survivor ?? null),
      progs.length, progs.map((p) => p.sport).join(" | "),
      progs.filter((p) => p.athletic).length, progs.filter((p) => p.roster).length,
      progs.filter((p) => p.staff).length,
      progs.reduce((n, p) => n + p.players, 0), progs.reduce((n, p) => n + p.snapshots, 0),
      progs.filter((p) => p.headCoach).length, progs.reduce((n, p) => n + p.intel, 0),
      r.school.website, "",
    ];
  }),
]);

/* ---------------------- 3. the three wrong IDs ---------------------- */

const wrongIdRows = q(`
  select u.id, u.name, coalesce(u.state,''), u.ipeds_unitid::text, coalesce(f.name,''), coalesce(f.state,''),
         coalesce(f.website,''), (select count(*) from programs p where p.university_id=u.id)
  from universities u left join federal_directory f on f.unitid = u.ipeds_unitid
  where u.ipeds_unitid in (196088, 137476, 178697)
     or u.name in ('Buffalo State, State University of New York','St. Thomas University','College of the Ozarks')`);

const CORRECT: Record<string, { unitid: number; why: string }> = {
  "Buffalo State, State University of New York": { unitid: 196130, why: "Buffalo State is SUNY Buffalo State University (196130); 196088 is University at Buffalo, a different institution — and our unidentified 'University at Buffalo' record is the one that should hold 196088" },
  "St. Thomas University": { unitid: 174914, why: "every stored address belongs to University of St. Thomas, Minnesota (174914); 137476 is St. Thomas University, Florida" },
  "College of the Ozarks": { unitid: 107558, why: "stored state Arkansas and the stored addresses are University of the Ozarks (107558, AR); 178697 is College of the Ozarks, Missouri" },
};

write("step11-wrong-federal-id.csv", [
  ["record_id", "stored_name", "stored_state", "currently_holds_unitid", "that_unitid_is", "that_unitid_state", "proposed_unitid", "proposed_federal_name", "proposed_federal_state", "proposed_federal_website", "already_held_by", "programs", "why", "FIX_NOT_APPLIED"],
  ...wrongIdRows.map((r) => {
    const fix = CORRECT[r[1]!];
    const target = fix ? fedByUnitid.get(fix.unitid) : undefined;
    return [
      r[0], r[1], r[2], r[3], r[4], r[5], fix?.unitid ?? "", target?.name ?? "(not in federal_directory)",
      target?.state ?? "", target?.website ?? "",
      fix && heldUnitids.has(fix.unitid) ? heldNameByUnitid.get(fix.unitid) ?? "" : "nobody",
      r[7], fix?.why ?? "", "reassign ipeds_unitid, then re-verify every address against the new federal record",
    ];
  }),
]);

/* -------------------- 4a. the joint athletics records ---------------- */

const jointMembers = q(`
  select id, name, coalesce(ipeds_unitid::text,''), coalesce(state,''),
         (select count(*) from programs p where p.university_id = universities.id)
  from universities
  where name ilike any (array['%claremont mckenna%','%harvey mudd%','%scripps%','%pomona%','%pitzer%'])
  order by name`);

write("step11-joint-athletics.csv", [
  ["record_id", "name", "ipeds_unitid", "state", "programs", "note"],
  ...jointMembers.map((r) => [
    r[0], r[1], r[2], r[3], r[4],
    r[2] ? "member institution on file with its own federal ID" : "joint athletics record, no federal institution behind it",
  ]),
]);

/* ------------------ 4b. retail / apparel website scan ---------------- */

const RETAIL = [
  "bsnsports.com", "sideline.bsnsports.com", "squadlocker.com", "prepsportswear.com",
  "shopify.com", "myshopify.com", "bigcartel.com", "etsy.com", "amazon.com", "ebay.com",
  "spiritshop.com", "1stplacespiritwear.com", "teamsportsplanet.com", "rokkitwear.com",
  "customink.com", "bsnteamsports.com", "shopbsnsports.com", "nike.com", "adidas.com",
  "underarmour.com", "champssports.com", "dickssportinggoods.com", "fanatics.com",
  "bkstr.com", "follett.com", "efollett.com", "barnesandnoble.com", "bncollege.com",
  "shopcollege.com", "printful.com", "teespring.com", "spreadshirt.com", "zazzle.com",
];
const retailHit = (url: string) => {
  const host = hostOf(url);
  if (!host) return null;
  const hit = RETAIL.find((d) => host === d || host.endsWith(`.${d}`));
  if (hit) return hit;
  if (/(^|\.)(shop|store|spiritwear|apparel|merch)\./.test(host)) return registrableDomain(host);
  return null;
};

const allAddresses = q(`
  select u.id, u.name, coalesce(u.state,''), 'website_url', u.website_url from universities u where coalesce(u.website_url,'') <> ''
  union all select u.id, u.name, coalesce(u.state,''), 'athletic_website', p.athletic_website from programs p join universities u on u.id=p.university_id where coalesce(p.athletic_website,'') <> ''
  union all select u.id, u.name, coalesce(u.state,''), 'roster_url', p.roster_url from programs p join universities u on u.id=p.university_id where coalesce(p.roster_url,'') <> ''
  union all select u.id, u.name, coalesce(u.state,''), 'coaching_staff_url', p.coaching_staff_url from programs p join universities u on u.id=p.university_id where coalesce(p.coaching_staff_url,'') <> ''`);

const retailRows = allAddresses
  .map((r) => ({ id: r[0]!, name: r[1]!, state: r[2]!, field: r[3]!, url: r[4]!, hit: retailHit(r[4]!) }))
  .filter((r) => r.hit);

write("step11-retail-domains.csv", [
  ["record_id", "school", "state", "field", "stored_value", "retail_domain"],
  ...retailRows.map((r) => [r.id, r.name, r.state, r.field, r.url, r.hit]),
]);

console.log(JSON.stringify({
  unmatchedRecords: unmatched.length,
  matched: matched.length,
  duplicateOfRecordOnFile: duplicates.length,
  ambiguous: ambiguous.length,
  noMatch: noMatch.length,
  retire: {
    programs: noMatch.reduce((n, r) => n + progsOf(r.school.id).length, 0),
    players: noMatch.reduce((n, r) => n + progsOf(r.school.id).reduce((m, p) => m + p.players, 0), 0),
    addresses: noMatch.reduce((n, r) => n + progsOf(r.school.id).filter((p) => p.athletic).length
      + progsOf(r.school.id).filter((p) => p.roster).length + progsOf(r.school.id).filter((p) => p.staff).length, 0),
  },
  retailAddresses: retailRows.length,
  matchedList: matched.map((r) => `${r.school.name} -> ${r.best!.unitid} ${r.best!.name}`),
  ambiguousList: ambiguous.map((r) => r.school.name),
  noMatchList: noMatch.map((r) => `${r.school.name} — ${r.evidence}`),
  duplicateList: duplicates.map((d) => `${d.row.school.name} -> ${d.row.best!.unitid} ${d.row.best!.name}${d.heldBy ? ` (held by ${d.heldBy})` : ` (also wanted by ${d.rivals.join(", ")})`}`),
}, null, 2));
