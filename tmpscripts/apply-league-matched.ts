/**
 * APPLIES the matched half of the league participation pass (group A).
 *
 * 539 of the 556 matched rows are already verified on file — they are written
 * to the report and left untouched. The pass only changes the rows where the
 * league's own complete member list confirms a sport we had not confirmed:
 *
 *   - offering_status "unverified" → "verified"
 *   - offering_status "not_offered" → "verified" (the league contradicts us)
 *
 * Every prior value is archived in public.program_level_archive under one run
 * id first, so this run can be undone on its own.
 *
 * Run: bun tmpscripts/apply-league-matched.ts [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "@/lib/csv";

const OUT = "/mnt/documents";
const dry = process.argv.includes("--dry");

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

type Row = Record<string, string>;
const rowsOf = (file: string): Row[] => {
  const rows = parseCsv(readFileSync(`${OUT}/${file}`, "utf8"));
  const head = rows[0]!.map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);
};

const runId = crypto.randomUUID();
const now = new Date().toISOString();

const matched = rowsOf("league-a-matched.csv");
const targets = matched.filter((r) => r["proposed_offering_status"] === "verified" && r["program_id"]);
console.log(JSON.stringify({ runId, matched: matched.length, toChange: targets.length, dry }));

// Read the live value rather than trusting the report: the file is a snapshot.
const ids = targets.map((r) => r["program_id"]!);
const stored = new Map<string, string>();
for (let i = 0; i < ids.length; i += 500) {
  const { data, error } = await sb
    .from("programs")
    .select("id, offering_status")
    .in("id", ids.slice(i, i + 500));
  if (error) throw new Error(error.message);
  for (const p of data!) stored.set(p.id, p.offering_status);
}
const missing = ids.filter((id) => !stored.has(id));
if (missing.length) throw new Error(`${missing.length} program(s) in the report are no longer on file`);

const report: unknown[][] = targets.map((r) => [
  r["school_on_file"],
  r["program_id"],
  r["federal_id"],
  r["state"],
  r["governing_body"],
  r["sport"],
  stored.get(r["program_id"]!) ?? "",
  "verified",
  r["league_says"],
  r["matched_method"],
  r["matched_how"],
]);

if (!dry) {
  for (let i = 0; i < targets.length; i += 500) {
    const { error } = await sb.from("program_level_archive").insert(
      targets.slice(i, i + 500).map((r) => ({
        run_id: runId,
        program_id: r["program_id"]!,
        field: "offering_status",
        prior_value: stored.get(r["program_id"]!) ?? null,
        new_value: "verified",
        reason: "league participation list",
      })),
    );
    if (error) throw new Error(`archive failed: ${error.message}`);
  }

  for (const r of targets) {
    const { error } = await sb
      .from("programs")
      .update({
        offering_status: "verified",
        offering_source: "league participation list",
        offering_verified_at: now,
        updated_at: now,
      })
      .eq("id", r["program_id"]!);
    if (error) throw new Error(`update ${r["program_id"]}: ${error.message}`);
  }
}

write(`${dry ? "dryrun-" : ""}league-matched-verified-applied.csv`, [
  ["school", "program_id", "federal_id", "state", "governing_body", "sport",
   "prior_offering_status", "new_offering_status", "league_says", "matched_method", "matched_how"],
  ...report,
]);

const { count } = await sb
  .from("programs")
  .select("id", { count: "exact", head: true })
  .eq("offering_status", "verified");
console.log(JSON.stringify({ runId, changed: dry ? 0 : targets.length, verifiedProgramsNow: count, dry }));
