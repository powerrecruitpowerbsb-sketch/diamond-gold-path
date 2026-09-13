/**
 * Re-read ONLY the programs whose stored rosters are missing positions, so the
 * widened wording list can be applied without touching the rest of the database.
 *
 * Cohort: programs with a roster address on file where at least half the stored
 * players carry no position.
 *
 *   bun tmpscripts/position-reread.ts [--budget 500] [--workers 6]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { isHostProtected } from "@/lib/safe-fetch.server";
import { loadProtectedHosts } from "@/lib/host-protection.server";

const STATE = "/tmp/position-reread.json";
const ACTOR = "3a59de05-6a8b-49bb-8b10-9ab281b918df";
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const budgetMs = (Number(arg("budget")) || 500) * 1000;
const workers = Math.min(Math.max(Number(arg("workers")) || 6, 1), 10);
const startedAt = Date.now();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Done = Record<string, { status: string; players: number; error: string | null }>;
const done: Done = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(done));

const COHORT = "/tmp/position-cohort.json";
if (!existsSync(COHORT)) {
  // Programs with a roster address where at least half the stored players carry
  // no position — the cohort the widened wording list can actually help.
  const tally = new Map<string, { n: number; withPos: number }>();
  for (let page = 0; ; page += 1) {
    const { data, error } = await sb
      .from("roster_players")
      .select("program_id, position")
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const key = String((row as any).program_id);
      const entry = tally.get(key) ?? { n: 0, withPos: 0 };
      entry.n += 1;
      if ((row as any).position) entry.withPos += 1;
      tally.set(key, entry);
    }
    if (!data || data.length < 1000) break;
  }

  const ids = [...tally.entries()]
    .filter(([, entry]) => entry.withPos < entry.n * 0.5)
    .map(([id]) => id);
  const rows: { id: string; roster_url: string | null }[] = [];
  for (let at = 0; at < ids.length; at += 200) {
    const { data: programs } = await sb
      .from("programs")
      .select("id, roster_url")
      .in("id", ids.slice(at, at + 200))
      .not("roster_url", "is", null);
    rows.push(...((programs ?? []) as any[]));
  }
  writeFileSync(COHORT, JSON.stringify(rows));
}
const cohort: { id: string; roster_url: string | null }[] = JSON.parse(readFileSync(COHORT, "utf8"));


await loadProtectedHosts(sb);

const queue = cohort.filter((row) => !done[row.id]);
console.log(`cohort ${cohort.length}, remaining ${queue.length}`);

let cursor = 0;
async function worker() {
  while (cursor < queue.length && Date.now() - startedAt < budgetMs) {
    const row = queue[cursor++]!;
    if (row.roster_url && (await isHostProtected(new URL(row.roster_url).hostname))) {
      done[row.id] = { status: "quarantined host", players: 0, error: null };
      save();
      continue;
    }
    try {
      const outcome: any = await ingestProgram(sb, ACTOR, row.id, { pages: "athletics" });
      done[row.id] = {
        status: outcome?.status ?? "done",
        players: Number(outcome?.players ?? 0),
        error: outcome?.error ?? null,
      };
    } catch (error: any) {
      done[row.id] = { status: "failed", players: 0, error: String(error?.message ?? error) };
    }
    save();
    if (Object.keys(done).length % 25 === 0) {
      console.log(`${Object.keys(done).length}/${cohort.length}`);
    }
  }
}

await Promise.all(Array.from({ length: workers }, worker));
console.log(`finished pass: ${Object.keys(done).length}/${cohort.length} handled`);
