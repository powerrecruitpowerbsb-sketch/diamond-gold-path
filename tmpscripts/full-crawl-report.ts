/**
 * Reports for the full crawl. Read-only: queries the checkpoint file and the
 * database, writes CSVs to /mnt/documents. Writes nothing to the database.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Outcome = {
  id: string; school: string; state: string; sport: string; gb: string; division: string;
  offering: string; rosterUrl: string; coachUrl: string; athleticUrl: string; status: string;
  runId: string | null; players: number; snapshot: boolean; warning: string | null;
  error: string | null; pages: { url: string; purpose: string; status: string; detail: string }[];
  reason: string;
};
const state = JSON.parse(readFileSync("/tmp/full-crawl-state.json", "utf8")) as {
  done: Record<string, Outcome>;
  quarantine?: { probed: number; lifted: string[] };
};
const done = Object.values(state.done);

mkdirSync("/mnt/documents", { recursive: true });
const csv = (name: string, header: string[], rows: (string | number | null)[][]) => {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(
    `/mnt/documents/${name}`,
    [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n",
  );
  console.log(`wrote /mnt/documents/${name} (${rows.length} rows)`);
};

const page = (o: Outcome, purpose: string) => o.pages.find((p) => p.purpose === purpose);

/* ---- pull DB state for the crawled programs ---- */
async function all<T>(table: string, select: string, tweak?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).order("id", { ascending: true }).range(from, from + 999);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const progs = await all<any>("programs", "id, sport, governing_body, division, offering_status, head_coach_name, roster_url, coaching_staff_url, universities(name, state)", (q) => q.neq("offering_status", "not_offered"));
const players = await all<any>("roster_players", "id, program_id, bats, throws, class_year, is_transfer, is_juco_transfer, home_state, home_country, reader, source_url, position, hometown");
const snaps = await all<any>("roster_snapshots", "id, program_id, reader, suspect, suspect_reason, pulled_at");
const refusals = await all<any>("roster_write_refusals", "id, program_id, kind, reason, source_url, source_domain, rows_refused, holder_detail, university_id, status");

const byProg = new Map<string, any[]>();
for (const p of players) {
  if (!byProg.has(p.program_id)) byProg.set(p.program_id, []);
  byProg.get(p.program_id)!.push(p);
}
const progById = new Map(progs.map((p) => [p.id, p]));

/* ---------------- 1. coverage by governing body ---------------- */
type Cov = { programs: number; roster: number; head: number; rosterUrl: number; coachUrl: number };
const cov = new Map<string, Cov>();
const key = (p: any) =>
  (p.governing_body ?? "unknown") === "NCAA" ? `NCAA ${p.division || "?"}` : (p.governing_body ?? "unknown");
for (const p of progs) {
  const k = key(p);
  if (!cov.has(k)) cov.set(k, { programs: 0, roster: 0, head: 0, rosterUrl: 0, coachUrl: 0 });
  const c = cov.get(k)!;
  c.programs += 1;
  if ((byProg.get(p.id) ?? []).length > 0) c.roster += 1;
  if (p.head_coach_name) c.head += 1;
  if (p.roster_url) c.rosterUrl += 1;
  if (p.coaching_staff_url) c.coachUrl += 1;
}
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
csv(
  "crawl-1-coverage-by-governing-body.csv",
  ["governing_body", "programs", "with_roster_address", "usable_roster", "usable_roster_pct", "head_coach", "head_coach_pct"],
  [...cov.entries()]
    .sort((a, b) => b[1].programs - a[1].programs)
    .map(([k, c]) => [k, c.programs, c.rosterUrl, c.roster, pct(c.roster, c.programs), c.head, pct(c.head, c.programs)]),
);
const tot = [...cov.values()].reduce(
  (a, c) => ({ programs: a.programs + c.programs, roster: a.roster + c.roster, head: a.head + c.head, rosterUrl: a.rosterUrl + c.rosterUrl, coachUrl: a.coachUrl + c.coachUrl }),
  { programs: 0, roster: 0, head: 0, rosterUrl: 0, coachUrl: 0 },
);

/* ---------------- 2. which reader produced each roster ---------------- */
const readerRows = new Map<string, number>();
for (const p of players) readerRows.set(p.reader ?? "unrecorded", (readerRows.get(p.reader ?? "unrecorded") ?? 0) + 1);
const readerProgs = new Map<string, Set<string>>();
for (const p of players) {
  const r = p.reader ?? "unrecorded";
  if (!readerProgs.has(r)) readerProgs.set(r, new Set());
  readerProgs.get(r)!.add(p.program_id);
}
csv(
  "crawl-2-reader-usage.csv",
  ["reader", "programs", "players"],
  [...readerRows.entries()].map(([r, n]) => [r, readerProgs.get(r)!.size, n]),
);

/* ---------------- 3. every refused write ---------------- */
csv(
  "crawl-3-refused-writes.csv",
  ["kind", "school", "state", "sport", "stored_url", "source_domain", "rows_refused", "reason", "holder_detail", "status", "program_id"],
  refusals.map((r) => {
    const p = progById.get(r.program_id);
    return [r.kind, p?.universities?.name ?? "", p?.universities?.state ?? "", p?.sport ?? "", r.source_url, r.source_domain, r.rows_refused, r.reason, r.holder_detail, r.status, r.program_id];
  }),
);

/* ---------------- 4. programs that ended with no data ---------------- */
const nodata = done.filter((o) => o.players === 0);
const bucket = (o: Outcome) => {
  if (o.reason === "no address on file") return "no address on file";
  if (/blocked host|blocked by the site|blocked_by_host/i.test(o.reason)) return "blocked host";
  if (o.reason.startsWith("roster write refused")) return "roster write refused (wrong school)";
  if (o.reason === "no roster address on file") return "no roster address on file";
  const rp = page(o, "Roster page");
  if (rp && /404|not found/i.test(rp.detail + rp.status)) return "404";
  if (o.error) return "error reading page";
  if (rp) return "page read but nothing extracted";
  return "other";
};
const buckets = new Map<string, number>();
for (const o of nodata) buckets.set(bucket(o), (buckets.get(bucket(o)) ?? 0) + 1);
csv(
  "crawl-4-no-data.csv",
  ["reason_group", "school", "state", "sport", "governing_body", "roster_url", "coach_url", "detail", "program_id"],
  nodata.map((o) => [bucket(o), o.school, o.state, o.sport, o.gb, o.rosterUrl, o.coachUrl, o.reason || o.error || page(o, "Roster page")?.detail || "", o.id]),
);
csv("crawl-4-no-data-summary.csv", ["reason_group", "programs"], [...buckets.entries()].sort((a, b) => b[1] - a[1]));

/* ---------------- 5. roster composition at scale ---------------- */
const count = (f: (p: any) => string | null) => {
  const m = new Map<string, number>();
  for (const p of players) {
    const v = f(p);
    m.set(v ?? "(not published)", (m.get(v ?? "(not published)") ?? 0) + 1);
  }
  return m;
};
const compRows: (string | number)[][] = [];
const addField = (field: string, m: Map<string, number>) => {
  for (const [v, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) compRows.push([field, v, n, pct(n, players.length)]);
};
addField("bats", count((p) => p.bats));
addField("throws", count((p) => p.throws));
addField("class_year", count((p) => p.class_year));
addField("transfer", count((p) => (p.is_transfer ? "transfer" : "not flagged")));
addField("juco_transfer", count((p) => (p.is_juco_transfer ? "juco transfer" : "not flagged")));
addField("home_state", count((p) => p.home_state));
addField("home_country", count((p) => p.home_country));
csv("crawl-5-roster-composition.csv", ["field", "value", "players", "share_of_all_players"], compRows);

/* ---------------- 6. disagreements with the league lists ---------------- */
const notOffered = await all<any>("programs", "id, sport, governing_body, offering_status, offering_source, roster_url, universities(name, state)", (q) => q.eq("offering_status", "not_offered"));
const notOfferedWithPlayers = notOffered.filter((p) => (byProg.get(p.id) ?? []).length > 0);
const offeredNothing = progs.filter((p) => p.offering_status !== "not_offered" && (byProg.get(p.id) ?? []).length === 0 && p.roster_url);
csv(
  "crawl-6-league-disagreements.csv",
  ["disagreement", "school", "state", "sport", "governing_body", "offering_status", "players_on_file", "roster_url", "program_id"],
  [
    ...notOfferedWithPlayers.map((p) => ["marked not_offered but page yields a roster", p.universities?.name, p.universities?.state, p.sport, p.governing_body, p.offering_status, (byProg.get(p.id) ?? []).length, p.roster_url, p.id]),
    ...offeredNothing.map((p) => ["marked offered but yields nothing", p.universities?.name, p.universities?.state, p.sport, p.governing_body, p.offering_status, 0, p.roster_url, p.id]),
  ] as (string | number | null)[][],
);

/* ---------------- 7. head coach outcomes and page titles ---------------- */
const withHead = progs.filter((p) => p.head_coach_name);
const readNoHead = done.filter((o) => {
  const cp = page(o, "Coaching staff page");
  return cp && cp.status !== "rejected" && !progById.get(o.id)?.head_coach_name;
});
csv(
  "crawl-7-head-coach-gaps.csv",
  ["school", "state", "sport", "governing_body", "coach_url", "page_status", "titles_the_page_carried", "program_id"],
  readNoHead.map((o) => {
    const cp = page(o, "Coaching staff page")!;
    return [o.school, o.state, o.sport, o.gb, o.coachUrl, cp.status, cp.detail, o.id];
  }),
);

/* ---------------- quarantine retry ---------------- */
if (state.quarantine) {
  csv("crawl-quarantine-retry.csv", ["host", "result"], (state.quarantine.lifted ?? []).map((h) => [h, "responded — lifted"]));
}

console.log(
  JSON.stringify(
    {
      programs_crawled: done.length,
      total_programs: progs.length,
      usable_roster: tot.roster,
      usable_roster_pct: pct(tot.roster, tot.programs),
      head_coach: tot.head,
      head_coach_pct: pct(tot.head, tot.programs),
      players_on_file: players.length,
      snapshots: snaps.length,
      suspect_snapshots: snaps.filter((s) => s.suspect).length,
      refused_writes: refusals.length,
      no_data: nodata.length,
      no_data_groups: Object.fromEntries(buckets),
      reader_players: Object.fromEntries(readerRows),
      not_offered_with_roster: notOfferedWithPlayers.length,
      offered_no_roster_despite_address: offeredNothing.length,
      head_coach_gaps_pages_read: readNoHead.length,
      quarantine: state.quarantine ? { probed: state.quarantine.probed, lifted: state.quarantine.lifted.length } : null,
    },
    null,
    2,
  ),
);
