/**
 * FULL CRAWL — every program except those marked not_offered.
 *
 * Reads only addresses already on file (athletics, coaching staff, roster). No
 * discovery, no queue release, no school-level re-reading (those facts come from
 * the federal directory). Every write goes through the guarded roster writer, so
 * a page belonging to another school is refused and logged rather than saved.
 *
 * Resumable: each program's outcome is checkpointed as it finishes.
 *
 *   bun tmpscripts/full-crawl.ts [--budget 500] [--workers 6]
 *   bun tmpscripts/full-crawl.ts --quarantine        # one probe per blocked site
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { ingestProgram } from "@/lib/ingest.server";
import {
  loadProtectedHosts,
  probeProtectedHosts,
  watchForProtection,
} from "@/lib/host-protection.server";
import { isHostProtected } from "@/lib/safe-fetch.server";

const STATE = "/tmp/full-crawl-state.json";
const ACTOR = "3a59de05-6a8b-49bb-8b10-9ab281b918df";
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const budgetMs = (Number(arg("budget")) || 500) * 1000;
const workers = Math.min(Math.max(Number(arg("workers")) || 6, 1), 10);
const quarantinePhase = process.argv.includes("--quarantine");
const startedAt = Date.now();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Outcome = {
  id: string;
  school: string;
  state: string;
  sport: string;
  gb: string;
  division: string;
  offering: string;
  rosterUrl: string;
  coachUrl: string;
  athleticUrl: string;
  status: string;
  runId: string | null;
  players: number;
  snapshot: boolean;
  warning: string | null;
  error: string | null;
  pages: { url: string; purpose: string; status: string; detail: string }[];
  reason: string;
};

type State = { pass: string; done: Record<string, Outcome>; quarantine?: unknown };

const PASS = "2026-09-12-full-crawl";
const state: State = existsSync(STATE)
  ? (JSON.parse(readFileSync(STATE, "utf8")) as State)
  : { pass: PASS, done: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state));

/**
 * The checkpoint lives in the database, not in /tmp.
 *
 * The sandbox clears /tmp whenever it restarts, which used to throw the run back
 * to the first team and made completion impossible. Every finished team is now
 * recorded in public.crawl_progress, so a restart resumes where it stopped.
 */
async function loadDoneIds(): Promise<Set<string>> {
  const done = new Set<string>(Object.keys(state.done));
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("crawl_progress")
      .select("program_id")
      .eq("pass", PASS)
      .order("program_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { program_id: string }[];
    for (const row of rows) done.add(row.program_id);
    if (rows.length < 1000) break;
  }
  return done;
}

async function recordDone(outcome: Outcome) {
  const { error } = await sb.from("crawl_progress").upsert(
    {
      pass: PASS,
      program_id: outcome.id,
      status: outcome.status,
      players: outcome.players,
      reason: outcome.reason || null,
      outcome: outcome as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pass,program_id" },
  );
  // A checkpoint write must never lose the work it is recording.
  if (error) console.error(`checkpoint failed for ${outcome.id}: ${error.message}`);
}

async function doneCount(): Promise<number> {
  const { count } = await sb
    .from("crawl_progress")
    .select("program_id", { count: "exact", head: true })
    .eq("pass", PASS);
  return count ?? 0;
}

/* --------------------------------- heartbeat ------------------------------- */
const HEARTBEAT = "/tmp/crawl/heartbeat.json";
const beat = (note: string, total?: number) => {
  try {
    writeFileSync(
      HEARTBEAT,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          epoch: Date.now(),
          pid: process.pid,
          phase: quarantinePhase ? "quarantine" : "main",
          completed: Object.keys(state.done).length,
          total: total ?? null,
          last: note,
        },
        null,
        2,
      ),
    );
  } catch {
    /* heartbeat must never break the crawl */
  }
};

/* ------------------------------ the population ---------------------------- */

type Prog = Omit<Outcome, "status" | "runId" | "players" | "snapshot" | "warning" | "error" | "pages" | "reason">;

async function population(): Promise<Prog[]> {
  const out: Prog[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("programs")
      .select(
        "id, sport, governing_body, division, offering_status, roster_url, coaching_staff_url, athletic_website, universities(name, state)",
      )
      .neq("offering_status", "not_offered")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (const p of rows) {
      out.push({
        id: p.id,
        school: p.universities?.name ?? "unknown",
        state: p.universities?.state ?? "",
        sport: p.sport,
        gb: p.governing_body ?? "unknown",
        division: p.division ?? "",
        offering: p.offering_status,
        rosterUrl: p.roster_url ?? "",
        coachUrl: p.coaching_staff_url ?? "",
        athleticUrl: p.athletic_website ?? "",
      });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Interleave by host so concurrent workers rarely queue behind each other. */
function spreadByHost(list: Prog[]): Prog[] {
  const byHost = new Map<string, Prog[]>();
  for (const p of list) {
    const host = hostOf(p.rosterUrl || p.coachUrl || p.athleticUrl) || p.id;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(p);
  }
  const queues = [...byHost.values()];
  const spread: Prog[] = [];
  for (let round = 0; ; round += 1) {
    let added = false;
    for (const q of queues) {
      const item = q[round];
      if (item) {
        spread.push(item);
        added = true;
      }
    }
    if (!added) break;
  }
  return spread;
}

/* --------------------------------- one program ---------------------------- */

async function crawlOne(p: Prog): Promise<Outcome> {
  const base: Outcome = {
    ...p,
    status: "skipped",
    runId: null,
    players: 0,
    snapshot: false,
    warning: null,
    error: null,
    pages: [],
    reason: "",
  };

  if (!p.rosterUrl && !p.coachUrl && !p.athleticUrl) {
    return { ...base, reason: "no address on file" };
  }

  const urls = [p.athleticUrl, p.coachUrl, p.rosterUrl].filter(Boolean);
  if (urls.every((u) => isHostProtected(u))) {
    return { ...base, reason: "blocked host (quarantined site)" };
  }

  try {
    const outcome = await ingestProgram(sb, ACTOR, p.id, { pages: "athletics" });
    const pages = outcome.urlResults.map((r) => ({
      url: r.url,
      purpose: r.purpose,
      status: r.status,
      detail: String(r.detail ?? "").slice(0, 300),
    }));
    const rosterPage = pages.find((r) => r.purpose === "Roster page");
    const reason = outcome.rosterPlayers
      ? ""
      : !p.rosterUrl
        ? "no roster address on file"
        : rosterPage?.status === "rejected"
          ? "roster write refused (page belongs to another school)"
          : rosterPage && /blocked by the site|blocked_by_host/i.test(rosterPage.detail)
            ? "blocked host"
            : rosterPage && /404|not found/i.test(rosterPage.detail)
              ? "404"
              : rosterPage
                ? "page read but nothing extracted"
                : "roster page not reached";
    return {
      ...base,
      status: outcome.status,
      runId: outcome.runId,
      players: outcome.rosterPlayers,
      snapshot: outcome.snapshotWritten,
      warning: outcome.rosterWarning,
      error: outcome.errorMessage,
      pages,
      reason,
    };
  } catch (failure) {
    return {
      ...base,
      status: "error",
      error: (failure as Error).message.slice(0, 300),
      reason: "collection threw an error",
    };
  }
}

/* ---------------------------------- driver -------------------------------- */

await loadProtectedHosts(sb);
watchForProtection(sb);

if (quarantinePhase) {
  const probe = await probeProtectedHosts(sb, { limit: 200 });
  state.quarantine = probe;
  save();
  console.log(
    JSON.stringify(
      { probed: probe.probed, liftedCount: probe.lifted.length, lifted: probe.lifted },
      null,
      2,
    ),
  );
  if (probe.lifted.length) {
    const lifted = new Set(probe.lifted);
    const all = await population();
    const now = all.filter(
      (p) =>
        [p.athleticUrl, p.coachUrl, p.rosterUrl]
          .filter(Boolean)
          .some((u) => lifted.has(hostOf(u))) && !state.done[p.id]?.players,
    );
    console.log(`${now.length} program(s) on sites that came back — reading them now`);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(workers, now.length) }, async () => {
        while (cursor < now.length && Date.now() - startedAt < budgetMs) {
          const p = now[cursor++]!;
          const result = await crawlOne(p);
          state.done[p.id] = result;
          save();
          console.log(`[lifted] ${result.school} ${result.sport}: ${result.status} ${result.players}p`);
          beat(`[lifted] ${result.school} ${result.sport}`, now.length);
        }
      }),
    );
  }
  console.log("quarantine phase complete");
} else {
  const all = await population();
  const todo = spreadByHost(all.filter((p) => !state.done[p.id]));
  console.log(`population ${all.length}; already done ${Object.keys(state.done).length}; to do ${todo.length}`);

  let cursor = 0;
  let n = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, todo.length) }, async () => {
      while (cursor < todo.length && Date.now() - startedAt < budgetMs) {
        const p = todo[cursor++]!;
        const result = await crawlOne(p);
        state.done[p.id] = result;
        n += 1;
        if (n % 5 === 0) save();
        beat(`${result.school} ${result.sport}: ${result.status}`, all.length);
        if (n % 25 === 0) {
          console.log(
            `${Object.keys(state.done).length}/${all.length} — ${result.school} ${result.sport}: ${result.status} ${result.players}p`,
          );
        }
      }
    }),
  );
  save();
  const done = Object.values(state.done);
  console.log(
    JSON.stringify(
      {
        done: done.length,
        remaining: all.length - done.length,
        withPlayers: done.filter((d) => d.players > 0).length,
        refusedRoster: done.filter((d) => d.reason.startsWith("roster write refused")).length,
      },
      null,
      2,
    ),
  );
}
