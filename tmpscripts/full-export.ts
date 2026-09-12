/**
 * ONE row per program, every program, database only — no crawling.
 *
 * Everything is read out of the database with psql, then derived here: domain
 * ownership, quarantine, provenance and squad overlap are all comparisons across
 * rows, so they belong in one pass rather than in five separate queries.
 *
 *   bun tmpscripts/full-export.ts
 *
 * Writes /mnt/documents/database-export.csv and database-export-summary.csv.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const q = (sql: string): string[][] => {
  const out = execFileSync("psql", ["-At", "-F", "\u0001", "-c", sql], { maxBuffer: 1024 * 1024 * 512 }).toString();
  return out
    .split("\n")
    .filter((line) => line.length)
    .map((line) => line.split("\u0001"));
};

/** Host of a URL, lowercased, without www. */
const host = (url: string | null): string => {
  if (!url) return "";
  const match = url.trim().toLowerCase().match(/^(?:https?:\/\/)?([^/?#]+)/);
  if (!match) return "";
  return match[1]!.replace(/^www\./, "").replace(/:\d+$/, "");
};

/** Registrable domain — "goheels.com" from "static.goheels.com". Handles co.uk-style tails. */
const domain = (url: string | null): string => {
  const h = host(url);
  if (!h || /^[\d.]+$/.test(h)) return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const tail2 = parts.slice(-2).join(".");
  if (/^(co|ac|org|gov|edu|net|com)\.[a-z]{2}$/.test(tail2)) return parts.slice(-3).join(".");
  return tail2;
};

console.log("reading…");

const programs = q(`
  select p.id, u.id, coalesce(u.name,''), coalesce(u.state,''), coalesce(u.ipeds_unitid::text,''),
         u.identity_basis::text, coalesce(p.governing_body::text,''), coalesce(p.division,''),
         p.division_verification::text, coalesce(p.conference,''), p.conference_verification::text,
         p.offering_status::text, coalesce(p.offering_source,''), p.sport::text,
         coalesce(p.athletic_website,''), coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,''),
         coalesce(p.head_coach_name,''), coalesce(p.recruiting_coordinator_name,''),
         coalesce(u.website_url,''), coalesce(f.website,''),
         coalesce(u.avg_sat::text,''), coalesce(u.avg_act::text,''), coalesce(u.avg_gpa::text,''),
         coalesce(u.tuition_in_state::text,''), coalesce(u.tuition_out_state::text,''),
         coalesce(u.est_cost_of_attendance::text,''), coalesce(u.est_net_price::text,''),
         coalesce((select count(*) from university_majors m where m.university_id = u.id)::text,'0'),
         coalesce(u.retired_at::text,'')
  from programs p
  join universities u on u.id = p.university_id
  left join federal_directory f on f.unitid = u.ipeds_unitid
  order by u.name, p.sport
`);

const health = new Map<string, string>();
for (const [programId, field, state] of q(`select program_id, field, link_status::text from link_health`)) {
  health.set(`${programId}|${field}`, state!);
}

const quarantined = new Set(
  q(`select host from host_protection where lifted_at is null`).map(([h]) => h!.toLowerCase().replace(/^www\./, "")),
);

type RosterAgg = { players: number; domains: Set<string>; extracted: string; provenance: Set<string> };
const roster = new Map<string, RosterAgg>();
for (const [programId, count, domains, extracted, provenance] of q(`
  select program_id, count(*)::text,
         coalesce(string_agg(distinct coalesce(source_domain,''), ','),''),
         coalesce(max(extracted_at)::text,''),
         string_agg(distinct provenance, ',')
  from roster_players group by program_id
`)) {
  roster.set(programId!, {
    players: Number(count),
    domains: new Set(domains!.split(",").filter(Boolean)),
    extracted: extracted!,
    provenance: new Set(provenance!.split(",").filter(Boolean)),
  });
}

// Squad names, for the duplicate-squad check.
const squads = new Map<string, Set<string>>();
for (const [programId, name] of q(`select program_id, lower(trim(name)) from roster_players`)) {
  if (!squads.has(programId!)) squads.set(programId!, new Set());
  squads.get(programId!)!.add(name!);
}

// Which schools hold each athletics domain, from every link we store.
const holders = new Map<string, Set<string>>();
const claim = (url: string, universityId: string) => {
  const d = domain(url);
  if (!d) return;
  if (!holders.has(d)) holders.set(d, new Set());
  holders.get(d)!.add(universityId);
};
for (const [universityId, a, r, c] of q(`
  select p.university_id, coalesce(p.athletic_website,''), coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,'')
  from programs p
`)) {
  for (const url of [a, r, c]) if (url) claim(url, universityId!);
}

// Squad overlap: two programs sharing more than 60% of player names.
console.log("comparing squads…");
const index = new Map<string, string[]>();
for (const [programId, names] of squads) {
  for (const name of names) {
    if (!index.has(name)) index.set(name, []);
    index.get(name)!.push(programId);
  }
}
const shared = new Map<string, Map<string, number>>();
for (const list of index.values()) {
  if (list.length < 2 || list.length > 40) continue;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const [a, b] = [list[i]!, list[j]!];
      if (!shared.has(a)) shared.set(a, new Map());
      shared.get(a)!.set(b, (shared.get(a)!.get(b) ?? 0) + 1);
      if (!shared.has(b)) shared.set(b, new Map());
      shared.get(b)!.set(a, (shared.get(b)!.get(a) ?? 0) + 1);
    }
  }
}
const duplicateSquad = new Set<string>();
for (const [a, partners] of shared) {
  const sizeA = squads.get(a)!.size;
  for (const [b, count] of partners) {
    const smaller = Math.min(sizeA, squads.get(b)!.size);
    if (smaller >= 5 && count / smaller > 0.6) {
      duplicateSquad.add(a);
      duplicateSquad.add(b);
    }
  }
}

const HEADER = [
  "school","state","federal_id","identity_basis","governing_body","division","division_verified","conference",
  "conference_verified","sport","offering_status","offering_source","retired",
  "athletic_website","athletic_website_verification","athletic_website_matches_school_domain",
  "athletic_website_held_by_other_school","athletic_website_host_quarantined",
  "roster_url","roster_url_verification","roster_url_matches_school_domain","roster_url_held_by_other_school",
  "roster_url_host_quarantined",
  "coaching_staff_url","coaching_staff_url_verification","coaching_staff_url_matches_school_domain",
  "coaching_staff_url_held_by_other_school","coaching_staff_url_host_quarantined",
  "players_on_file","player_source_domain","players_extracted_at","provenance_traceable",
  "squad_duplicates_another_program","coaches_on_file","head_coach_name",
  "website_url","website_matches_federal","majors_count","has_cost_data","has_test_scores",
];

const csv = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const rows: string[][] = [];

type Bucket = {
  programs: number; usableRoster: number; headCoach: number; allThree: number; quarantined: number; noAddress: number;
};
const buckets = new Map<string, Bucket>();
const bucket = (key: string) => {
  if (!buckets.has(key)) {
    buckets.set(key, { programs: 0, usableRoster: 0, headCoach: 0, allThree: 0, quarantined: 0, noAddress: 0 });
  }
  return buckets.get(key)!;
};

for (const r of programs) {
  const [programId, universityId, school, state, federalId, identity, body, division, divisionV, conference,
    conferenceV, offering, offeringSource, sport, athletic, rosterUrl, staffUrl, headCoach, coordinator,
    website, federalWebsite, sat, act, gpa, tuitionIn, tuitionOut, coa, netPrice, majors, retired] = r as string[];

  const schoolDomains = new Set(
    [website, federalWebsite].map(domain).filter(Boolean),
  );
  const linkCells = (field: string, url: string) => {
    const d = domain(url);
    const others = url ? [...(holders.get(d) ?? new Set())].filter((id) => id !== universityId) : [];
    return [
      url,
      url ? health.get(`${programId}|${field}`) ?? "unverified" : "",
      url ? (schoolDomains.has(d) ? "yes" : schoolDomains.size ? "no" : "unknown") : "",
      url ? (others.length ? "yes" : "no") : "",
      url ? (quarantined.has(host(url)) || quarantined.has(d) ? "yes" : "no") : "",
    ];
  };

  const agg = roster.get(programId!);
  const players = agg?.players ?? 0;
  const traceable = !agg ? "unknown" : agg.provenance.has("traced") ? "yes" : agg.provenance.has("unknown") ? "unknown" : "no";
  const coaches = [headCoach, coordinator].filter((v) => v && v.trim()).length;
  const usable = players >= 8 && !duplicateSquad.has(programId!);
  const anyQuarantined = [athletic, rosterUrl, staffUrl].some(
    (url) => url && (quarantined.has(host(url)) || quarantined.has(domain(url))),
  );

  rows.push([
    school!, state!, federalId!, identity!, body!, division!, divisionV === "verified" ? "yes" : "no", conference!,
    conferenceV === "verified" ? "yes" : "no", sport!, offering!, offeringSource!, retired ? "yes" : "no",
    ...linkCells("athletic_website", athletic!),
    ...linkCells("roster_url", rosterUrl!),
    ...linkCells("coaching_staff_url", staffUrl!),
    String(players), [...(agg?.domains ?? [])].join(" "), agg?.extracted ?? "", traceable,
    duplicateSquad.has(programId!) ? "yes" : "no", String(coaches), headCoach!,
    website!, website ? (domain(website) === domain(federalWebsite) ? "yes" : federalWebsite ? "no" : "unknown") : "",
    majors!,
    [tuitionIn, tuitionOut, coa, netPrice].some(Boolean) ? "yes" : "no",
    [sat, act, gpa].some(Boolean) ? "yes" : "no",
  ]);

  const b = bucket(body || "(none)");
  b.programs += 1;
  if (usable) b.usableRoster += 1;
  if (headCoach && headCoach.trim()) b.headCoach += 1;
  if (athletic && rosterUrl && staffUrl) b.allThree += 1;
  if (anyQuarantined) b.quarantined += 1;
  if (!athletic && !rosterUrl && !staffUrl) b.noAddress += 1;
}

writeFileSync(
  "/mnt/documents/database-export.csv",
  [HEADER.join(","), ...rows.map((row) => row.map((cell) => csv(cell ?? "")).join(","))].join("\n") + "\n",
);

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "");
const summary = [
  ["governing_body","programs","usable_roster","usable_roster_pct","head_coach","head_coach_pct","all_three_links","quarantined_host","no_address_at_all"].join(","),
  ...[...buckets.entries()]
    .sort((a, b) => b[1].programs - a[1].programs)
    .map(([key, b]) =>
      [key, b.programs, b.usableRoster, pct(b.usableRoster, b.programs), b.headCoach, pct(b.headCoach, b.programs),
        b.allThree, b.quarantined, b.noAddress].join(","),
    ),
];
const all = [...buckets.values()].reduce(
  (t, b) => ({
    programs: t.programs + b.programs, usableRoster: t.usableRoster + b.usableRoster, headCoach: t.headCoach + b.headCoach,
    allThree: t.allThree + b.allThree, quarantined: t.quarantined + b.quarantined, noAddress: t.noAddress + b.noAddress,
  }),
  { programs: 0, usableRoster: 0, headCoach: 0, allThree: 0, quarantined: 0, noAddress: 0 },
);
summary.push(
  ["ALL", all.programs, all.usableRoster, pct(all.usableRoster, all.programs), all.headCoach,
    pct(all.headCoach, all.programs), all.allThree, all.quarantined, all.noAddress].join(","),
);
writeFileSync("/mnt/documents/database-export-summary.csv", summary.join("\n") + "\n");

console.log(`rows ${rows.length}`);
console.log(summary.join("\n"));
