/**
 * FEDERAL/LEAGUE IMPORT 3 — verify every NCAA program's conference against the
 * NCAA's own sport-filtered member list.
 *
 * Conference is verified for zero programs today, and our own rule says an
 * unverified value is never used as a filter — yet conference is a primary
 * filter. This closes that gap for NCAA programs using the same feed the
 * division work already uses: web3.ncaa.org memberList, sliced by division and
 * sport, so a school's baseball conference and softball conference are read
 * independently.
 *
 * Matching is identity-bound, never fuzzy: institutional domain, then athletics
 * domain, then an exact/significant-word name match inside the same state and
 * the same division+sport pool.
 *
 *   bun tmpscripts/ncaa-conference-verify.ts          # report only
 *   bun tmpscripts/ncaa-conference-verify.ts --apply  # one reversible run
 *
 * Writes /mnt/documents/ncaa-conference-verify.csv,
 * ncaa-conference-unverified.csv and, on apply, ncaa-conference-applied.csv.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { NCAA_SLICES, fetchNcaaDirectory } from "@/lib/directory-import.server";
import { registrableDomain } from "@/lib/program-ownership";
import { resolveByName, sameState, stateCode } from "@/lib/school-name-match";

const APPLY = process.argv.includes("--apply");
const OUT = "/mnt/documents";
const SOURCE = "NCAA member list";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};
const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

const domainOf = (url: string | null | undefined) => {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    return registrableDomain(new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase());
  } catch {
    return "";
  }
};
const confKey = (value: string | null | undefined) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\bconf(erence)?\b/g, "")
    .replace(/[^a-z0-9]/g, "");

type Program = {
  id: string;
  name: string;
  state: string;
  sport: string;
  division: string;
  conference: string;
  verification: string;
  schoolDomain: string;
  athleticDomain: string;
  universityId: string;
};

const programs: Program[] = q(
  `select p.id, u.name, coalesce(u.state,''), p.sport::text, coalesce(p.division,''),
          coalesce(p.conference,''), p.conference_verification::text,
          coalesce(u.website_url,''), coalesce(p.athletic_website,''), u.id
     from programs p join universities u on u.id = p.university_id
    where p.governing_body = 'NCAA' and u.retired_at is null`,
).map(([id, name, state, sport, division, conference, verification, site, athletic, universityId]) => ({
  id: id!,
  name: name!,
  state: stateCode(state),
  sport: sport!,
  division: division!,
  conference: conference!,
  verification: verification!,
  schoolDomain: domainOf(site),
  athleticDomain: domainOf(athletic),
  universityId: universityId!,
}));

console.log(`NCAA programs on file: ${programs.length}`);

type Verdict = {
  program: Program;
  feedName: string;
  feedDivision: string;
  feedConference: string;
  how: string;
  action: "agrees" | "correction" | "fill" | "no feed row" | "feed has no conference" | "ambiguous";
};

const verdicts: Verdict[] = [];
const matchedIds = new Set<string>();

for (const slice of NCAA_SLICES) {
  const feed = await fetchNcaaDirectory(slice.division, slice.sport);
  const divisionLabel = `D${slice.division === "I" ? 1 : slice.division === "II" ? 2 : 3}`;
  // Pool at PROGRAM level: this slice's sport only, and this division only, so
  // a school's D1 baseball row can never be settled by a D2 softball listing.
  const pool = programs.filter((p) => p.sport === slice.sport && p.division === divisionLabel);
  console.log(`${slice.label}: feed ${feed.length}, ours ${pool.length}`);

  for (const row of feed) {
    const feedSchool = domainOf(row.websiteUrl);
    const feedAthletic = domainOf(row.athleticWebsite);
    const state = stateCode(row.state);

    let hit: Program | undefined;
    let how = "";
    if (feedSchool) {
      const hits = pool.filter((p) => p.schoolDomain && p.schoolDomain === feedSchool);
      if (hits.length === 1) {
        hit = hits[0];
        how = `institutional domain ${feedSchool}`;
      }
    }
    if (!hit && feedAthletic) {
      const hits = pool.filter((p) => p.athleticDomain && p.athleticDomain === feedAthletic);
      if (hits.length === 1) {
        hit = hits[0];
        how = `athletics domain ${feedAthletic}`;
      }
    }
    if (!hit) {
      const stateted = pool.filter((p) => sameState(p.state, state));
      const resolved = resolveByName(row.name, stateted.map((p) => ({ id: p.id, name: p.name })));
      if (resolved.school) {
        hit = pool.find((p) => p.id === resolved.school!.id);
        how = `${resolved.method} in ${state}`;
      } else if (resolved.method === "ambiguous") {
        verdicts.push({
          program: {
            ...({} as Program),
            id: "",
            name: row.name,
            state,
            sport: slice.sport,
            division: divisionLabel,
            conference: "",
            verification: "",
            schoolDomain: feedSchool,
            athleticDomain: feedAthletic,
            universityId: "",
          },
          feedName: row.name,
          feedDivision: divisionLabel,
          feedConference: row.conference ?? "",
          how: resolved.how,
          action: "ambiguous",
        });
        continue;
      }
    }
    if (!hit) continue;
    matchedIds.add(hit.id);

    const feedConference = row.conference ?? "";
    verdicts.push({
      program: hit,
      feedName: row.name,
      feedDivision: divisionLabel,
      feedConference,
      how,
      action: !feedConference
        ? "feed has no conference"
        : !hit.conference
          ? "fill"
          : confKey(hit.conference) === confKey(feedConference)
            ? "agrees"
            : "correction",
    });
  }
}

for (const p of programs) {
  if (matchedIds.has(p.id)) continue;
  verdicts.push({
    program: p,
    feedName: "",
    feedDivision: "",
    feedConference: "",
    how: "no NCAA listing matched this program",
    action: "no feed row",
  });
}

const count = (action: Verdict["action"]) => verdicts.filter((v) => v.action === action).length;
// One verdict per program: when two feed rows land on the same program, the
// program is not settled by either, so it is dropped rather than written twice.
const settled = verdicts.filter((v) => v.action === "agrees" || v.action === "correction" || v.action === "fill");
const seen = new Map<string, number>();
for (const v of settled) seen.set(v.program.id, (seen.get(v.program.id) ?? 0) + 1);
const doubled = [...seen].filter(([, n]) => n > 1);
if (doubled.length) console.log(`${doubled.length} programs matched two feed rows and are left unverified`);
const verifiable = settled.filter((v) => (seen.get(v.program.id) ?? 0) === 1);

console.log(
  `verifiable ${verifiable.length}  (agrees ${count("agrees")}, corrections ${count("correction")}, fills ${count("fill")})`,
);
console.log(
  `not verifiable: no feed row ${count("no feed row")}, feed carries no conference ${count("feed has no conference")}, ambiguous ${count("ambiguous")}`,
);

write("ncaa-conference-verify.csv", [
  [
    "program_id",
    "school",
    "state",
    "sport",
    "division",
    "stored_conference",
    "feed_conference",
    "feed_name",
    "matched_how",
    "action",
  ],
  ...verdicts.map((v) => [
    v.program.id,
    v.program.name,
    v.program.state,
    v.program.sport,
    v.program.division,
    v.program.conference,
    v.feedConference,
    v.feedName,
    v.how,
    v.action,
  ]),
]);

// What stays unverified, by governing body — the whole database, not just NCAA.
const verifiableIds = new Set(verifiable.map((v) => v.program.id));
const remaining = q(
  `select coalesce(governing_body::text,'(none)'), count(*), count(nullif(coalesce(conference,''),'')), id
     from programs group by 1, 4`,
);
const byBody = new Map<string, { total: number; withValue: number; willVerify: number }>();
for (const [body, , withValue, id] of remaining) {
  const entry = byBody.get(body!) ?? { total: 0, withValue: 0, willVerify: 0 };
  entry.total += 1;
  entry.withValue += Number(withValue) ? 1 : 0;
  entry.willVerify += verifiableIds.has(id!) ? 1 : 0;
  byBody.set(body!, entry);
}
write("ncaa-conference-unverified.csv", [
  ["governing_body", "programs", "with_a_conference_value", "verified_by_this_run", "still_unverified", "empty"],
  ...[...byBody].map(([body, e]) => [
    body,
    e.total,
    e.withValue,
    e.willVerify,
    e.total - e.willVerify,
    e.total - e.withValue,
  ]),
]);
console.table(Object.fromEntries([...byBody].map(([b, e]) => [b, e])));

if (!APPLY) {
  console.log("report only — nothing written. Re-run with --apply to verify.");
  process.exit(0);
}

// Resumable: a killed run is continued under its own id with --run <uuid>, and
// programs already carrying this source are skipped so nothing is written twice.
const runArg = process.argv.indexOf("--run");
const runId = runArg > -1 ? process.argv[runArg + 1]! : crypto.randomUUID();
const alreadyDone = new Set(
  q(`select id from programs where conference_verification='verified' and conference_source = '${SOURCE}'`).map(
    ([id]) => id!,
  ),
);
console.log(`run ${runId} (${alreadyDone.size} already verified, skipping)`);
const applied: unknown[][] = [
  ["program_id", "school", "sport", "prior_conference", "new_conference", "action"],
];
let done = 0;

for (const v of verifiable) {
  if (alreadyDone.has(v.program.id)) continue;
  const prior = v.program.conference;

  if (v.action !== "agrees") {
    const { error: archiveError } = await sb.from("program_level_archive").insert({
      run_id: runId,
      program_id: v.program.id,
      field: "conference",
      prior_value: prior || null,
      new_value: v.feedConference,
      reason: `${SOURCE} (${v.feedDivision} ${v.program.sport}) — matched by ${v.how}`,
    });
    if (archiveError) throw new Error(archiveError.message);
  }
  const { error } = await sb
    .from("programs")
    .update({
      conference: v.feedConference,
      conference_verification: "verified",
      conference_source: SOURCE,
      conference_verified_at: new Date().toISOString(),
    })
    .eq("id", v.program.id);
  if (error) throw new Error(`${v.program.name}: ${error.message}`);
  done += 1;
  applied.push([v.program.id, v.program.name, v.program.sport, prior, v.feedConference, v.action]);
  if (done % 200 === 0) console.log(`verified ${done}/${verifiable.length}`);
}

write("ncaa-conference-applied.csv", applied);
console.log(`run ${runId}: ${done} conferences verified (${count("correction")} corrected, ${count("fill")} filled)`);
