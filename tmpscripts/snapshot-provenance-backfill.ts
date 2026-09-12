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
const runId = randomUUID();

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
    if (apply) {
      await sb
        .from("roster_snapshots")
        .update({
          suspect: true,
          suspect_reason: "written before summaries had to name their source page",
          ingest_run_id: runId,
        })
        .eq("id", snap.id);
    }
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

  if (apply) {
    const patch: Record<string, unknown> = { source_domain: verdict.domain, ingest_run_id: runId };
    if (!verdict.ok) {
      patch["suspect"] = true;
      patch["suspect_reason"] = verdict.reason;
    }
    const { error } = await sb.from("roster_snapshots").update(patch).eq("id", snap.id);
    if (error) throw new Error(error.message);
  }
}

writeFileSync("/mnt/documents/snapshot-provenance-backfill.csv", out.join("\n"));
console.log(
  `${apply ? "applied" : "report only"}: ${clean} from the school's own page, ${marked} marked suspect (${noSource} of them name no page at all)`,
);
if (apply) console.log(`run id ${runId}`);
