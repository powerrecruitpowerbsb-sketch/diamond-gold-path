/**
 * One reversible run: fold Roman-numeral division labels into the standard form,
 * and blank division on programs in bodies that do not use divisions (plus the
 * NAIA rows that carry "NAIA" as a division). Every prior value is archived in
 * public.program_level_archive under a single run id, so the run can be undone.
 *
 * --dry to report without writing.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");
const RUN_ID = process.env["RUN_ID"] ?? crypto.randomUUID();

const NO_DIVISION_BODIES = new Set(["NAIA", "NWAC", "CCCAA"]);
const ROMAN: Record<string, string> = {
  i: "1", ii: "2", iii: "3",
};

/** Standard form for a body that uses divisions, or null when it does not. */
function normalise(body: string | null, raw: string): { value: string | null; reason: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (body && NO_DIVISION_BODIES.has(body)) {
    return { value: null, reason: `${body} does not use divisions` };
  }
  const m = /^(?:ncaa|njcaa)?\s*[-\s]*d[-\s]*([iv]+|\d)$/i.exec(v.replace(/division/i, "D"));
  if (!m) return null;
  const token = m[1]!.toLowerCase();
  const digit = ROMAN[token] ?? token;
  if (!/^[123]$/.test(digit)) return null;
  const std = `D${digit}`;
  if (std === v) return null;
  return { value: std, reason: "roman-numeral or prefixed label folded into the standard form" };

}

const rows: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, sport, division, governing_body, universities(name, state)")
    .not("division", "is", null)
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const changes = rows
  .map((r) => ({ row: r, change: normalise(r.governing_body, String(r.division ?? "")) }))
  .filter((c) => c.change) as { row: any; change: { value: string | null; reason: string } }[];

const esc = (v: any) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
writeFileSync(
  "/mnt/documents/crawl-13-division-normalised.csv",
  [
    ["school", "state", "sport", "governing_body", "old_division", "new_division", "reason", "program_id", "run_id"].join(","),
    ...changes.map((c) =>
      [c.row.universities?.name, c.row.universities?.state, c.row.sport, c.row.governing_body, c.row.division, c.change.value ?? "(blank)", c.change.reason, c.row.id, DRY ? "" : RUN_ID]
        .map(esc)
        .join(","),
    ),
  ].join("\n") + "\n",
);

const groups = new Map<string, number>();
for (const c of changes) {
  const k = `${c.row.governing_body ?? "?"} ${c.row.division} -> ${c.change.value ?? "(blank)"}`;
  groups.set(k, (groups.get(k) ?? 0) + 1);
}

if (!DRY) {
  for (const c of changes) {
    await sb.from("program_level_archive").insert({
      run_id: RUN_ID,
      program_id: c.row.id,
      field: "division",
      prior_value: c.row.division,
      new_value: c.change.value,
      reason: c.change.reason,
    });
    const { error } = await sb.from("programs").update({ division: c.change.value }).eq("id", c.row.id);
    if (error) throw new Error(`${c.row.id}: ${error.message}`);
  }
}

console.log(
  JSON.stringify({ dry: DRY, run_id: DRY ? null : RUN_ID, rows_changed: changes.length, groups: Object.fromEntries([...groups].sort()) }, null, 2),
);
