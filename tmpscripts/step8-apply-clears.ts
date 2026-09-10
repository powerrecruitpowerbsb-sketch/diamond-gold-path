/**
 * STEP 8 apply — clears ONLY the rows marked "clear" in step8-change-list.csv.
 * Nothing marked keep, flag or hold-record-fix is touched.
 *
 * Safety: aborts unless the clear count is exactly 363. Every clear is archived
 * in link_clear_archive under a single run id (one-operation undo), remembered as
 * declined for that program only, audited, and the program is queued for its own
 * page search in the inert "held" state (the leaser only takes pending/failed/running).
 *
 * Run: bun tmpscripts/step8-apply-clears.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_CLEARS = 363;

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const write = (path: string, rows: string[][]) =>
  writeFileSync(path, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

const linkKey = (value: string): string => {
  try {
    const raw = value.trim();
    if (!raw) return "";
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch { return value.trim().toLowerCase(); }
};

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const rows = parseCsv(readFileSync("/mnt/documents/step8-change-list.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
type Row = Record<string, string>;
const data: Row[] = rows.slice(1).filter((r) => r.length === head.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);

const clears = data.filter((r) => r["action"] === "clear");
if (clears.length !== EXPECTED_CLEARS) {
  throw new Error(`refusing to write: change list has ${clears.length} clear rows, expected ${EXPECTED_CLEARS}`);
}
const schools = new Set(clears.map((r) => r["university_id"]!));
console.log(JSON.stringify({ preflight: { clearRows: clears.length, schools: schools.size } }));

const runId = crypto.randomUUID();
const now = new Date().toISOString();

type Prog = { id: string; athletic_website: string | null; roster_url: string | null; coaching_staff_url: string | null };
const ids = [...new Set(clears.map((r) => r["program_id"]!))];
const progs = new Map<string, Prog>();
for (let i = 0; i < ids.length; i += 200) {
  const { data: page, error } = await sb.from("programs")
    .select("id, athletic_website, roster_url, coaching_staff_url").in("id", ids.slice(i, i + 200));
  if (error) throw new Error(error.message);
  for (const p of (page ?? []) as Prog[]) progs.set(p.id, p);
}

const applied: string[][] = [[
  "run_id", "group_id", "school", "university_id", "program_id", "sport", "field",
  "cleared_value", "evidence", "outcome",
]];
let cleared = 0; let skipped = 0;
const clearedSchools = new Set<string>();
const perProgram = new Map<string, Record<string, null>>();

for (const r of clears) {
  const field = r["field"] as "athletic_website" | "roster_url" | "coaching_staff_url";
  const p = progs.get(r["program_id"]!);
  const current = (p?.[field] ?? "").trim();
  if (!p || linkKey(current) !== linkKey(r["current_value"]!)) {
    skipped += 1;
    applied.push([runId, r["group_id"]!, r["school"]!, r["university_id"]!, r["program_id"]!, r["sport"]!,
      field, r["current_value"]!, r["basis"]!, `skipped — stored value is now "${current}"`]);
    continue;
  }
  const evidence = `${r["determination"]}; ${r["basis"]}; group ${r["group_id"]} on ${r["shared_address"]} — ${r["group_members_and_determinations"]}`;
  const { error: aErr } = await sb.from("link_clear_archive").insert({
    run_id: runId, university_id: r["university_id"], program_id: p.id, field,
    prior_value: current, group_id: r["group_id"], shared_address: r["shared_address"],
    determination: r["determination"], evidence,
  });
  if (aErr) throw new Error(`archive failed: ${aErr.message}`);

  perProgram.set(p.id, { ...(perProgram.get(p.id) ?? {}), [field]: null });
  const { error: uErr } = await sb.from("programs")
    .update({ [field]: null, updated_at: now }).eq("id", p.id).eq(field, current);
  if (uErr) throw new Error(`update failed: ${uErr.message}`);

  // declined memory, scoped to this program only
  await sb.from("rejected_values").insert({
    table_name: "programs", record_id: p.id, field_name: field,
    normalized_value: linkKey(current),
    reason: `cleared in collision remediation run ${runId}: ${r["determination"]}`,
  });
  await sb.from("audit_log").insert({
    table_name: "programs", record_id: p.id, field_name: field,
    old_value: current, new_value: null, action: "update",
  });
  cleared += 1;
  clearedSchools.add(r["university_id"]!);
  applied.push([runId, r["group_id"]!, r["school"]!, r["university_id"]!, p.id, r["sport"]!,
    field, current, evidence, "cleared"]);
}

// park a re-search job per affected program, inert (held is never leased)
const { data: existing, error: qErr } = await sb.from("ingest_queue")
  .select("id, program_id, status").eq("stage", "url_discovery").in("program_id", [...perProgram.keys()]);
if (qErr) throw new Error(qErr.message);
const byProgram = new Map((existing ?? []).map((q: any) => [q.program_id as string, q]));
let queuedHeld = 0;
for (const programId of perProgram.keys()) {
  const row = byProgram.get(programId);
  if (row) {
    if (row.status === "held") { queuedHeld += 1; continue; }
    const { error } = await sb.from("ingest_queue")
      .update({ status: "held", leased_at: null, updated_at: now }).eq("id", row.id);
    if (error) throw new Error(error.message);
  } else {
    const { data: prog } = await sb.from("programs").select("university_id").eq("id", programId).maybeSingle();
    const { error } = await sb.from("ingest_queue").insert({
      program_id: programId, university_id: (prog as any)?.university_id ?? null,
      stage: "url_discovery", status: "held",
    });
    if (error) throw new Error(error.message);
  }
  queuedHeld += 1;
}

write("/mnt/documents/step8-clears-applied.csv", applied);

const { count: heldCount } = await sb.from("ingest_queue")
  .select("id", { count: "exact", head: true }).eq("stage", "url_discovery").eq("status", "held");
const { count: leasable } = await sb.from("ingest_queue")
  .select("id", { count: "exact", head: true }).eq("stage", "url_discovery")
  .in("status", ["pending", "failed", "running"]).in("program_id", [...perProgram.keys()]);

console.log(JSON.stringify({
  runId, cleared, skipped, schoolsAffected: clearedSchools.size,
  programsQueuedHeld: queuedHeld, urlDiscoveryHeldTotal: heldCount,
  leasableRowsAmongClearedPrograms: leasable,
}, null, 1));
