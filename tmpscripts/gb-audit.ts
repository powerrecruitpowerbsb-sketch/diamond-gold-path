/**
 * Report-only audit of programs.governing_body, plus an NCAA cross-check by
 * domain (never by name — name matching is the defect we are auditing).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { hostOf } from "../src/lib/link-quality";
import { registrableDomain } from "../src/lib/program-ownership";

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

const rows = q(`select u.id, u.name, coalesce(u.state,''), coalesce(u.ipeds_unitid::text,''),
 coalesce(u.website_url,''), p.id, p.sport, coalesce(p.governing_body::text,''),
 coalesce(p.division,''), coalesce(p.conference,''), coalesce(p.athletic_website,''),
 coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,'')
 from universities u join programs p on p.university_id=u.id`);

const dom = (v: string) => (v ? registrableDomain(hostOf(v)) || "" : "");

type School = {
  id: string; name: string; state: string; unitid: string; domains: Set<string>;
  bodies: Set<string>; divisions: Set<string>; conferences: Set<string>; sports: string[];
};
const schools = new Map<string, School>();
for (const r of rows) {
  const [uid, name, state, unitid, web, , sport, body, div, conf, aw, ru, cu] = r as string[];
  let s = schools.get(uid!);
  if (!s) {
    s = { id: uid!, name: name!, state: state!, unitid: unitid!, domains: new Set(), bodies: new Set(), divisions: new Set(), conferences: new Set(), sports: [] };
    schools.set(uid!, s);
  }
  for (const v of [web, aw, ru, cu]) { const d = dom(v!); if (d) s.domains.add(d); }
  if (body) s.bodies.add(body);
  if (div) s.divisions.add(div);
  if (conf) s.conferences.add(conf);
  s.sports.push(sport!);
}

const ncaa = JSON.parse(readFileSync("/tmp/gb/ncaa.json", "utf8")) as any[];
const byDomain = new Map<string, any>();
for (const m of ncaa) {
  if (String(m.deactive) === "Y") continue;
  for (const v of [m.webSiteUrl, m.athleticWebUrl]) {
    const d = dom(v ? `https://${String(v).replace(/^https?:\/\//, "")}` : "");
    if (d && !byDomain.has(d)) byDomain.set(d, m);
  }
}

const roman = (d: number) => (d === 1 ? "I" : d === 2 ? "II" : "III");
const normDiv = (v: string) => v.toUpperCase().replace(/[^0-9I]/g, "").replace(/^1$/, "I").replace(/^2$/, "II").replace(/^3$/, "III");

const out: string[][] = [[
  "record_id", "school", "state", "ipeds_unitid", "our_bodies", "our_divisions", "our_conferences",
  "matched_ncaa_member", "match_domain", "ncaa_division", "ncaa_conference", "verdict",
]];
let confirmed = 0, divMismatch = 0, unmatched = 0, notNcaaButListed = 0;
const ncaaSchools = [...schools.values()].filter((s) => s.bodies.has("NCAA"));
for (const s of ncaaSchools) {
  let hit: any = null, hitDomain = "";
  for (const d of s.domains) { const m = byDomain.get(d); if (m) { hit = m; hitDomain = d; break; } }
  let verdict: string;
  if (!hit) { verdict = "no domain match in NCAA list — membership unverified"; unmatched++; }
  else {
    const ours = [...s.divisions].map(normDiv).filter(Boolean);
    const theirs = roman(Number(hit.division));
    if (ours.length && !ours.includes(theirs)) { verdict = `division disagrees (we say ${[...s.divisions].join("/")}, NCAA says D${theirs})`; divMismatch++; }
    else { verdict = "confirmed NCAA member by domain"; confirmed++; }
  }
  out.push([s.id, s.name, s.state, s.unitid, [...s.bodies].join("|"), [...s.divisions].join("|"), [...s.conferences].join("|"),
    hit?.nameOfficial ?? "", hitDomain, hit ? `D${roman(Number(hit.division))}` : "", (hit?.conferenceName ?? "").trim(), verdict]);
}

// Schools we do NOT mark NCAA but which the NCAA list claims by domain.
const other: string[][] = [["record_id", "school", "state", "our_bodies", "match_domain", "ncaa_member", "ncaa_division", "ncaa_conference"]];
for (const s of schools.values()) {
  if (s.bodies.has("NCAA")) continue;
  for (const d of s.domains) {
    const m = byDomain.get(d);
    if (m) { other.push([s.id, s.name, s.state, [...s.bodies].join("|"), d, m.nameOfficial, `D${roman(Number(m.division))}`, (m.conferenceName ?? "").trim()]); notNcaaButListed++; break; }
  }
}

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => { const v = String(c ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
writeFileSync("/mnt/documents/gb-ncaa-crosscheck.csv", csv(out));
writeFileSync("/mnt/documents/gb-ncaa-claims-we-dont-hold.csv", csv(other));

console.log(JSON.stringify({
  schools: schools.size, programs: rows.length,
  ncaaListMembers: ncaa.length, ncaaListDomains: byDomain.size,
  ourNcaaSchools: ncaaSchools.length, confirmed, divMismatch, unmatched, notNcaaButListed,
}, null, 2));
