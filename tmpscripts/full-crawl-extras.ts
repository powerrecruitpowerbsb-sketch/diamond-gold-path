/**
 * FOLLOW-UP READS FOR THE FULL CRAWL — READ ONLY, NOTHING WRITTEN.
 *
 * Two questions the crawl itself cannot answer:
 *
 *  A. Programs marked not_offered: does the stored roster page nonetheless yield
 *     a squad? A page with a real roster contradicts the league list, but the
 *     league decision is not overturned here — this only reports the conflict.
 *  B. Programs whose coaching-staff page was read but named no head coach: what
 *     titles did the page actually carry?
 *
 * Resumable: results are cached and re-running continues where it stopped.
 *
 *   bun tmpscripts/full-crawl-extras.ts [--budget 500]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { classifyStaffPage, extractCoaches } from "@/lib/coach-extract";
import { parseRoster } from "@/lib/roster-extract";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const STATE = "/tmp/full-crawl-extras.json";
const CRAWL = "/tmp/full-crawl-state.json";
const i = process.argv.indexOf("--budget");
const budgetMs = (Number(i >= 0 ? process.argv[i + 1] : 0) || 500) * 1000;
const startedAt = Date.now();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type NotOffered = {
  id: string; school: string; sport: string; gb: string; rosterUrl: string;
  outcome: string; players: number;
};
type NoHead = {
  id: string; school: string; sport: string; gb: string; coachUrl: string;
  outcome: string; staff: number; titles: string; failure: string;
};
type State = { notOffered: Record<string, NotOffered>; noHead: Record<string, NoHead> };

const state: State = existsSync(STATE)
  ? (JSON.parse(readFileSync(STATE, "utf8")) as State)
  : { notOffered: {}, noHead: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state));

const { data: protection } = await sb
  .from("host_protection")
  .select("host, protection_kind")
  .is("lifted_at", null);
setProtectedHosts((protection ?? []) as any[]);

const outcomeOf = (read: Awaited<ReturnType<typeof safeFetch>>) => {
  if (read.ok) return `page read (${read.fetch_method})`;
  const cat = read.failure_category ?? "unreadable";
  if (cat === "not_found") return "404 — page gone";
  if (cat === "blocked_by_host" || cat === "connection_blocked") return "blocked by host";
  return `unreadable: ${cat}`;
};

async function readPage(url: string, better: (text: string) => boolean) {
  let read = await safeFetch(url);
  let text = read.ok ? (read.markdown ?? read.html ?? "") : "";
  if (read.ok && text && !better(text)) {
    const rendered = await safeFetch(url, { preferRendered: true });
    if (rendered.ok) {
      read = rendered;
      text = rendered.markdown ?? rendered.html ?? "";
    }
  }
  return { read, text };
}

/* ------------------- A. not_offered programs with a roster page ------------ */

const notOfferedRows: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, sport, governing_body, roster_url, universities(name)")
    .eq("offering_status", "not_offered")
    .not("roster_url", "is", null)
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  notOfferedRows.push(...rows);
  if (rows.length < 1000) break;
}
console.log(`not_offered programs with a roster address: ${notOfferedRows.length}`);

for (const p of notOfferedRows) {
  if (state.notOffered[p.id]) continue;
  if (Date.now() - startedAt > budgetMs) {
    save();
    console.log("budget reached during pass A — re-run to continue");
    process.exit(0);
  }
  const { read, text } = await readPage(p.roster_url, (t) => parseRoster(t, p.sport).counts.players > 0);
  const players = read.ok && text ? parseRoster(text, p.sport).players.length : 0;
  state.notOffered[p.id] = {
    id: p.id,
    school: p.universities?.name ?? "unknown",
    sport: p.sport,
    gb: p.governing_body ?? "unknown",
    rosterUrl: p.roster_url,
    outcome: outcomeOf(read),
    players,
  };
  save();
  if (players >= 8) console.log(`conflict: ${state.notOffered[p.id]!.school} ${p.sport} -> ${players} players`);
}

/* ------------- B. coach pages read but no head coach named ---------------- */

const crawl = existsSync(CRAWL) ? JSON.parse(readFileSync(CRAWL, "utf8")) : { done: {} };
const readCoachPage = new Set<string>();
for (const outcome of Object.values(crawl.done ?? {}) as any[]) {
  const page = (outcome.pages ?? []).find((r: any) => r.purpose === "Coaching staff");
  if (page && (page.status === "scraped" || page.status === "empty")) readCoachPage.add(outcome.id);
}

const candidates: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, sport, governing_body, coaching_staff_url, head_coach_name, universities(name)")
    .neq("offering_status", "not_offered")
    .not("coaching_staff_url", "is", null)
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  for (const p of rows) {
    if (!p.head_coach_name && readCoachPage.has(p.id)) candidates.push(p);
  }
  if (rows.length < 1000) break;
}
console.log(`coach pages read with no head coach named: ${candidates.length}`);

for (const p of candidates) {
  if (state.noHead[p.id]) continue;
  if (Date.now() - startedAt > budgetMs) {
    save();
    console.log("budget reached during pass B — re-run to continue");
    process.exit(0);
  }
  const { read, text } = await readPage(p.coaching_staff_url, (t) =>
    extractCoaches(t, p.sport, { url: p.coaching_staff_url }).coaches.length > 0,
  );
  let staff = 0;
  let titles = "";
  let failure = "";
  if (read.ok && text) {
    classifyStaffPage({ url: p.coaching_staff_url, text, sport: p.sport });
    const found = extractCoaches(text, p.sport, { url: p.coaching_staff_url });
    staff = found.coaches.length;
    titles = found.coaches.map((c) => `${c.name} — ${c.title}`).join(" | ").slice(0, 600);
    failure = found.failure ?? "";
  }
  state.noHead[p.id] = {
    id: p.id,
    school: p.universities?.name ?? "unknown",
    sport: p.sport,
    gb: p.governing_body ?? "unknown",
    coachUrl: p.coaching_staff_url,
    outcome: outcomeOf(read),
    staff,
    titles,
    failure,
  };
  save();
}

save();
console.log(
  JSON.stringify(
    {
      notOfferedChecked: Object.keys(state.notOffered).length,
      notOfferedWithRoster: Object.values(state.notOffered).filter((r) => r.players >= 8).length,
      noHeadChecked: Object.keys(state.noHead).length,
    },
    null,
    2,
  ),
);
