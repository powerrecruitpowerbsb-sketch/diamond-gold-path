/**
 * REPORTING FOR THE FULL CRAWL — read only.
 *
 * Reads the crawl checkpoint, the follow-up reads, and what the crawl wrote, and
 * emits the seven requested reports as CSVs.
 *
 *   bun tmpscripts/full-crawl-report.ts --since 2026-09-12T21:45:00Z
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OUT = "/mnt/documents";
const argIdx = process.argv.indexOf("--since");
const since = argIdx >= 0 ? process.argv[argIdx + 1]! : new Date(Date.now() - 86_400_000).toISOString();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

async function page(table: string, select: string, shape: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await shape(sb.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/* ------------------------------- the crawl log ---------------------------- */

const crawl = JSON.parse(readFileSync("/tmp/full-crawl-state.json", "utf8"));
const outcomes = Object.values(crawl.done) as any[];
const extras = existsSync("/tmp/full-crawl-extras.json")
  ? JSON.parse(readFileSync("/tmp/full-crawl-extras.json", "utf8"))
  : { notOffered: {}, noHead: {} };

const stratum = (o: any) => {
  const div = String(o.division ?? "").toUpperCase();
  return o.gb === "NCAA"
    ? `NCAA ${/3|III/.test(div) ? "D3" : /2|II/.test(div) ? "D2" : /1|I/.test(div) ? "D1" : "division unrecorded"}`
    : o.gb;
};

/* head coach names as they stand now */
const programs = await page(
  "programs",
  "id, head_coach_name, coaching_staff_url, roster_url, offering_status",
  (q) => q.neq("offering_status", "not_offered").order("id", { ascending: true }),
);
const headByProgram = new Map(programs.map((p) => [p.id, p.head_coach_name as string | null]));

/* ------------------ 1. coverage by governing body -------------------------- */

const SAMPLE = { roster: "45%", head: "26%" };
const groups = new Map<string, any[]>();
for (const o of outcomes) {
  const key = stratum(o);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(o);
}
const coverage: unknown[][] = [[
  "governing body", "programs attempted", "roster address on file", "usable rosters (8+ players)",
  "usable roster %", "head coach named", "head coach %", "100-school sample rosters", "100-school sample head coaches",
]];
let totalUsable = 0;
let totalHead = 0;
for (const [key, list] of [...groups.entries()].sort()) {
  const usable = list.filter((o) => o.players >= 8).length;
  const head = list.filter((o) => (headByProgram.get(o.id) ?? "").trim()).length;
  totalUsable += usable;
  totalHead += head;
  coverage.push([
    key, list.length, list.filter((o) => o.rosterUrl).length, usable, pct(usable, list.length),
    head, pct(head, list.length), SAMPLE.roster, SAMPLE.head,
  ]);
}
coverage.push([
  "ALL", outcomes.length, outcomes.filter((o) => o.rosterUrl).length, totalUsable,
  pct(totalUsable, outcomes.length), totalHead, pct(totalHead, outcomes.length), SAMPLE.roster, SAMPLE.head,
]);
write("crawl-1-coverage-by-governing-body.csv", coverage);

/* ------------------ 2. which reader read each roster ---------------------- */

const snapshots = await page(
  "roster_snapshots",
  "program_id, reader, source_url, suspect, suspect_reason, created_at",
  (q) => q.gte("created_at", since).order("program_id", { ascending: true }),
);
const fallbackReasons = new Map<string, string>();
for (const file of ["/tmp/crawl/run.log", "/tmp/crawl/quarantine.log"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^Roster read \((\w+)\) (\S+?): .*fell back because (.+)$/.exec(line);
    if (m) fallbackReasons.set(m[2]!, m[3]!.trim());
  }
}
const byProgram = new Map(outcomes.map((o) => [o.id, o]));
const readerRows: unknown[][] = [[
  "school", "sport", "governing body", "reader", "roster page", "players written", "fell back because", "marked suspect",
]];
const readerTally = new Map<string, { structural: number; ai: number }>();
for (const s of snapshots) {
  const o = byProgram.get(s.program_id);
  const key = o ? stratum(o) : "unknown";
  if (!readerTally.has(key)) readerTally.set(key, { structural: 0, ai: 0 });
  const t = readerTally.get(key)!;
  if (s.reader === "ai") t.ai += 1;
  else t.structural += 1;
  readerRows.push([
    o?.school ?? "", o?.sport ?? "", key, s.reader ?? "unrecorded", s.source_url,
    o?.players ?? "", fallbackReasons.get(s.source_url) ?? "", s.suspect ? `yes — ${s.suspect_reason}` : "no",
  ]);
}
readerRows.push([]);
readerRows.push(["SUMMARY: governing body", "structural", "AI fallback", "AI share"]);
let ss = 0;
let aa = 0;
for (const [key, t] of [...readerTally.entries()].sort()) {
  ss += t.structural;
  aa += t.ai;
  readerRows.push([key, t.structural, t.ai, pct(t.ai, t.structural + t.ai)]);
}
readerRows.push(["ALL", ss, aa, pct(aa, ss + aa)]);
write("crawl-2-reader-per-roster.csv", readerRows);

/* ------------------ 3. every refused write -------------------------------- */

const refusals = await page(
  "roster_write_refusals",
  "program_id, university_id, kind, source_url, source_domain, holder_detail, reason, rows_refused, created_at",
  (q) => q.gte("created_at", since).order("created_at", { ascending: true }),
);
const suspectSnapshots = snapshots.filter((s) => s.suspect);
const refusalRows: unknown[][] = [[
  "school", "sport", "governing body", "what was refused", "stored address", "domain",
  "domain belongs to", "reason", "rows refused",
]];
for (const r of refusals) {
  const o = byProgram.get(r.program_id);
  refusalRows.push([
    o?.school ?? "", o?.sport ?? "", o ? stratum(o) : "", r.kind, r.source_url, r.source_domain,
    r.holder_detail ?? "", r.reason, r.rows_refused,
  ]);
}
for (const s of suspectSnapshots) {
  const o = byProgram.get(s.program_id);
  refusalRows.push([
    o?.school ?? "", o?.sport ?? "", o ? stratum(o) : "", "composition summary held (written, hidden)",
    s.source_url, "", "", s.suspect_reason ?? "", "",
  ]);
}
write("crawl-3-refused-writes.csv", refusalRows);

/* ------------------ 4. programs that ended with no data ------------------- */

const noData = outcomes.filter((o) => o.players < 8);
const reasonRows: unknown[][] = [[
  "school", "sport", "governing body", "offering status", "reason", "roster address", "coach address", "detail",
]];
const reasonTally = new Map<string, number>();
for (const o of noData) {
  const reason = o.reason || (o.players ? "fewer than 8 players read" : "no roster produced");
  reasonTally.set(reason, (reasonTally.get(reason) ?? 0) + 1);
  const rosterPage = (o.pages ?? []).find((p: any) => p.purpose === "Roster page");
  reasonRows.push([
    o.school, o.sport, stratum(o), o.offering, reason, o.rosterUrl, o.coachUrl,
    rosterPage?.detail ?? o.error ?? "",
  ]);
}
reasonRows.push([]);
reasonRows.push(["SUMMARY: reason", "programs"]);
for (const [reason, n] of [...reasonTally.entries()].sort((a, b) => b[1] - a[1])) reasonRows.push([reason, n]);
write("crawl-4-no-data-by-reason.csv", reasonRows);

/* ------------------ 5. roster composition at scale ------------------------ */

const fresh = await page(
  "roster_players",
  "id, program_id, bats, throws, class_year, is_transfer, is_juco_transfer, home_state, home_country, position, reader",
  (q) => q.gte("extracted_at", since).order("id", { ascending: true }),
);
const share = (rows: any[], test: (r: any) => boolean) => pct(rows.filter(test).length, rows.length);
const spread = (rows: any[], field: string) => {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const key = r[field] === null || r[field] === undefined || r[field] === "" ? "(blank)" : String(r[field]);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
};
const { count: allPlayers } = await sb.from("roster_players").select("id", { count: "exact", head: true });
const compRows: unknown[][] = [["measure", "value", "share of this crawl's players"]];
compRows.push(["players written by this crawl", fresh.length, "100%"]);
compRows.push(["players on file in total", allPlayers ?? 0, ""]);
compRows.push(["programs with players from this crawl", new Set(fresh.map((r) => r.program_id)).size, ""]);
compRows.push(["bats recorded", fresh.filter((r) => r.bats).length, share(fresh, (r) => r.bats)]);
compRows.push(["throws recorded", fresh.filter((r) => r.throws).length, share(fresh, (r) => r.throws)]);
compRows.push(["class year recorded", fresh.filter((r) => r.class_year).length, share(fresh, (r) => r.class_year)]);
compRows.push(["home state recorded", fresh.filter((r) => r.home_state).length, share(fresh, (r) => r.home_state)]);
compRows.push(["home country recorded", fresh.filter((r) => r.home_country).length, share(fresh, (r) => r.home_country)]);
compRows.push(["transfers", fresh.filter((r) => r.is_transfer).length, share(fresh, (r) => r.is_transfer)]);
compRows.push(["JUCO transfers", fresh.filter((r) => r.is_juco_transfer).length, share(fresh, (r) => r.is_juco_transfer)]);
for (const field of ["bats", "throws", "class_year", "position", "home_state", "home_country", "reader"]) {
  compRows.push([]);
  compRows.push([`SPREAD: ${field}`, "players", "share"]);
  for (const [value, n] of spread(fresh, field).slice(0, 60)) compRows.push([value, n, pct(n, fresh.length)]);
}
write("crawl-5-roster-composition.csv", compRows);

/* ------------------ 6. disagreements with the league lists ---------------- */

const leagueRows: unknown[][] = [[
  "disagreement", "school", "sport", "governing body", "address read", "players read", "page outcome",
]];
for (const r of Object.values(extras.notOffered) as any[]) {
  if (r.players >= 8) {
    leagueRows.push(["marked not offered but the page yields a roster", r.school, r.sport, r.gb, r.rosterUrl, r.players, r.outcome]);
  }
}
for (const o of outcomes) {
  if (o.offering !== "not_offered" && o.rosterUrl && o.players === 0) {
    const rosterPage = (o.pages ?? []).find((p: any) => p.purpose === "Roster page");
    leagueRows.push([
      "marked offered but the page yields nothing", o.school, o.sport, stratum(o), o.rosterUrl, 0,
      rosterPage?.detail ?? o.reason,
    ]);
  }
}
write("crawl-6-league-list-disagreements.csv", leagueRows);

/* ------------------ 7. head coach ---------------------------------------- */

const headRows: unknown[][] = [[
  "school", "sport", "governing body", "head coach", "coach address", "staff rows found",
  "titles the page carried", "why no head coach",
]];
let withHead = 0;
for (const o of outcomes) {
  const head = (headByProgram.get(o.id) ?? "").trim();
  if (head) withHead += 1;
}
for (const r of Object.values(extras.noHead) as any[]) {
  headRows.push([r.school, r.sport, r.gb, "", r.coachUrl, r.staff, r.titles, r.failure || r.outcome]);
}
headRows.push([]);
headRows.push(["SUMMARY", "programs"]);
headRows.push(["programs attempted", outcomes.length]);
headRows.push(["ended with a head coach name", withHead]);
headRows.push(["head coach share", pct(withHead, outcomes.length)]);
headRows.push(["coach page read but no head coach named", Object.keys(extras.noHead).length]);
write("crawl-7-head-coach.csv", headRows);

/* --------------------------- quarantine retry ---------------------------- */

const quarantine = crawl.quarantine as { probed: number; lifted: string[]; stillBlocked: string[] } | undefined;
if (quarantine) {
  const qRows: unknown[][] = [["site", "one attempt outcome"]];
  for (const host of quarantine.lifted) qRows.push([host, "responds again — quarantine lifted"]);
  for (const host of quarantine.stillBlocked) qRows.push([host, "still blocking — stays quarantined"]);
  write("crawl-8-quarantined-site-retry.csv", qRows);
}

console.log(
  JSON.stringify(
    {
      programsAttempted: outcomes.length,
      usableRosters: totalUsable,
      usableRosterShare: pct(totalUsable, outcomes.length),
      headCoaches: withHead,
      headCoachShare: pct(withHead, outcomes.length),
      readerStructural: ss,
      readerAi: aa,
      refusedWrites: refusals.length,
      suspectSummaries: suspectSnapshots.length,
      playersWritten: fresh.length,
    },
    null,
    2,
  ),
);
