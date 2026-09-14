/**
 * Offline re-split of stored hometowns.
 *
 * The period-abbreviation bug ("Cary, N.C.") left a state blank on players whose
 * page did print one. The hometown text was kept verbatim, so the state can be
 * recovered from what we already hold — no page is re-read.
 *
 * Run: bun tmpscripts/hometown-resplit.ts [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { splitHometown } from "../src/lib/hometown-split";

const apply = process.argv.includes("--apply");
const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Row = { id: string; hometown: string | null; home_state: string | null; home_country: string | null };

const rows: Row[] = [];
const page = 1000;
for (let from = 0; ; from += page) {
  const { data, error } = await supabase
    .from("roster_players")
    .select("id, hometown, home_state, home_country")
    .not("hometown", "is", null)
    .or("home_state.is.null,home_country.is.null")
    .range(from, from + page - 1);
  if (error) throw error;
  if (!data?.length) break;
  rows.push(...(data as Row[]));
  if (data.length < page) break;
}

const changes: Array<{ id: string; state: string | null; country: string | null }> = [];
const gainedState = new Map<string, number>();
const stillUnknown = new Map<string, number>();

for (const row of rows) {
  const parts = splitHometown(row.hometown);
  const state = row.home_state ?? parts.state;
  const country = row.home_country ?? parts.country;
  if (state !== row.home_state || country !== row.home_country) {
    changes.push({ id: row.id, state, country });
    if (state && !row.home_state) gainedState.set(state, (gainedState.get(state) ?? 0) + 1);
  } else if (!state) {
    const tail = String(row.hometown).split(",").pop()!.trim().slice(0, 40);
    stillUnknown.set(tail, (stillUnknown.get(tail) ?? 0) + 1);
  }
}

console.log(`candidates ${rows.length}, would change ${changes.length}`);
console.log(
  `states gained: ${[...gainedState.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ")}`,
);
console.log("still unrecognised tails (top 40):");
for (const [tail, n] of [...stillUnknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${n}\t${tail}`);
}
console.log(`unrecognised distinct tails: ${stillUnknown.size}`);

if (!apply) {
  console.log("dry run — nothing written");
  process.exit(0);
}

let done = 0;
for (let at = 0; at < changes.length; at += 25) {
  const batch = changes.slice(at, at + 25);
  await Promise.all(
    batch.map((change) =>
      supabase
        .from("roster_players")
        .update({ home_state: change.state, home_country: change.country })
        .eq("id", change.id)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );
  done += batch.length;
  if (done % 500 === 0) console.log(`updated ${done}/${changes.length}`);
}
console.log(`applied ${done} player records`);
