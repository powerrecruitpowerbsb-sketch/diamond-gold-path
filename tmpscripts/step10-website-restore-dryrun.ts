/**
 * Report only. Nothing is written.
 *
 * The school's own website field was overwritten with athletics domains. The
 * federal record holds the correct institutional site. This works out exactly
 * which schools would be restored, keeps the athletics domain where it belongs,
 * and separates the schools holding a domain that is not theirs at all.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";

function readCsv(path: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = readFileSync(path, "utf8");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const dom = (url: string) => (url ? registrableDomain(hostOf(url)) || "" : "");

const schools = readCsv("/tmp/u.csv").slice(1).map((r) => ({
  id: r[0]!, name: r[1]!, state: r[2]!, unitid: r[3]!, stored: r[4]!, federal: r[5]!,
}));
const programs = readCsv("/tmp/p.csv").slice(1).map((r) => ({
  id: r[0]!, universityId: r[1]!, sport: r[2]!, athletic: r[3]!, roster: r[4]!, staff: r[5]!,
}));

const byUniversity = new Map<string, typeof programs>();
for (const p of programs) {
  const list = byUniversity.get(p.universityId) ?? [];
  list.push(p);
  byUniversity.set(p.universityId, list);
}

type Row = typeof schools[number] & {
  storedDomain: string;
  federalDomain: string;
  storedIsEdu: boolean;
  athleticsFields: string[];
  matchesOwnAthletics: boolean;
};

const mismatched: Row[] = [];
for (const s of schools) {
  if (!s.stored || !s.federal) continue;
  const storedDomain = dom(s.stored);
  const federalDomain = dom(s.federal);
  if (!storedDomain || !federalDomain || storedDomain === federalDomain) continue;

  const fields: string[] = [];
  for (const p of byUniversity.get(s.id) ?? []) {
    for (const [field, url] of [["athletic_website", p.athletic], ["roster_url", p.roster], ["coaching_staff_url", p.staff]] as const) {
      if (url && dom(url) === storedDomain) fields.push(`${p.sport} ${field}=${url}`);
    }
  }
  mismatched.push({
    ...s,
    storedDomain,
    federalDomain,
    storedIsEdu: /\.edu$/i.test(storedDomain),
    athleticsFields: fields,
    matchesOwnAthletics: fields.length > 0,
  });
}

// Restore set: stored value is not a .edu on the school's own domain.
const restore = mismatched.filter((r) => !(r.storedIsEdu && r.storedDomain === r.federalDomain));
const eduElsewhere = restore.filter((r) => r.storedIsEdu);
const keepAthletics = restore.filter((r) => r.matchesOwnAthletics);
const notTheirs = restore.filter((r) => !r.matchesOwnAthletics);

console.log("schools compared:", schools.length);
console.log("domain mismatches:", mismatched.length);
console.log("would restore website_url from the federal record:", restore.length);
console.log("  of those, stored domain is one of the school's own athletics links (athletics field keeps it):", keepAthletics.length);
console.log("  of those, stored domain is NOT any of this school's links:", notTheirs.length);
console.log("  of those, stored value is a .edu on some other domain:", eduElsewhere.length);
console.log("\n20 sample restorations:");
for (const r of restore.slice(0, 20)) {
  console.log(
    `${r.name} (${r.state}, ${r.unitid}): ${r.stored || "(none)"} -> ${r.federal}` +
      (r.matchesOwnAthletics ? `  [athletics keeps ${r.storedDomain}]` : "  [domain is not this school's]"),
  );
}

const head = [
  "school", "state", "institution_id", "stored_website", "federal_website_to_restore",
  "stored_domain", "federal_domain", "stored_is_edu", "stored_matches_an_athletics_link",
  "athletics_fields_holding_stored_domain",
];
writeFileSync(
  "/mnt/documents/step10-website-restore-dryrun.csv",
  [head.join(","), ...restore.map((r) => [
    r.name, r.state, r.unitid, r.stored, r.federal, r.storedDomain, r.federalDomain,
    r.storedIsEdu ? "yes" : "no", r.matchesOwnAthletics ? "yes" : "no", r.athleticsFields.join(" | "),
  ].map(csv).join(","))].join("\n") + "\n",
);

/* ---- The wrong-school records: every field anywhere holding that domain ---- */
const holderRows: string[][] = [];
for (const r of notTheirs) {
  const others = schools.filter((s) => s.id !== r.id);
  const rowsFor = (schoolId: string, schoolName: string, relation: string) => {
    const school = schools.find((s) => s.id === schoolId)!;
    if (dom(school.stored) === r.storedDomain) {
      holderRows.push([r.name, r.state, r.unitid, r.storedDomain, r.federal, relation, schoolName, "universities.website_url", school.stored, ""]);
    }
    for (const p of byUniversity.get(schoolId) ?? []) {
      for (const [field, url] of [["athletic_website", p.athletic], ["roster_url", p.roster], ["coaching_staff_url", p.staff]] as const) {
        if (url && dom(url) === r.storedDomain) {
          holderRows.push([r.name, r.state, r.unitid, r.storedDomain, r.federal, relation, schoolName, `programs.${field}`, url, p.sport]);
        }
      }
    }
  };
  rowsFor(r.id, r.name, "this school");
  for (const other of others) {
    const holdsIt =
      dom(other.stored) === r.storedDomain ||
      (byUniversity.get(other.id) ?? []).some((p) =>
        [p.athletic, p.roster, p.staff].some((u) => u && dom(u) === r.storedDomain),
      );
    if (holdsIt) rowsFor(other.id, other.name, "other school holding the same domain");
  }
}
writeFileSync(
  "/mnt/documents/step10-wrong-school-domains.csv",
  [
    [
      "affected_school", "state", "institution_id", "wrong_domain", "federal_website_to_restore",
      "relation", "holder_school", "field", "value", "sport",
    ].join(","),
    ...holderRows.map((r) => r.map(csv).join(",")),
  ].join("\n") + "\n",
);
console.log(`\nwrong-school schools: ${notTheirs.length}; field rows exported: ${holderRows.length}`);
