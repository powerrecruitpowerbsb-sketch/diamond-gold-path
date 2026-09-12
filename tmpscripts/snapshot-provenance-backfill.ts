/**
 * Composition summaries already on file were written with no source-page check.
 * This fills in each one's source domain and marks the ones whose page belongs to
 * another school as suspect — nothing is deleted, and every change is recorded
 * under one run id so it can be put back.
 *
 * Run: bun tmpscripts/snapshot-provenance-backfill.ts            (report only)
 *      bun tmpscripts/snapshot-provenance-backfill.ts --apply    (writes)
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { checkRosterSource, sourceDomain } from "../src/lib/roster-provenance.server";

const apply = process.argv.includes("--apply");
// Resumable: pass --run <uuid> to carry on an interrupted pass under the same id.
const runArg = process.argv.indexOf("--run");
const runId = runArg > -1 ? process.argv[runArg + 1]! : randomUUID();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Snap = {
  id: string;
  program_id: string;
  season_year: number | null;
  source_url: string | null;
  source_domain: string | null;
  suspect: boolean;
};

const rows: Snap[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("roster_snapshots")
    .select("id, program_id, season_year, source_url, source_domain, suspect")
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...((data ?? []) as Snap[]));
  if ((data ?? []).length < 1000) break;
}

console.log(`${rows.length} composition summaries on file`);

/** One verdict per program+page, so a program with many seasons is checked once. */
const verdicts = new Map<string, { ok: boolean; domain: string; reason: string; holder?: string }>();
const out: string[] = [
  "snapshot_id,program_id,season_year,source_url,source_domain,verdict,reason,holder,action",
];
const pending: { id: string; domain: string; suspect: boolean; reason: string }[] = [];
const done = new Set(rows.filter((r) => r.source_domain !== null || r.suspect).map((r) => r.id));
let noSource = 0;
let clean = 0;
let marked = 0;

for (const snap of rows) {
  const url = (snap.source_url ?? "").trim();
  if (!url) {
    noSource += 1;
    out.push(
      `${snap.id},${snap.program_id},${snap.season_year ?? ""},,,no_source_page,"the summary names no page it was read from",,mark_suspect`,
    );
    pending.push({ id: snap.id, domain: "", suspect: true, reason: "written before summaries had to name their source page" });
    marked += 1;
    continue;
  }

  const key = `${snap.program_id}|${sourceDomain(url)}`;
  let verdict = verdicts.get(key);
  if (!verdict) {
    const checked = await checkRosterSource(sb, snap.program_id, url);
    verdict = {
      ok: checked.ok,
      domain: checked.domain,
      reason: checked.reason,
      holder: checked.ok ? undefined : (checked as any).holder?.name,
    };
    verdicts.set(key, verdict);
  }

  const action = verdict.ok ? "domain_only" : "mark_suspect";
  out.push(
    [
      snap.id,
      snap.program_id,
      snap.season_year ?? "",
      url,
      verdict.domain,
      verdict.ok ? "own_school" : "another_school",
      `"${verdict.reason.replace(/"/g, "'")}"`,
      verdict.holder ?? "",
      action,
    ].join(","),
  );

  if (verdict.ok) clean += 1;
  else marked += 1;

  pending.push({ id: snap.id, domain: verdict.domain, suspect: !verdict.ok, reason: verdict.reason });
}

if (apply) {
  // Rows that share a verdict are written together, so an interrupted pass can be
  // resumed instead of restarted: rows already carrying this run id are skipped.
  const groups = new Map<string, string[]>();
  for (const row of pending) {
    if (done.has(row.id)) continue;
    const key = `${row.suspect ? 1 : 0}|${row.domain}|${row.suspect ? row.reason : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row.id]);
  }
  let written = 0;
  for (const [key, ids] of groups) {
    const [flag, domain, reason] = key.split("|");
    const patch: Record<string, unknown> = { ingest_run_id: runId };
    if (domain) patch["source_domain"] = domain;
    if (flag === "1") { patch["suspect"] = true; patch["suspect_reason"] = reason; }
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb.from("roster_snapshots").update(patch).in("id", chunk);
      if (error) throw new Error(error.message);
      written += chunk.length;
    }
  }
  console.log(`wrote ${written} rows (${done.size} already carried this run id)`);
}

writeFileSync("/mnt/documents/snapshot-provenance-backfill.csv", out.join("\n"));
console.log(
  `${apply ? "applied" : "report only"}: ${clean} from the school's own page, ${marked} marked suspect (${noSource} of them name no page at all)`,
);
if (apply) console.log(`run id ${runId}`);
