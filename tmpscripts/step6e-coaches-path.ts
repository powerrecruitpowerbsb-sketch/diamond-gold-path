/**
 * 6E. Test one substitution on the 11 coach pages that answered 404:
 *   /sports/<sport>/roster/coaches  ->  /sports/<sport>/coaches
 *
 * One read per address, no rendering, no retries. READ-ONLY: nothing is written
 * to the database and no stored address is changed.
 *
 * Run: bun tmpscripts/step6e-coaches-path.ts
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
  .select("program_id, university_id, field, url, failure_category, resolved_at")
  .eq("failure_category", "not_found")
  .is("resolved_at", null);
if (error) throw new Error(error.message);

const rows = ((data ?? []) as any[]).filter((r) => /\/roster\/coaches\/?$/i.test(r.url ?? ""));
console.log(`not-found pages: ${(data ?? []).length}; on the retired /roster/coaches path: ${rows.length}`);

const names = new Map<string, string>();
for (const r of rows) {
  if (names.has(r.university_id)) continue;
  const { data: school } = await sb.from("universities").select("name").eq("id", r.university_id).maybeSingle();
  names.set(r.university_id, (school as any)?.name ?? "");
}

const out: string[][] = [["school", "program_id", "field", "stored_url", "candidate_url", "result", "status", "detail"]];
let recovered = 0;
for (const r of rows) {
  const candidate = String(r.url).replace(/\/roster\/coaches\/?$/i, "/coaches");
  const page = await safeFetch(candidate, { tries: 1 });
  const ok = page.ok && Boolean(page.markdown);
  if (ok) recovered += 1;
  out.push([
    names.get(r.university_id) ?? "", r.program_id, r.field, r.url, candidate,
    ok ? "reads fine" : "still no good", String(page.status ?? ""),
    ok ? "" : (page.error ?? page.failure_category ?? ""),
  ]);
  console.log(`${ok ? "OK  " : "no  "} ${candidate}`);
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync("/mnt/documents/step6e-coach-path-test.csv", out.map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(JSON.stringify({ tested: rows.length, recovered, stillBad: rows.length - recovered }, null, 1));
