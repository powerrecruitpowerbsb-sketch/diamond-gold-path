/**
 * Report-only: what position wordings do roster pages actually publish that our
 * normaliser refuses? Reads a sample of the pages whose stored players have no
 * position and tallies the raw cell text.
 *
 * Run: bun tmpscripts/position-wording-survey.ts [limit]
 */
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
import { normalizePosition } from "@/lib/data-quality";

const limit = Number(process.argv[2] ?? 60);

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error } = await supabase.rpc("exec_missing_position_programs" as any).catch(() => ({ data: null, error: null }) as any);
void rows; void error;

// No RPC — derive the list client side.
const { data: players } = await supabase
  .from("roster_players")
  .select("program_id, position")
  .limit(100000);

const tally = new Map<string, { total: number; missing: number }>();
for (const row of players ?? []) {
  const entry = tally.get(row.program_id) ?? { total: 0, missing: 0 };
  entry.total += 1;
  if (!row.position) entry.missing += 1;
  tally.set(row.program_id, entry);
}

const worst = [...tally.entries()]
  .filter(([, v]) => v.missing >= Math.max(5, v.total * 0.5))
  .sort((a, b) => b[1].missing - a[1].missing)
  .slice(0, limit)
  .map(([id]) => id);

const { data: programs } = await supabase
  .from("programs")
  .select("id, sport, roster_url, universities!inner(name)")
  .in("id", worst);

const unmatched = new Map<string, number>();
const hosts = new Map<string, number>();
let pagesRead = 0;

for (const program of programs ?? []) {
  if (!program.roster_url) continue;
  const read = await safeFetch(program.roster_url);
  if (!read.ok) continue;
  pagesRead += 1;
  const shape = parseRoster(read.markdown ?? read.html ?? "", program.sport);
  for (const player of shape.players as any[]) {
    const raw = String(player.position ?? "").trim();
    if (!raw) continue;
    if (normalizePosition(raw)) continue;
    const key = raw.toUpperCase();
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    try {
      const host = new URL(program.roster_url).hostname;
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    } catch {}
  }
}

console.log(`pages read: ${pagesRead} of ${programs?.length ?? 0}`);
console.log("unmatched wordings (count):");
for (const [word, count] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}\t${word}`);
}
