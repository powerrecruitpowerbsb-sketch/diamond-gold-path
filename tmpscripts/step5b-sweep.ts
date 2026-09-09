/**
 * 5B/5C — re-read the 84 schools' previously-failed pages, skipping websites that
 * block automated reading, using the resumable sweep. Safe to run again: it
 * carries on from the last checkpoint instead of starting over.
 *
 * Run: bun tmpscripts/step5b-sweep.ts
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, writeFileSync } from "node:fs";
import { schoolIdsForNames } from "../src/lib/link-audit.server";
import { planSweep, runSweep } from "../src/lib/sweep.server";
import { protectionCoverage } from "../src/lib/host-protection.server";
import { SCHOOLS_84 } from "./schools-84";

const RUN_KEY = "recheck-84-step5";
const csvPath = "/mnt/documents/step5b-recheck-84.csv";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { ids, missing } = await schoolIdsForNames(supabase, SCHOOLS_84);
console.log(`schools named ${SCHOOLS_84.length}, matched ${ids.length}, unmatched ${missing.length}`);

const coverage = await protectionCoverage(supabase);
console.log(`protected websites: ${coverage.hostCount}, programs behind them: ${coverage.programCount}, schools: ${coverage.schoolCount}`);

const plan = await planSweep(supabase, {
  runKey: RUN_KEY,
  label: "84-school re-check, reachable websites only",
  schoolIds: ids,
  onlyPreviouslyFailed: true,
});
console.log("plan", plan);

const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
writeFileSync(csvPath, "school,sport,page,url,outcome,reason,how_it_was_read\n");

for (let round = 0; round < 40; round += 1) {
  const progress = await runSweep(supabase, { runKey: RUN_KEY, budgetMs: 200_000, apply: true });
  if (progress.rows.length) {
    appendFileSync(
      csvPath,
      progress.rows
        .map((row) =>
          [
            row.school,
            row.sport,
            row.field === "roster_url" ? "roster" : "coaches",
            row.url,
            row.verdict === "failed" ? `failed:${row.failureCategory ?? "unknown"}` : row.verdict,
            row.reason,
            row.fetchMethod ?? "",
          ]
            .map(csv)
            .join(","),
        )
        .join("\n") + "\n",
    );
  }
  console.log(`round ${round + 1}`, {
    status: progress.status,
    done: progress.done,
    blocked: progress.blocked,
    failed: progress.failed,
    pending: progress.pending,
    hostsRemaining: progress.hostsRemaining,
    lastHost: progress.lastHost,
  });
  if (progress.status === "finished") break;
}
