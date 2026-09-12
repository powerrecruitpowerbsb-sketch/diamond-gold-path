/**
 * Whole-database duplicate-squad sweep.
 *
 *   bun tmpscripts/roster-overlap-sweep.ts
 *
 * REPORT ONLY. Compares every program's extracted squad against every other
 * program's and reports pairs sharing more than 60% of player names — the
 * signal that actually caught Mount Mary, Carolina University and the two
 * St. Thomas records. Federal domain ownership is NOT used: athletics sites
 * are .com and appear in no federal record, so that check finds nothing.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

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

type Meta = {
  school: string; schoolId: string; state: string; fed: string; sport: string;
  rosterUrl: string; ownSite: string;
};

const rows = q(`
  select rp.program_id, u.name, u.id, coalesce(u.state,''), coalesce(u.ipeds_unitid::text,''),
         p.sport::text, coalesce(p.roster_url,''), coalesce(u.website_url,''), rp.name
    from public.roster_players rp
    join public.programs p on p.id = rp.program_id
    join public.universities u on u.id = p.university_id`);

const names = new Map<string, Set<string>>();
const meta = new Map<string, Meta>();
for (const [pid, school, sid, state, fed, sport, rurl, own, player] of rows) {
  const norm = player!.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) continue;
  if (!names.has(pid!)) names.set(pid!, new Set());
  names.get(pid!)!.add(norm);
  meta.set(pid!, { school: school!, schoolId: sid!, state: state!, fed: fed!, sport: sport!, rosterUrl: rurl!, ownSite: own! });
}

const ids = [...names.keys()];
console.log(`programs with extracted players: ${ids.length}`);

/* invert to candidate pairs via shared names, so we skip the full O(n^2) walk */
const byName = new Map<string, string[]>();
for (const id of ids) for (const n of names.get(id)!) {
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n)!.push(id);
}
const shared = new Map<string, number>();
for (const list of byName.values()) {
  if (list.length < 2 || list.length > 60) continue;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = list[i]! < list[j]! ? `${list[i]}|${list[j]}` : `${list[j]}|${list[i]}`;
    shared.set(k, (shared.get(k) ?? 0) + 1);
  }
}

const out: unknown[][] = [];
for (const [k, count] of shared) {
  const [a, b] = k.split("|") as [string, string];
  const sa = names.get(a)!, sb = names.get(b)!;
  if (sa.size < 5 || sb.size < 5) continue;
  const ma = meta.get(a)!, mb = meta.get(b)!;
  if (ma.schoolId === mb.schoolId) continue;
  const overlap = count / Math.min(sa.size, sb.size);
  if (overlap <= 0.6) continue;
  out.push([
    ma.school, ma.state, ma.fed || "none", ma.sport, a, sa.size, ma.rosterUrl,
    mb.school, mb.state, mb.fed || "none", mb.sport, b, sb.size, mb.rosterUrl,
    count, `${Math.round(overlap * 100)}%`,
    ma.sport === mb.sport ? "same sport" : "different sport",
  ]);
}
out.sort((x, y) => String(x[0]).localeCompare(String(y[0])));

write("roster-overlap-sweep.csv", [
  ["school_a", "state_a", "federal_id_a", "sport_a", "program_a", "players_a", "roster_url_a",
   "school_b", "state_b", "federal_id_b", "sport_b", "program_b", "players_b", "roster_url_b",
   "shared_names", "overlap_of_smaller", "sport_match"],
  ...out,
]);

const progs = new Set(out.flatMap((r) => [r[4], r[11]]));
const schools = new Set(out.flatMap((r) => [r[0], r[7]]));
console.log(JSON.stringify({
  pairsOver60: out.length,
  programsInvolved: progs.size,
  schoolsInvolved: schools.size,
  sameSportPairs: out.filter((r) => r[16] === "same sport").length,
}, null, 2));
console.log("nothing written to the database");
