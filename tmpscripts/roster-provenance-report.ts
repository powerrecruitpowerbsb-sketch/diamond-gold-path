/**
 * Where does every stored roster actually come from?
 *
 *   bun tmpscripts/roster-provenance-report.ts
 *
 * REPORT ONLY. Uses the new provenance columns: for each program holding
 * extracted players, does the page those players came from sit on a domain
 * this school legitimately holds, a domain no one else claims, or a domain
 * another school holds? The last group is the real wrong-school count.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { pageOwnership, registrableDomain, resolveSharedDomain } from "@/lib/program-ownership";

const OUT = "/mnt/documents";
const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
    .trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};
const dom = (url: string) => registrableDomain(String(url ?? "").trim().toLowerCase()
  .replace(/^[a-z]+:\/\//, "").split("/")[0]!.replace(/^www\./, ""));

/* -------------------------- schools and their domains --------------------- */

type School = { id: string; name: string; state: string; website: string; domains: Set<string> };
const schools = new Map<string, School>();
for (const [id, name, state, site] of q(`
  select id, name, coalesce(state,''), coalesce(website_url,'') from public.universities`)) {
  const s: School = { id: id!, name: name!, state: state!, website: site!, domains: new Set() };
  const d = dom(site!);
  if (d) s.domains.add(d);
  schools.set(id!, s);
}

const claims = new Map<string, Set<string>>(); // domain -> school ids
const addClaim = (d: string, schoolId: string) => {
  if (!d) return;
  if (!claims.has(d)) claims.set(d, new Set());
  claims.get(d)!.add(schoolId);
  schools.get(schoolId)?.domains.add(d);
};
for (const [sid, aw, ru, cu] of q(`
  select university_id, coalesce(athletic_website,''), coalesce(roster_url,''), coalesce(coaching_staff_url,'')
    from public.programs`)) {
  for (const u of [aw!, ru!, cu!]) addClaim(dom(u), sid!);
}
for (const s of schools.values()) if (dom(s.website)) addClaim(dom(s.website), s.id);

/* ----------------------------- stored rosters ----------------------------- */

const rows = q(`
  select p.id, u.id, u.name, coalesce(u.state,''), p.sport::text,
         coalesce(max(rp.source_url),''), coalesce(max(rp.source_domain),''),
         max(rp.provenance), count(*)
    from public.roster_players rp
    join public.programs p on p.id = rp.program_id
    join public.universities u on u.id = p.university_id
   group by 1,2,3,4,5`);

const out: unknown[][] = [];
const tally = { total: 0, ownDomain: 0, unclaimed: 0, strongestClaim: 0, otherSchool: 0, unknownProvenance: 0 };
let playersOnOtherSchoolDomains = 0;

for (const [pid, sid, name, state, sport, srcUrl, srcDom, prov, count] of rows) {
  tally.total++;
  const players = Number(count);
  const school = schools.get(sid!)!;
  if (!srcDom) {
    tally.unknownProvenance++;
    out.push([name, state, sport, pid, players, "", "", prov ?? "unknown",
      "unknown provenance", "no source page on file — nothing can verify these rows", ""]);
    continue;
  }
  const holders = [...(claims.get(srcDom) ?? new Set<string>())];
  const others = holders.filter((h) => h !== school.id);
  if (dom(school.website) === srcDom || (holders.includes(school.id) && !others.length)) {
    tally.ownDomain++;
    continue;
  }
  if (!others.length) { tally.unclaimed++; continue; }

  const contenders = [school.id, ...others].map((h) => {
    const s = schools.get(h)!;
    return { schoolId: h, name: s.name, verdict: pageOwnership({ url: srcUrl!, schoolName: s.name, schoolWebsite: s.website }) };
  });
  const { winner } = resolveSharedDomain(contenders);
  if (winner && winner.schoolId === school.id) { tally.strongestClaim++; continue; }
  tally.otherSchool++;
  playersOnOtherSchoolDomains += players;
  out.push([
    name, state, sport, pid, players, srcUrl, srcDom, prov ?? "unknown",
    "source domain belongs to another school",
    winner ? `${winner.name} has the stronger claim (${winner.verdict.reason})` : "another school holds this domain",
    others.map((h) => schools.get(h)!.name).join(" | "),
  ]);
}

write("roster-provenance-wrong-school.csv", [
  ["school", "state", "sport", "program_id", "players_on_file", "source_url", "source_domain",
   "provenance", "verdict", "detail", "other_claimants"],
  ...out,
]);

console.log(JSON.stringify({
  ...tally,
  playersOnOtherSchoolDomains,
}, null, 2));
console.log("report only — nothing written to the database");
