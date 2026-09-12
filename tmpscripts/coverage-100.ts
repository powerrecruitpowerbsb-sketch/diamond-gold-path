/**
 * COVERAGE MEASUREMENT — report only, nothing written.
 *
 * 100 programs sampled at random, stratified in proportion by governing body
 * and NCAA division (D1/D2/D3, NAIA, NJCAA, CCCAA, NWAC). Only programs marked
 * as offering the sport. For each: does it have a roster address and a coach
 * address, was the page read / blocked / 404 / missing, how many players and
 * coaches came out, was a head coach named, and which attributes the page
 * published.
 *
 * Resumable: results are stamped with PASS and cached, so re-running continues.
 *
 *   bun tmpscripts/coverage-100.ts [--budget 500]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { classifyStaffPage, extractCoaches } from "@/lib/coach-extract";
import { parseRoster, type RosterAttribute } from "@/lib/roster-extract";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const OUT = "/mnt/documents";
const STATE = "/tmp/coverage-100-state.json";
const PASS = "2026-09-12-coverage-100b";
const SAMPLE = 100;
const SEED = 20260912;
const budgetMs = Number(process.argv[process.argv.indexOf("--budget") + 1]) * 1000 || 500_000;
const startedAt = Date.now();

const ATTRIBUTES: RosterAttribute[] = ["number", "position", "class_year", "height", "weight", "hometown"];

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
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

/* deterministic shuffle so a re-run samples the same programs */
let seed = SEED;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

type Prog = {
  id: string; school: string; state: string; sport: string; stratum: string;
  roster_url: string; coach_url: string; head_coach_name: string;
};

type Result = Prog & {
  rosterOutcome: string; coachOutcome: string;
  players: number; coaches: number; headCoach: string;
  attributes: Record<string, string>;
  usableRoster: boolean;
};

/* ------------------------------- the sample ------------------------------- */

const { data: protection } = await sb.from("host_protection")
  .select("host, protection_kind").is("lifted_at", null);
setProtectedHosts((protection ?? []) as any[]);

const all: Prog[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, sport, governing_body, division, roster_url, coaching_staff_url, head_coach_name, universities(name, state)")
    .neq("offering_status", "not_offered")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  for (const p of data as any[]) {
    const gb = p.governing_body ?? "unknown";
    const div = String(p.division ?? "").toUpperCase();
    const stratum = gb === "NCAA"
      ? `NCAA ${/3|III/.test(div) ? "D3" : /2|II/.test(div) ? "D2" : /1|I/.test(div) ? "D1" : "division unrecorded"}`
      : gb;
    all.push({
      id: p.id,
      school: p.universities?.name ?? "unknown",
      state: p.universities?.state ?? "",
      sport: p.sport,
      stratum,
      roster_url: p.roster_url ?? "",
      coach_url: p.coaching_staff_url ?? "",
      head_coach_name: p.head_coach_name ?? "",
    });
  }
  if (data.length < 1000) break;
}

const strata = new Map<string, Prog[]>();
for (const p of all) {
  if (!strata.has(p.stratum)) strata.set(p.stratum, []);
  strata.get(p.stratum)!.push(p);
}
const sample: Prog[] = [];
const quotas = [...strata.entries()].map(([name, list]) => ({
  name, list, quota: Math.max(1, Math.round((list.length / all.length) * SAMPLE)),
}));
for (const s of quotas) sample.push(...shuffle(s.list).slice(0, s.quota));
console.log(`population ${all.length} programs; sampling ${sample.length}`);
for (const s of quotas) console.log(`  ${s.name}: ${s.list.length} on file -> ${s.quota} sampled`);

/* --------------------------------- crawl ---------------------------------- */

const loaded = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
const results: Result[] = loaded && loaded.pass === PASS ? loaded.results : [];
const done = new Set(results.map((r) => r.id));

const outcomeOf = (url: string, read: Awaited<ReturnType<typeof safeFetch>> | null) => {
  if (!url) return "no address on file";
  if (!read) return "not attempted";
  if (read.ok) return `page read (${read.fetch_method})`;
  const cat = read.failure_category ?? "unreadable";
  if (cat === "not_found") return "404 — page gone";
  if (cat === "blocked_by_host" || cat === "connection_blocked") return "blocked by host";
  return `unreadable: ${cat}`;
};

for (const p of sample) {
  if (done.has(p.id)) continue;
  if (Date.now() - startedAt > budgetMs) {
    writeFileSync(STATE, JSON.stringify({ pass: PASS, results }));
    console.log(`budget reached at ${results.length}/${sample.length} — re-run to continue`);
    process.exit(0);
  }

  const result: Result = {
    ...p, rosterOutcome: "", coachOutcome: "", players: 0, coaches: 0,
    headCoach: "", attributes: {}, usableRoster: false,
  };

  /* roster */
  let rosterRead: Awaited<ReturnType<typeof safeFetch>> | null = null;
  if (p.roster_url) {
    rosterRead = await safeFetch(p.roster_url);
    let text = rosterRead.ok ? (rosterRead.markdown ?? rosterRead.html ?? "") : "";
    if (rosterRead.ok && text && !parseRoster(text, p.sport).counts.players) {
      const rendered = await safeFetch(p.roster_url, { preferRendered: true });
      if (rendered.ok) { rosterRead = rendered; text = rendered.markdown ?? rendered.html ?? ""; }
    }
    if (rosterRead.ok && text) {
      const shape = parseRoster(text, p.sport);
      result.players = shape.players.length;
      result.usableRoster = shape.players.length >= 8 && !shape.parserDefects.length;
      for (const a of ATTRIBUTES) {
        const got = shape.players.filter((x) => x[a]).length;
        result.attributes[a] = got > 0 ? "published" : shape.columns[a] === "not_published" ? "not on the page" : "unknown";
      }
    } else {
      for (const a of ATTRIBUTES) result.attributes[a] = "not read";
    }
  } else {
    for (const a of ATTRIBUTES) result.attributes[a] = "no page";
  }
  result.rosterOutcome = outcomeOf(p.roster_url, rosterRead);

  /* coaches */
  let coachRead: Awaited<ReturnType<typeof safeFetch>> | null = null;
  if (p.coach_url) {
    coachRead = await safeFetch(p.coach_url);
    let text = coachRead.ok ? (coachRead.markdown ?? coachRead.html ?? "") : "";
    if (coachRead.ok && text && !extractCoaches(text, p.sport, { url: p.coach_url }).coaches.length) {
      const rendered = await safeFetch(p.coach_url, { preferRendered: true });
      if (rendered.ok) { coachRead = rendered; text = rendered.markdown ?? rendered.html ?? ""; }
    }
    if (coachRead.ok && text) {
      classifyStaffPage({ url: p.coach_url, text, sport: p.sport });
      const staff = extractCoaches(text, p.sport, { url: p.coach_url });
      result.coaches = staff.coaches.length;
      result.headCoach = staff.headCoach?.name ?? staff.coaches.find((c) => c.isHead)?.name ?? "";
    }
  }
  result.coachOutcome = outcomeOf(p.coach_url, coachRead);

  results.push(result);
  done.add(p.id);
  if (results.length % 10 === 0) {
    writeFileSync(STATE, JSON.stringify({ pass: PASS, results }));
    console.log(`  ${results.length}/${sample.length}`);
  }
}
writeFileSync(STATE, JSON.stringify({ pass: PASS, results }));

/* --------------------------------- exports -------------------------------- */

write("coverage-100-programs.csv", [
  ["school", "state", "sport", "stratum", "program_id", "has_roster_address", "has_coach_address",
   "roster_outcome", "coach_outcome", "players_extracted", "usable_roster", "coaches_extracted",
   "head_coach_found", "head_coach_name", ...ATTRIBUTES.map((a) => `attr_${a}`)],
  ...results.map((r) => [
    r.school, r.state, r.sport, r.stratum, r.id, r.roster_url ? "yes" : "no", r.coach_url ? "yes" : "no",
    r.rosterOutcome, r.coachOutcome, r.players, r.usableRoster ? "yes" : "no", r.coaches,
    r.headCoach ? "yes" : "no", r.headCoach, ...ATTRIBUTES.map((a) => r.attributes[a] ?? ""),
  ]),
]);

const byStratum = new Map<string, Result[]>();
for (const r of results) {
  if (!byStratum.has(r.stratum)) byStratum.set(r.stratum, []);
  byStratum.get(r.stratum)!.push(r);
}
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");
const table: unknown[][] = [[
  "governing_body", "programs_sampled", "with_roster_address", "with_coach_address",
  "roster_page_read", "usable_roster", "usable_roster_pct", "head_coach_found", "head_coach_pct",
]];
for (const [stratum, rows] of [...byStratum.entries()].sort()) {
  const usable = rows.filter((r) => r.usableRoster).length;
  const head = rows.filter((r) => r.headCoach).length;
  table.push([
    stratum, rows.length,
    rows.filter((r) => r.roster_url).length,
    rows.filter((r) => r.coach_url).length,
    rows.filter((r) => r.rosterOutcome.startsWith("page read")).length,
    usable, pct(usable, rows.length), head, pct(head, rows.length),
  ]);
}
const usableAll = results.filter((r) => r.usableRoster).length;
const headAll = results.filter((r) => r.headCoach).length;
table.push(["ALL", results.length,
  results.filter((r) => r.roster_url).length, results.filter((r) => r.coach_url).length,
  results.filter((r) => r.rosterOutcome.startsWith("page read")).length,
  usableAll, pct(usableAll, results.length), headAll, pct(headAll, results.length)]);
write("coverage-100-by-governing-body.csv", table);

console.log(table.map((r) => r.join("\t")).join("\n"));
console.log("measurement only — nothing written to the database");
