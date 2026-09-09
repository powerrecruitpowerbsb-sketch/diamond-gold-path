/**
 * 6E, approved: swap the 10 retired coach addresses
 *   /sports/<sport>/roster/coaches  ->  /sports/<sport>/coaches
 * Only the rows whose current stored value still matches are touched, each one
 * re-read first, and every change is written to the activity history.
 *
 * Run: bun tmpscripts/step6e-apply.ts
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "../src/lib/safe-fetch.server";
import { loadProtectedHosts } from "../src/lib/host-protection.server";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
await loadProtectedHosts(sb);

const { data, error } = await sb
  .from("unreadable_pages")
  .select("id, program_id, university_id, field, url")
  .eq("failure_category", "not_found")
  .is("resolved_at", null);
if (error) throw new Error(error.message);

const targets = ((data ?? []) as any[]).filter((r) => /\/roster\/coaches\/?$/i.test(r.url ?? ""));
const out: string[][] = [["school", "program_id", "field", "old_url", "new_url", "outcome"]];
let changed = 0;

for (const row of targets) {
  const candidate = String(row.url).replace(/\/roster\/coaches\/?$/i, "/coaches");
  const { data: program } = await sb
    .from("programs")
    .select("id, coaching_staff_url, roster_url, athletic_website, university_id")
    .eq("id", row.program_id)
    .maybeSingle();
  const { data: school } = await sb.from("universities").select("name").eq("id", row.university_id).maybeSingle();
  const name = (school as any)?.name ?? "";
  const field = String(row.field);
  const current = (program as any)?.[field] ?? null;

  if (!program || current !== row.url) {
    out.push([name, row.program_id, field, row.url, candidate, "left alone — the stored address has since changed"]);
    continue;
  }

  const page = await safeFetch(candidate, { tries: 1 });
  if (!page.ok || !page.markdown) {
    out.push([name, row.program_id, field, row.url, candidate, `left alone — did not read (${page.status ?? page.failure_category ?? "no answer"})`]);
    continue;
  }

  const { error: updateError } = await sb
    .from("programs")
    .update({ [field]: candidate, updated_at: new Date().toISOString() })
    .eq("id", row.program_id);
  if (updateError) {
    out.push([name, row.program_id, field, row.url, candidate, `not saved — ${updateError.message}`]);
    continue;
  }

  await sb.from("unreadable_pages").update({ resolved_at: new Date().toISOString() }).eq("id", row.id);
  await sb.from("audit_log").insert({
    table_name: "programs",
    record_id: row.program_id,
    field_name: field,
    old_value: row.url,
    new_value: candidate,
    action: "update",
  });
  changed += 1;
  out.push([name, row.program_id, field, row.url, candidate, "corrected and reads fine"]);
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync("/mnt/documents/step6e-applied.csv", out.map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(JSON.stringify({ candidates: targets.length, corrected: changed }, null, 1));
