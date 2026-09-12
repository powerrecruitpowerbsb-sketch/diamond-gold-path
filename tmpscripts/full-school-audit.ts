/**
 * REPORT ONLY — full audit of all 1,885 school records. Nothing is written.
 *
 * Every school record is checked against the federal directory and against
 * basic sanity: identity, website/domain sanity on all four address fields,
 * program shape, and obviously wrong field values. One row per record listing
 * every check it failed.
 *
 * Run: bun tmpscripts/full-school-audit.ts
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { US_STATE_NAMES } from "@/lib/data-quality";
import { matchKey, nameSimilarity } from "@/lib/federal-match";
import { hostOf, junkHost, wrongSportPath } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";

const OUT = "/mnt/documents";

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
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

/* ------------------------------- load ------------------------------- */

const schoolRows = q(`
  select u.id, coalesce(u.name,''), coalesce(u.state,''), coalesce(u.city,''),
         coalesce(u.ipeds_unitid::text,''), coalesce(u.website_url,''),
         coalesce(u.federal_match_status,''),
         coalesce(u.undergrad_enrollment::text,''), coalesce(u.acceptance_rate::text,''),
         coalesce(u.graduation_rate::text,''), coalesce(u.avg_gpa::text,''),
         coalesce(u.avg_sat::text,''), coalesce(u.avg_act::text,''),
         coalesce(u.tuition_in_state::text,''), coalesce(u.tuition_out_state::text,''),
         coalesce(f.name,''), coalesce(f.state,''), coalesce(f.website,''),
         case when f.unitid is null then '0' else '1' end
  from universities u
  left join federal_directory f on f.unitid = u.ipeds_unitid
  order by u.name`);

const programRows = q(`
  select p.id, p.university_id, p.sport::text, coalesce(p.athletic_website,''),
         coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,'')
  from programs p`);

const platformHosts = new Set(q(`select host from link_platform_hosts`).map((r) => r[0]!));

type School = {
  id: string;
  name: string;
  state: string;
  city: string;
  unitid: string;
  website: string;
  matchStatus: string;
  enrollment: string;
  acceptance: string;
  gradRate: string;
  gpa: string;
  sat: string;
  act: string;
  tuitionIn: string;
  tuitionOut: string;
  fedName: string;
  fedState: string;
  fedWebsite: string;
  fedFound: boolean;
};

const schools: School[] = schoolRows.map((r) => ({
  id: r[0]!, name: r[1]!, state: r[2]!, city: r[3]!, unitid: r[4]!, website: r[5]!,
  matchStatus: r[6]!, enrollment: r[7]!, acceptance: r[8]!, gradRate: r[9]!,
  gpa: r[10]!, sat: r[11]!, act: r[12]!, tuitionIn: r[13]!, tuitionOut: r[14]!,
  fedName: r[15]!, fedState: r[16]!, fedWebsite: r[17]!, fedFound: r[18] === "1",
}));

type Program = { id: string; universityId: string; sport: string; athletic: string; roster: string; staff: string };
const programs: Program[] = programRows.map((r) => ({
  id: r[0]!, universityId: r[1]!, sport: r[2]!, athletic: r[3]!, roster: r[4]!, staff: r[5]!,
}));

const byUniversity = new Map<string, Program[]>();
for (const p of programs) {
  const list = byUniversity.get(p.universityId) ?? [];
  list.push(p);
  byUniversity.set(p.universityId, list);
}

/* ------------------------------ helpers ----------------------------- */

const STATE_CODES = new Set(Object.keys(US_STATE_NAMES));
const NAME_TO_CODE = new Map(Object.entries(US_STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

function stateCode(value: string): string | null {
  const flat = value.trim().toLowerCase().replace(/\./g, "");
  if (!flat) return null;
  if (/^[a-z]{2}$/.test(flat)) return flat.toUpperCase();
  const exact = NAME_TO_CODE.get(flat);
  if (exact) return exact;
  for (const [name, code] of NAME_TO_CODE) if (name.startsWith(flat) && flat.length >= 3) return code;
  return null;
}

/** Third-party services that are never a school or athletics website. */
const VENDOR_DOMAINS = [
  "bkstr.com", "barnesandnoble.com", "bncollege.com", "follett.com", "efollett.com", "ecampus.com",
  "ticketmaster.com", "etix.com", "ticketreturn.com", "hometownticketing.com", "gofan.co",
  "paypal.com", "squareup.com", "stripe.com", "givecampus.com", "classy.org", "blackbaud.com",
  "wordpress.com", "wixsite.com", "wix.com", "weebly.com", "godaddysites.com", "squarespace.com",
  "blogspot.com", "tumblr.com", "medium.com", "wordpress.org",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "youtu.be",
  "linkedin.com", "tiktok.com", "flickr.com", "pinterest.com", "threads.net",
  "maxpreps.com", "hudl.com", "athleticzone.net", "athleticzone.com", "8to18.com",
  "rankone.com", "digitalscout.com", "arbitersports.com",
  "sedo.com", "hugedomains.com", "afternic.com", "dan.com", "namecheap.com", "domain.com",
  "godaddy.com", "networksolutions.com", "parkingcrew.net", "bodis.com",
  "google.com", "docs.google.com", "sites.google.com", "drive.google.com", "forms.gle",
  "yelp.com", "wikipedia.org", "niche.com", "usnews.com", "collegeboard.org", "petersons.com",
  "eventbrite.com", "signupgenius.com", "surveymonkey.com", "smore.com", "canva.site",
];

function vendorDomain(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  const hit = VENDOR_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
  if (hit) return hit;
  return junkHost(url) ? registrableDomain(host) : null;
}

function malformed(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return "not http/https";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "unparseable address";
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)) return "IP address, not a domain";
  if (!parsed.hostname.includes(".")) return "hostname has no domain";
  if (/\s/.test(raw)) return "whitespace inside the address";
  if (/[<>"{}|\\^`]/.test(raw)) return "illegal characters";
  return null;
}

const pathAndQuery = (url: string) => {
  try {
    const u = new URL(url);
    return { path: u.pathname.toLowerCase(), search: u.search.toLowerCase() };
  } catch {
    return { path: "", search: "" };
  }
};

/** Homepage / donation / tickets / camps and other non-team destinations. */
function wrongPurpose(url: string): string | null {
  const { path } = pathAndQuery(url);
  const trimmed = path.replace(/\/+$/, "");
  if (/(^|\/)(giving|give|donate|donation|donations|support|advancement|foundation|fund)(\/|$)/.test(path))
    return "donation page";
  if (/(^|\/)(tickets?|ticketing|boxoffice|box-office|season-tickets)(\/|$)/.test(path)) return "ticket page";
  if (/(^|\/)(camps?|clinics?|camps-clinics|youth-camps)(\/|$)/.test(path)) return "camp page";
  if (/(^|\/)(shop|store|merch|apparel|bookstore)(\/|$)/.test(path)) return "shop page";
  if (!trimmed || trimmed === "/index") return "homepage, not a specific page";
  return null;
}

function highSchoolUrl(url: string): string | null {
  const host = hostOf(url);
  const { path } = pathAndQuery(url);
  const hay = `${host}${path}`;
  if (/athleticzone/.test(hay)) return "high-school site (athleticzone)";
  if (/(^|[/._-])(boys|girls)[-_/]/.test(path)) return "high-school path (boys-/girls-)";
  if (/(^|\/)(hs|highschool|high-school)(\/|$)/.test(path)) return "high-school path";
  if (/(^|[.-])(hs|k12)([.-]|$)/.test(host)) return "high-school domain";
  return null;
}

function addressJunk(url: string): string | null {
  const { path, search } = pathAndQuery(url);
  const season = /(^|[/_-])((19|20)\d{2})(-\d{2,4})?([/_-]|$)/.exec(path);
  if (season) {
    const year = Number(season[2]);
    if (year < new Date().getUTCFullYear() - 1) return `season folder (${season[0]!.replace(/[/_-]/g, "")})`;
  }
  if (/\/(index|default|home)\.(html?|php|aspx?|jsp|cfm)$/.test(path)) return "index/default filename";
  if (search) {
    if (/(utm_|fbclid|gclid|msclkid|sessionid|phpsessid|jsessionid)/.test(search)) return "tracking query string";
    if (search.length > 1) return `query string (${search.slice(0, 40)})`;
  }
  return null;
}

/* ------------------- cross-school domain ownership ------------------- */

type FieldRef = { schoolId: string; field: string; url: string; domain: string };
const allRefs: FieldRef[] = [];
for (const s of schools) {
  if (s.website) allRefs.push({ schoolId: s.id, field: "website_url", url: s.website, domain: registrableDomain(hostOf(s.website)) });
  for (const p of byUniversity.get(s.id) ?? []) {
    for (const [field, url] of [
      ["athletic_website", p.athletic],
      ["roster_url", p.roster],
      ["coaching_staff_url", p.staff],
    ] as const) {
      if (url) allRefs.push({ schoolId: s.id, field, url, domain: registrableDomain(hostOf(url)) });
    }
  }
}

const schoolsPerDomain = new Map<string, Set<string>>();
for (const ref of allRefs) {
  if (!ref.domain) continue;
  const set = schoolsPerDomain.get(ref.domain) ?? new Set<string>();
  set.add(ref.schoolId);
  schoolsPerDomain.set(ref.domain, set);
}
/** A domain serving 5+ schools is a hosting platform, not a school domain. */
const sharedPlatform = (domain: string) =>
  platformHosts.has(domain) || (schoolsPerDomain.get(domain)?.size ?? 0) >= 5;

const nameById = new Map(schools.map((s) => [s.id, s.name]));
/** Which school's federal record legitimately owns this domain, if any. */
const federalOwner = new Map<string, { id: string; name: string }>();
for (const s of schools) {
  const d = s.fedWebsite ? registrableDomain(hostOf(s.fedWebsite)) : "";
  if (d && !federalOwner.has(d)) federalOwner.set(d, { id: s.id, name: s.name });
}

/* ------------------------ duplicate institutions --------------------- */

const dupGroups = new Map<string, School[]>();
for (const s of schools) {
  const key = `${matchKey(s.name)}|${stateCode(s.state) ?? stateCode(s.fedState) ?? ""}`;
  if (!matchKey(s.name)) continue;
  const list = dupGroups.get(key) ?? [];
  list.push(s);
  dupGroups.set(key, list);
}
const duplicateOf = new Map<string, string[]>();
for (const list of dupGroups.values()) {
  if (list.length < 2) continue;
  for (const s of list) {
    duplicateOf.set(s.id, list.filter((o) => o.id !== s.id).map((o) => `${o.name} [${o.unitid || "no id"}]`));
  }
}
// Same unitid twice is a duplicate no matter what the names say.
const byUnitid = new Map<string, School[]>();
for (const s of schools) if (s.unitid) {
  const list = byUnitid.get(s.unitid) ?? [];
  list.push(s);
  byUnitid.set(s.unitid, list);
}
for (const list of byUnitid.values()) {
  if (list.length < 2) continue;
  for (const s of list) {
    const others = list.filter((o) => o.id !== s.id).map((o) => `${o.name} [same unitid ${s.unitid}]`);
    duplicateOf.set(s.id, [...(duplicateOf.get(s.id) ?? []), ...others]);
  }
}

/* ------------------------------ the audit ---------------------------- */

type Finding = { check: string; field: string; value: string; heldBy: string; severity: number };

const SEVERITY_LABEL = ["", "high", "medium", "low"];

const rows: unknown[][] = [
  [
    "record_id", "stored_name", "stored_state", "stored_ipeds_id",
    "federal_name", "federal_state", "federal_website",
    "failing_field", "failing_value", "legitimately_held_by",
    "program_count", "check_failed", "severity", "DECISION",
  ],
];
const tally = new Map<string, number>();
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);

for (const s of schools) {
  const progs = byUniversity.get(s.id) ?? [];
  const findings: Finding[] = [];
  const add = (check: string, field: string, value: string, severity: number, heldBy = "") =>
    findings.push({ check, field, value, heldBy, severity });

  /* -- identity -- */
  if (!s.unitid) add("no_federal_id", "ipeds_unitid", `match status: ${s.matchStatus || "unknown"}`, 1);
  else if (!s.fedFound) add("unitid_not_in_federal_directory", "ipeds_unitid", s.unitid, 1);
  else {
    const sim = nameSimilarity(s.name, s.fedName);
    if (sim < 0.6) add("name_disagrees_with_federal", "name", `${s.name} vs ${s.fedName}`, 1);
    else if (sim < 0.85) add("name_differs_from_federal", "name", `${s.name} vs ${s.fedName}`, 3);
    const ours = stateCode(s.state);
    const theirs = stateCode(s.fedState);
    if (theirs && ours && ours !== theirs) add("state_disagrees_with_federal", "state", `${s.state} vs ${s.fedState}`, 1);
    else if (theirs && !ours && s.state) add("state_unreadable", "state", s.state, 2);
  }
  const dups = duplicateOf.get(s.id);
  if (dups?.length) add("possible_duplicate_record", "name", s.name, 2, dups.join(" | "));

  /* -- addresses -- */
  const refs = allRefs.filter((r) => r.schoolId === s.id);
  const ownDomains = new Set(refs.map((r) => r.domain).filter(Boolean));
  const fedDomain = s.fedWebsite ? registrableDomain(hostOf(s.fedWebsite)) : "";
  if (fedDomain) ownDomains.add(fedDomain);

  for (const ref of refs) {
    const { field, url, domain } = ref;
    const bad = malformed(url);
    if (bad) add("malformed_address", field, `${url} — ${bad}`, 1);

    const vendor = vendorDomain(url);
    if (vendor) add("vendor_or_third_party_domain", field, `${url} — ${vendor}`, 1);

    const hs = highSchoolUrl(url);
    if (hs) add("points_at_high_school", field, `${url} — ${hs}`, 1);

    if (field === "athletic_website" && wrongPurpose(url) && wrongPurpose(url) !== "homepage, not a specific page") {
      add("wrong_page_purpose", field, `${url} — ${wrongPurpose(url)}`, 2);
    }
    if (field !== "website_url" && wrongSportPath(url)) add("sport_we_do_not_cover", field, url, 1);

    // An athletics site is legitimately a homepage; a roster or staff page is not.
    if (field === "roster_url" || field === "coaching_staff_url") {
      const purpose = wrongPurpose(url);
      if (purpose) add("wrong_page_purpose", field, `${url} — ${purpose}`, 2);
    }

    const junk = addressJunk(url);
    if (junk) add("address_junk", field, `${url} — ${junk}`, 3);

    if (domain && !sharedPlatform(domain)) {
      const owner = federalOwner.get(domain);
      if (owner && owner.id !== s.id) {
        add("domain_belongs_to_another_school", field, `${url} — ${domain}`, 1, owner.name);
      } else {
        const others = [...(schoolsPerDomain.get(domain) ?? [])].filter((id) => id !== s.id);
        if (others.length) {
          add("domain_shared_with_other_schools", field, `${url} — ${domain}`, 2,
            others.slice(0, 5).map((id) => nameById.get(id) ?? id).join(" | "));
        }
      }
      // A domain used once, on one field only, and unrelated to the federal site.
      const usesHere = refs.filter((r) => r.domain === domain).length;
      if (usesHere === 1 && fedDomain && domain !== fedDomain) {
        add("domain_appears_nowhere_else_on_this_school", field, `${url} — ${domain}`, 2);
      }
    }
  }

  /* -- program shape -- */
  const sports = progs.map((p) => p.sport);
  const offSport = sports.filter((sport) => sport !== "baseball" && sport !== "softball");
  if (offSport.length) add("program_sport_not_covered", "programs.sport", offSport.join(", "), 1);
  if (progs.length === 0) add("no_programs", "programs", "0", 2);
  if (progs.length > 2) add("more_than_two_programs", "programs", String(progs.length), 2);
  const dupSport = sports.filter((sport, i) => sports.indexOf(sport) !== i);
  if (dupSport.length) add("duplicate_program_for_same_sport", "programs.sport", dupSport.join(", "), 2);

  /* -- field values -- */
  const num = (v: string) => (v === "" ? null : Number(v));
  if (s.state && !STATE_CODES.has(s.state.toUpperCase()) && !stateCode(s.state))
    add("state_not_a_real_state", "state", s.state, 1);
  const enrollment = num(s.enrollment);
  if (enrollment !== null && enrollment <= 0) add("implausible_enrollment", "undergrad_enrollment", s.enrollment, 2);
  if (enrollment !== null && enrollment > 200000) add("implausible_enrollment", "undergrad_enrollment", s.enrollment, 2);
  const accept = num(s.acceptance);
  if (accept !== null && (accept < 0 || accept > 100)) add("implausible_acceptance_rate", "acceptance_rate", s.acceptance, 2);
  const grad = num(s.gradRate);
  if (grad !== null && (grad < 0 || grad > 100)) add("implausible_graduation_rate", "graduation_rate", s.gradRate, 2);
  const gpa = num(s.gpa);
  if (gpa !== null && (gpa <= 0 || gpa > 5)) add("implausible_gpa", "avg_gpa", s.gpa, 2);
  const sat = num(s.sat);
  if (sat !== null && (sat < 400 || sat > 1600)) add("implausible_sat", "avg_sat", s.sat, 2);
  const act = num(s.act);
  if (act !== null && (act < 1 || act > 36)) add("implausible_act", "avg_act", s.act, 2);
  for (const [field, value] of [["tuition_in_state", s.tuitionIn], ["tuition_out_state", s.tuitionOut]] as const) {
    const t = num(value);
    if (t !== null && (t < 0 || t > 150000)) add("implausible_tuition", field, value, 2);
  }
  if (!s.website) add("no_website_on_record", "website_url", "", 3);
  if (!s.name.trim()) add("no_name", "name", "", 1);
  if (!s.state.trim()) add("no_state", "state", "", 2);

  if (!findings.length) continue;

  const checks = [...new Set(findings.map((f) => f.check))];
  for (const check of checks) bump(check);
  const severity = Math.min(...findings.map((f) => f.severity));

  rows.push([
    s.id, s.name, s.state, s.unitid, s.fedName, s.fedState, s.fedWebsite,
    [...new Set(findings.map((f) => f.field))].join(" | "),
    findings.map((f) => `${f.field}=${f.value}`).join(" | "),
    [...new Set(findings.map((f) => f.heldBy).filter(Boolean))].join(" | "),
    progs.length,
    checks.join(" | "),
    SEVERITY_LABEL[severity],
    "",
  ]);
}

const body = rows.slice(1).sort((a, b) => {
  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  const sa = order[String(a[12])] ?? 9;
  const sb = order[String(b[12])] ?? 9;
  return sa !== sb ? sa - sb : String(a[1]).localeCompare(String(b[1]));
});

write("school-audit-full.csv", [rows[0]!, ...body]);
write("school-audit-summary.csv", [
  ["check", "records_failing"],
  ...[...tally.entries()].sort((a, b) => b[1] - a[1]),
]);

console.log(
  JSON.stringify(
    {
      schoolsChecked: schools.length,
      programsChecked: programs.length,
      recordsWithAtLeastOneFailure: body.length,
      bySeverity: {
        high: body.filter((r) => r[12] === "high").length,
        medium: body.filter((r) => r[12] === "medium").length,
        low: body.filter((r) => r[12] === "low").length,
      },
      byCheck: Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1])),
    },
    null,
    2,
  ),
);
