/**
 * Re-read every oversized stored roster against its own page and replace the
 * stored squad with the proven players only.
 *
 * Run: bun tmpscripts/roster-recheck-run.ts [--dry] [--min 50] [--max 1000]
 */
import { createClient } from "@supabase/supabase-js";
import { recheckRosterSizes } from "../src/lib/roster-recheck.server";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const apply = !args.includes("--dry");
const min = flag("min", 50);
const max = flag("max", 1000);

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let totalChecked = 0;
let totalReplaced = 0;
let totalDropped = 0;

const seen: string[] = [];

for (let round = 0; round < 12; round += 1) {
  const result = await recheckRosterSizes(supabase, {
    apply,
    min,
    max,
    limit: 4,
    budgetMs: 120_000,
    skipKeys: seen,
  });
  totalChecked += result.checked;
  totalReplaced += result.replaced;
  totalDropped += result.droppedPlayers;
  for (const row of result.rows) {
    seen.push(row.key);
    console.log(
      `${row.school} ${row.sport} ${row.season ?? "?"}: before ${row.before}, read ${row.read}, kept ${row.kept}, dropped ${row.dropped} → ${row.outcome}${row.detail ? ` (${row.detail})` : ""}`,
    );
  }
  console.log(`round ${round + 1}: ${result.groupsFound} oversized left, checked ${result.checked}`);
  if (!result.checked) break;
  if (!apply) break;
}


console.log(`done: checked ${totalChecked}, replaced ${totalReplaced}, removed ${totalDropped} player(s)`);
