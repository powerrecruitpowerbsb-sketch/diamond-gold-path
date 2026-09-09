/**
 * Read-only data-quality diagnostic. Writes CSVs to /mnt/documents/diagnostic/.
 * Runs SELECTs only — no writes anywhere.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "/mnt/documents/diagnostic";
mkdirSync(OUT, { recursive: true });
const SEED = "20260908";

function psql(sql: string, csv = true): string {
  const args = csv ? ["--csv", "-c", sql] : ["-tAc", sql];
  const r = Bun.spawnSync(["psql", ...args]);
  const out = new TextDecoder().decode(r.stdout);
  const err = new TextDecoder().decode(r.stderr);
  if (r.exitCode !== 0) throw new Error(`psql failed: ${err}\n${sql.slice(0, 400)}`);
  if (err.trim()) console.error(err.trim());
  return out;
}

function save(name: string, sql: string): number {
  const text = psql(sql);
  writeFileSync(`${OUT}/${name}`, text);
  const lines = text.trim().split("\n");
  return Math.max(lines.length - 1, 0);
}

// host of a url column, then its registrable domain (last two labels)
const HOST = (col: string) =>
  `nullif(regexp_replace(lower(${col}), '^(https?://)?(www\\.)?([^/:?#]+).*$', '\\3'), '')`;
const DOM = (hostExpr: string) =>
  `array_to_string((string_to_array(${hostExpr}, '.'))[greatest(array_length(string_to_array(${hostExpr}, '.'), 1) - 1, 1):], '.')`;

// ---------- 1. coverage ----------
const coverage = `
with u as (select count(*) n from universities), p as (select count(*) n from programs)
select 'schools' as record, 'state' as field,
  count(*) filter (where state is not null and state <> '') as populated,
  count(*) filter (where state is null or state = '') as empty, count(*) as total from universities
union all select 'schools','institution_id (IPEDS)',
  count(*) filter (where ipeds_unitid is not null), count(*) filter (where ipeds_unitid is null), count(*) from universities
union all select 'schools','school_website',
  count(*) filter (where website_url is not null and website_url <> ''), count(*) filter (where website_url is null or website_url = ''), count(*) from universities
union all select 'programs','athletics_site',
  count(*) filter (where athletic_website is not null and athletic_website <> ''), count(*) filter (where athletic_website is null or athletic_website = ''), count(*) from programs
union all select 'programs','roster_url',
  count(*) filter (where roster_url is not null and roster_url <> ''), count(*) filter (where roster_url is null or roster_url = ''), count(*) from programs
union all select 'programs','staff_url',
  count(*) filter (where coaching_staff_url is not null and coaching_staff_url <> ''), count(*) filter (where coaching_staff_url is null or coaching_staff_url = ''), count(*) from programs
union all select 'programs','governing_body',
  count(*) filter (where governing_body is not null), count(*) filter (where governing_body is null), count(*) from programs
union all select 'programs','division',
  count(*) filter (where division is not null and division <> ''), count(*) filter (where division is null or division = ''), count(*) from programs
union all select 'programs','conference',
  count(*) filter (where conference is not null and conference <> ''), count(*) filter (where conference is null or conference = ''), count(*) from programs
`;

// ---------- 2a. shared athletics domains ----------
const sharedDomains = `
with base as (
  select pr.university_id, u.name as school, u.state,
         ${HOST("pr.athletic_website")} as host
  from programs pr join universities u on u.id = pr.university_id
  where pr.athletic_website is not null and pr.athletic_website <> ''
),
d as (select university_id, school, state, ${DOM("host")} as domain from base where host is not null),
uniq as (select distinct domain, university_id, school, state from d),
shared as (select domain from uniq group by domain having count(distinct university_id) > 1),
info as (
  select pr.university_id,
         count(*) as program_count,
         string_agg(distinct coalesce(pr.governing_body::text,'?') || ' ' || coalesce(pr.division,''), ' | ') as levels,
         string_agg(distinct pr.sport::text, ', ') as sports
  from programs pr group by pr.university_id
)
select uniq.domain, uniq.school, uniq.state, i.program_count, i.levels as level_division, i.sports,
       (select count(distinct university_id) from uniq u2 where u2.domain = uniq.domain) as schools_on_domain
from uniq join shared using (domain) left join info i on i.university_id = uniq.university_id
order by uniq.domain, uniq.school
`;

// ---------- 2b. shared roster/staff urls ----------
const sharedUrls = `
with base as (
  select 'roster_url' as field, lower(trim(pr.roster_url)) as url, pr.id as program_id, pr.sport::text as sport,
         pr.university_id, u.name as school, u.state, coalesce(pr.governing_body::text,'?') || ' ' || coalesce(pr.division,'') as level_division
  from programs pr join universities u on u.id = pr.university_id where pr.roster_url is not null and pr.roster_url <> ''
  union all
  select 'staff_url', lower(trim(pr.coaching_staff_url)), pr.id, pr.sport::text,
         pr.university_id, u.name, u.state, coalesce(pr.governing_body::text,'?') || ' ' || coalesce(pr.division,'')
  from programs pr join universities u on u.id = pr.university_id where pr.coaching_staff_url is not null and pr.coaching_staff_url <> ''
),
shared as (select field, url from base group by field, url having count(distinct program_id) > 1),
counts as (select university_id, count(*) as program_count from programs group by university_id)
select b.field, b.url, b.school, b.state, b.sport, b.level_division, c.program_count,
       (select count(distinct program_id) from base b2 where b2.field = b.field and b2.url = b.url) as programs_on_url,
       (select count(distinct university_id) from base b3 where b3.field = b.field and b3.url = b.url) as schools_on_url
from base b join shared s on s.field = b.field and s.url = b.url
left join counts c on c.university_id = b.university_id
order by schools_on_url desc, b.field, b.url, b.school
`;

// ---------- 2d. state mismatch vs federal record ----------
const stateMismatch = `
select u.id as school_id, u.name as school, u.state as stored_state, f.state as federal_state,
       f.name as federal_name, u.ipeds_unitid as institution_id, u.federal_match_status
from universities u join federal_directory f on f.unitid = u.ipeds_unitid
where u.state is not null and f.state is not null and upper(trim(u.state)) <> upper(trim(f.state))
order by u.name
`;

// ---------- 3. identity ----------
const identity = `
select coalesce(federal_match_status,'(none)') as match_status,
       count(*) as schools,
       count(*) filter (where ipeds_unitid is not null) as with_institution_id,
       count(*) filter (where ipeds_unitid is null) as name_only
from universities group by 1 order by 2 desc
`;

const noFederalId = `
with base as (
  select u.id, u.name, u.state, u.federal_match_status,
         (select ${HOST("pr.athletic_website")} from programs pr where pr.university_id = u.id and pr.athletic_website is not null limit 1) as host,
         (select count(*) from programs pr where pr.university_id = u.id) as program_count
  from universities u where u.ipeds_unitid is null
)
select name as school, state, federal_match_status as match_status, program_count,
       case when host is null then '' else ${DOM("host")} end as athletics_domain
from base order by state nulls last, name
`;

// ---------- 4. provenance ----------
const provenanceFields = `
select s.table_name as record, s.field_name as field, s.source_type,
       count(*) as records,
       min(s.last_verified_at)::date as oldest_check, max(s.last_verified_at)::date as newest_check,
       count(*) filter (where s.last_verified_at is null) as never_verified
from data_field_sources s group by 1,2,3 order by records desc
`;

const provenanceHosts = `
select ${DOM(HOST("source_url"))} as source_host, count(*) as records,
       count(distinct field_name) as distinct_fields, max(last_verified_at)::date as newest_check
from data_field_sources where source_url is not null and source_url <> ''
group by 1 order by records desc limit 30
`;

// ---------- 5. stratified random sample ----------
const sample = `
with strata as (
  select pr.id, u.name as school, u.state,
    case
      when pr.governing_body = 'NCAA' and pr.division ilike '%I%' and pr.division not ilike '%II%' and pr.division not ilike '%III%' then 'NCAA D1'
      when pr.governing_body = 'NCAA' and pr.division ilike '%III%' then 'NCAA D3'
      when pr.governing_body = 'NCAA' and pr.division ilike '%II%' then 'NCAA D2'
      when pr.governing_body = 'NCAA' then 'NCAA (division unknown)'
      when pr.governing_body = 'NAIA' then 'NAIA'
      when pr.governing_body in ('NJCAA','CCCAA','NWAC') then 'JUCO'
      else 'Unknown level'
    end as stratum,
    pr.governing_body::text as governing_body, pr.division, pr.conference, pr.sport::text as sport,
    pr.athletic_website as athletics_site, pr.roster_url, pr.coaching_staff_url as staff_url,
    row_number() over (partition by
      case
        when pr.governing_body = 'NCAA' and pr.division ilike '%I%' and pr.division not ilike '%II%' and pr.division not ilike '%III%' then 'NCAA D1'
        when pr.governing_body = 'NCAA' and pr.division ilike '%III%' then 'NCAA D3'
        when pr.governing_body = 'NCAA' and pr.division ilike '%II%' then 'NCAA D2'
        when pr.governing_body = 'NCAA' then 'NCAA (division unknown)'
        when pr.governing_body = 'NAIA' then 'NAIA'
        when pr.governing_body in ('NJCAA','CCCAA','NWAC') then 'JUCO'
        else 'Unknown level'
      end
      order by md5(pr.id::text || '${SEED}')) as rn
  from programs pr join universities u on u.id = pr.university_id
  where pr.offering_status = 'verified'
)
select stratum, school, state, governing_body, division, conference, sport, athletics_site, roster_url, staff_url
from strata
where (stratum = 'NCAA D1' and rn <= 20)
   or (stratum = 'NCAA D2' and rn <= 20)
   or (stratum = 'NCAA D3' and rn <= 20)
   or (stratum = 'NAIA' and rn <= 20)
   or (stratum = 'JUCO' and rn <= 20)
order by stratum, school, sport
`;

const counts: Record<string, number> = {};
counts["coverage.csv"] = save("coverage.csv", coverage);
counts["collision-athletics-domains.csv"] = save("collision-athletics-domains.csv", sharedDomains);
counts["collision-page-urls.csv"] = save("collision-page-urls.csv", sharedUrls);
counts["collision-state-mismatch.csv"] = save("collision-state-mismatch.csv", stateMismatch);
counts["identity.csv"] = save("identity.csv", identity);
counts["no-federal-id.csv"] = save("no-federal-id.csv", noFederalId);

// provenance: fields + host breakdown in one file
const provText =
  "SECTION,per-field provenance\n" +
  psql(provenanceFields) +
  "\nSECTION,top source websites (top 30)\n" +
  psql(provenanceHosts);
writeFileSync(`${OUT}/provenance.csv`, provText);
counts["provenance.csv"] = provText.trim().split("\n").length;

counts["audit-sample-100.csv"] = save("audit-sample-100.csv", sample);

// ---------- 2c. similar school names (edit distance in JS, no pg_trgm) ----------
type School = { id: string; name: string; state: string; domain: string };
const rows = psql(
  `with base as (
     select u.id, u.name, coalesce(u.state,'') as state,
       (select ${HOST("pr.athletic_website")} from programs pr where pr.university_id = u.id and pr.athletic_website is not null limit 1) as host
     from universities u)
   select id, name, state, case when host is null then '' else ${DOM("host")} end as domain from base`,
)
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)/g)!.filter((_, i) => i % 2 === 0);
    const clean = (v: string) => v.replace(/^"|"$/g, "").replace(/""/g, '"');
    return { id: clean(cells[0] ?? ""), name: clean(cells[1] ?? ""), state: clean(cells[2] ?? ""), domain: clean(cells[3] ?? "") } as School;
  })
  .filter((r) => r.name);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

// bucket by first distinctive token to avoid a full cross join
const buckets = new Map<string, School[]>();
for (const s of rows) {
  const tokens = norm(s.name).split(" ");
  for (const t of tokens.slice(0, 3)) {
    if (t.length < 4) continue;
    const arr = buckets.get(t) ?? [];
    arr.push(s);
    buckets.set(t, arr);
  }
}
const pairs = new Map<string, string[]>();
for (const group of buckets.values()) {
  if (group.length < 2 || group.length > 300) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      if (a.id === b.id) continue;
      const na = norm(a.name);
      const nb = norm(b.name);
      if (na === nb) continue;
      const contains = na.includes(nb) || nb.includes(na);
      const dist = editDistance(na, nb, 4);
      if (!contains && dist > 4) continue;
      const key = [a.id, b.id].sort().join(":");
      if (pairs.has(key)) continue;
      pairs.set(key, [
        a.name,
        a.state,
        a.domain,
        b.name,
        b.state,
        b.domain,
        contains ? "one name contains the other" : `edit distance ${dist}`,
        a.domain && a.domain === b.domain ? "SAME DOMAIN" : "",
      ]);
    }
  }
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const simRows = [...pairs.values()].sort((x, y) => x[0]!.localeCompare(y[0]!));
writeFileSync(
  `${OUT}/collision-similar-names.csv`,
  ["school_a,state_a,domain_a,school_b,state_b,domain_b,reason,flag", ...simRows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n",
);
counts["collision-similar-names.csv"] = simRows.length;

console.log(JSON.stringify({ seed: SEED, rowCounts: counts }, null, 2));
console.log("\n--- coverage ---");
console.log(psql(coverage, false));
console.log("--- identity ---");
console.log(psql(identity, false));
