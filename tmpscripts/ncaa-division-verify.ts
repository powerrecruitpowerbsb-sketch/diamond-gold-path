/**
 * Verify every NCAA program's DIVISION against the NCAA's own sport-filtered
 * member list — the same feed the conference verification already uses.
 *
 * Conference came back 1,780 verified while division stayed entirely unverified,
 * yet division is the filter families use most. The feed is sliced by division
 * and sport, so a school appearing in the Division II softball list IS the
 * proof of that program's level.
 *
 * The pool is by SPORT only, never by our stored division — pooling by division
 * would only ever confirm what we already hold and would hide every
 * disagreement.
 *
 *   bun tmpscripts/ncaa-division-verify.ts            # report only
 *   bun tmpscripts/ncaa-division-verify.ts --apply    # one reversible run
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
    return registrableDomain(
      new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase(),
    );
  } catch {
    return "";
  }
};

type Program = {
  id: string;
  name: string;
  state: string;
  sport: string;
  division: string;
  verification: string;
  schoolDomain: string;
  athleticDomain: string;
};

const programs: Program[] = q(
  `select p.id, u.name, coalesce(u.state,''), p.sport::text, coalesce(p.division,''),
          p.division_verification::text, coalesce(u.website_url,''), coalesce(p.athletic_website,'')
     from programs p join universities u on u.id = p.university_id
    where p.governing_body = 'NCAA' and u.retired_at is null`,
).map(([id, name, state, sport, division, verification, site, athletic]) => ({
  id: id!,
  name: name!,
  state: stateCode(state),
  sport: sport!,
  division: division!,
  verification: verification!,
  schoolDomain: domainOf(site),
  athleticDomain: domainOf(athletic),
}));

console.log(`NCAA programs on file: ${programs.length}`);

type Verdict = {
  program: Program;
  feedName: string;
  feedDivision: string;
  feedLabel: string;
  how: string;
  action: "agrees" | "correction" | "fill" | "no feed row" | "ambiguous";
};

const verdicts: Verdict[] = [];
const matched = new Map<string, Verdict[]>();

for (const slice of NCAA_SLICES) {
  const feed = await fetchNcaaDirectory(slice.division, slice.sport);
  const divisionLabel = `D${slice.division === "I" ? 1 : slice.division === "II" ? 2 : 3}`;
  const pool = programs.filter((p) => p.sport === slice.sport);
  console.log(`${slice.label}: feed ${feed.length}, our ${slice.sport} programs ${pool.length}`);

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
      const inState = pool.filter((p) => sameState(p.state, state));
      const resolved = resolveByName(
        row.name,
        inState.map((p) => ({ id: p.id, name: p.name })),
      );
      if (resolved.school) {
        hit = pool.find((p) => p.id === resolved.school!.id);
        how = `${resolved.method} in ${state}`;
      }
    }
    if (!hit) continue;

    const verdict: Verdict = {
      program: hit,
      feedName: row.name,
      feedDivision: divisionLabel,
      feedLabel: `Division ${slice.division}`,
      how,
      action: !hit.division ? "fill" : hit.division === divisionLabel ? "agrees" : "correction",
    };
    verdicts.push(verdict);
    matched.set(hit.id, [...(matched.get(hit.id) ?? []), verdict]);
  }
}

for (const p of programs) {
  if (matched.has(p.id)) continue;
  verdicts.push({
    program: p,
    feedName: "",
    feedDivision: "",
    feedLabel: "",
    how: "no NCAA listing matched this program",
    action: "no feed row",
  });
}

// A program listed in two divisions is settled by neither.
const conflicted = [...matched.entries()].filter(([, list]) => new Set(list.map((v) => v.feedDivision)).size > 1);
for (const [, list] of conflicted) for (const v of list) v.action = "ambiguous";

const verifiable = [...matched.entries()]
  .filter(([, list]) => new Set(list.map((v) => v.feedDivision)).size === 1)
  .map(([, list]) => list[0]!);

const count = (action: Verdict["action"]) => verdicts.filter((v) => v.action === action).length;
console.log(
  `verifiable ${verifiable.length} (agrees ${verifiable.filter((v) => v.action === "agrees").length}, corrections ${verifiable.filter((v) => v.action === "correction").length}, fills ${verifiable.filter((v) => v.action === "fill").length})`,
);
console.log(`not verifiable: no feed row ${count("no feed row")}, listed in two divisions ${conflicted.length}`);

write("ncaa-division-verify.csv", [
  ["program_id", "school", "state", "sport", "stored_division", "feed_division", "feed_name", "matched_how", "action"],
  ...verdicts.map((v) => [
    v.program.id,
    v.program.name,
    v.program.state,
    v.program.sport,
    v.program.division,
    v.feedDivision,
    v.feedName,
    v.how,
    v.action,
  ]),
]);

if (!APPLY) {
  console.log("report only — nothing written. Re-run with --apply to verify.");
  process.exit(0);
}

const runArg = process.argv.indexOf("--run");
const runId = runArg > -1 ? process.argv[runArg + 1]! : crypto.randomUUID();
const alreadyDone = new Set(
  q(`select id from programs where division_verification='verified' and division_source = '${SOURCE}'`).map(
    ([id]) => id!,
  ),
);
console.log(`run ${runId} (${alreadyDone.size} already verified, skipping)`);

const applied: unknown[][] = [["program_id", "school", "sport", "prior_division", "new_division", "action"]];
let done = 0;

for (const v of verifiable) {
  if (alreadyDone.has(v.program.id)) continue;
  const prior = v.program.division;
  if (v.action !== "agrees") {
    const { error: archiveError } = await sb.from("program_level_archive").insert({
      run_id: runId,
      program_id: v.program.id,
      field: "division",
      prior_value: prior || null,
      new_value: v.feedDivision,
      reason: `${SOURCE} (${v.feedLabel} ${v.program.sport}) — matched by ${v.how}`,
    });
    if (archiveError) throw new Error(archiveError.message);
  }
  const { error } = await sb
    .from("programs")
    .update({
      division: v.feedDivision,
      division_raw: v.feedLabel,
      division_verification: "verified",
      division_source: SOURCE,
      division_verified_at: new Date().toISOString(),
    })
    .eq("id", v.program.id);
  if (error) throw new Error(`${v.program.name}: ${error.message}`);
  done += 1;
  applied.push([v.program.id, v.program.name, v.program.sport, prior, v.feedDivision, v.action]);
  if (done % 200 === 0) console.log(`verified ${done}/${verifiable.length}`);
}

write("ncaa-division-applied.csv", applied);
console.log(`run ${runId}: ${done} divisions verified`);
