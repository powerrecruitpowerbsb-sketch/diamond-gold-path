/**
 * REPORT ONLY — judge the STORED roster and coaching addresses, database-wide.
 *
 * "Same address already on file" checks sameness, not correctness. This runs the
 * page-kind checks against the value on file for all 3,604 programs. It is an
 * address-level pass (no page is fetched here, so it is safe to run whole-database);
 * the content-level extraction check runs in the 20-school preview.
 *
 * Run: bun tmpscripts/stored-address-audit.ts
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { classifyStaffPage } from "@/lib/coach-extract";
import { hostOf, matchesProgramSport } from "@/lib/link-quality";
import { looksLikeIndividualBio, pathNamesOtherSport } from "@/lib/page-purpose";

const OUT = "/mnt/documents";

const rows = execFileSync(
  "psql",
  [
    "-At",
    "-F",
    "\t",
    "-c",
    `select p.id, u.name, coalesce(u.state,''), p.sport::text, coalesce(p.division,''),
            coalesce(p.governing_body::text,''), coalesce(p.athletic_website,''),
            coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,''),
            coalesce(p.head_coach_name,'')
     from programs p join universities u on u.id = p.university_id
     order by u.name, p.sport`,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .trim()
  .split("\n")
  .map((line) => line.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, out: unknown[][]) =>
  writeFileSync(`${OUT}/${name}`, out.map((r) => r.map(esc).join(",")).join("\n") + "\n");

/** Is this address the athletics front door rather than a team page? */
function athleticsIndex(url: string, athleticWebsite: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (!path || path === "/index" || /^\/(sports|athletics|teams)$/i.test(path)) return true;
    if (athleticWebsite && hostOf(url) === hostOf(athleticWebsite) && path.split("/").filter(Boolean).length < 1) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

type Failure = { code: string; reason: string };

function auditAddress(kind: "roster_page" | "coaching_staff_page", url: string, sport: string, athleticWebsite: string): Failure | null {
  if (!url) return { code: "empty", reason: "nothing on file" };
  const other = pathNamesOtherSport(url, sport);
  if (other) return { code: "other_sport", reason: `the address names ${other}, not ${sport}` };
  if (athleticsIndex(url, athleticWebsite)) {
    return { code: "athletics_index", reason: "the athletics front page, not a team page" };
  }
  if (kind === "coaching_staff_page") {
    if (looksLikeIndividualBio(url)) return { code: "individual_bio", reason: "one staff member's own page" };
    // A department-wide directory is a valid source: whether it names this
    // sport's staff is decided when the page is read, not from the address.
    if (classifyStaffPage({ url, sport }).kind === "department_directory") return null;
  }

  if (!matchesProgramSport(url, sport)) {
    return { code: "sport_not_named", reason: "the address does not tie the page to this sport" };
  }
  return null;
}

const detail: unknown[][] = [
  ["school", "state", "sport", "governing body", "division", "field", "stored address", "verdict", "why"],
];
const tally = new Map<string, number>();
const bump = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);

let rosterHeld = 0;
let staffHeld = 0;
let headCoaches = 0;

for (const row of rows) {
  const [, school, state, sport, division, body, site, roster, staff, headCoach] = row;
  if (headCoach) headCoaches += 1;

  for (const [field, kind, url] of [
    ["roster_url", "roster_page", roster!],
    ["coaching_staff_url", "coaching_staff_page", staff!],
  ] as const) {
    if (url) (field === "roster_url" ? (rosterHeld += 1) : (staffHeld += 1));
    const verdict = auditAddress(kind, url, sport!, site!);
    if (!verdict) continue;
    bump(`${field}:${verdict.code}`);
    detail.push([school, state, sport, body, division, field, url, verdict.code, verdict.reason]);
  }
}

write("stored-address-failures.csv", detail);
write("stored-address-summary.csv", [
  ["field", "failure", "programs"],
  ...[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => [key.split(":")[0], key.split(":")[1], n]),
]);

console.log(
  JSON.stringify(
    {
      programs: rows.length,
      rosterAddressesOnFile: rosterHeld,
      staffAddressesOnFile: staffHeld,
      programsWithHeadCoachName: headCoaches,
      failuresByKind: Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1])),
    },
    null,
    2,
  ),
);
