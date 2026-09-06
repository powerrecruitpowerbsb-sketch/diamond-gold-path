/**
 * Audit every stored coach name against the evidence guards, and (with --apply)
 * clear the ones whose recorded source cannot prove the sport and the school,
 * requeueing those programs for a fresh pull from a proven staff page.
 *
 * Run: bun tmpscripts/coach-audit.ts [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { COACH_FIELDS, coachEvidenceVerdict } from "../src/lib/coach-quality";

const apply = process.argv.includes("--apply");
const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function all(table: string, select: string, filter: (q: any) => any) {
  const rows: any[] = [];
  for (let page = 0; ; page += 1) {
    const query = filter(supabase.from(table).select(select)).range(page * 1000, page * 1000 + 999);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

const programs = await all(
  "programs",
  "id, sport, division, head_coach_name, recruiting_coordinator_name, coaching_staff_url, athletic_website, universities(name, website_url)",
  (q) => q.or("head_coach_name.not.is.null,recruiting_coordinator_name.not.is.null"),
);

const sources = await all("data_field_sources", "record_id, field_name, source_url", (q) =>
  q.eq("table_name", "programs").in("field_name", [...COACH_FIELDS]),
);
const sourceMap = new Map(sources.map((s) => [`${s.record_id}:${s.field_name}`, s.source_url]));

type Row = { id: string; field: string; label: string; value: string; url: string | null; reason: string };
const bad: Row[] = [];
const flagged: Row[] = [];
let ok = 0;

for (const program of programs) {
  for (const field of COACH_FIELDS) {
    const value = program[field];
    if (!value) continue;
    const sourceUrl = sourceMap.get(`${program.id}:${field}`) ?? program.coaching_staff_url ?? null;
    const verdict = coachEvidenceVerdict({
      value,
      sourceUrl,
      sport: program.sport,
      athleticWebsite: program.athletic_website,
      coachingStaffUrl: program.coaching_staff_url,
      schoolWebsite: program.universities?.website_url ?? null,
    });
    const row: Row = {
      id: program.id,
      field,
      label: `${program.universities?.name ?? "?"} ${program.sport}`,
      value,
      url: sourceUrl,
      reason: verdict.reason ?? "unproven",
    };
    if (verdict.ok) ok += 1;
    else if (verdict.severity === "flag") flagged.push(row);
    else bad.push(row);
  }
}

console.log(
  `stored coach names: ${ok + bad.length + flagged.length} — proven ${ok}, unproven ${bad.length}, to check by hand ${flagged.length}`,
);
const byReason = new Map<string, number>();
for (const row of [...bad, ...flagged]) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
console.log([...byReason.entries()].sort((a, b) => b[1] - a[1]));
for (const row of bad.slice(0, 15)) console.log(" -", row.label, "|", row.value, "|", row.reason, "|", row.url);

if (!apply) {
  console.log("dry run — pass --apply to clear these and requeue the programs");
  process.exit(0);
}

let cleared = 0;
for (const row of bad) {
  const { error } = await supabase.from("programs").update({ [row.field]: null }).eq("id", row.id);
  if (error) throw error;
  await supabase
    .from("data_field_sources")
    .delete()
    .eq("table_name", "programs")
    .eq("record_id", row.id)
    .eq("field_name", row.field);
  cleared += 1;
}

const programIds = [...new Set(bad.map((row) => row.id))];
let requeued = 0;
for (const programId of programIds) {
  const { data: existing } = await supabase
    .from("ingest_queue")
    .select("id")
    .eq("program_id", programId)
    .eq("stage", "program_scrape")
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("ingest_queue")
      .update({ status: "pending", attempts: 0, leased_at: null, last_error: null })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("ingest_queue")
      .insert([{ program_id: programId, stage: "program_scrape", status: "pending" }]);
  }
  requeued += 1;
}
console.log(`cleared ${cleared} unproven names; requeued ${requeued} programs for a proven pull`);
