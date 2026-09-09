/**
 * One pass over ONLY the pages currently in the couldn't-be-read log, for the 84
 * named schools that failed the last run. Nothing wider, nothing recurring.
 *
 * Run: bun tmpscripts/recheck-84.ts
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, writeFileSync } from "node:fs";
import { auditStoredLinks, schoolIdsForNames } from "../src/lib/link-audit.server";

const SCHOOLS = `Allan Hancock College
Amherst College
Baker University
CCBC-Essex
Cayuga Community College
Central Arizona College
Central Baptist College
Centralia College
Chapman University
Citrus College
Colorado Northwestern Community College
Copiah-Lincoln Community College
Covenant College
Crowder College
Cuyahoga Community College
DePauw University
Doane College
Eastfield College
El Camino College
Elon University
Fairleigh Dickinson University, Florham
Fayetteville State University
Gadsden State Community College
Garden City Community College
Gaston College
Georgetown College
Georgetown University
Gettysburg College
Graceland University
Holyoke Community College
Howard College
Illinois College
Illinois Wesleyan University
Imperial Valley College
Indian River State College
Irvine Valley College
Jarvis Christian University
King University
Lackawanna College
Lake Land College
Lansing Community College
Linn–Benton Community College
Lorain County Community College
Los Angeles Harbor College
Los Angeles Valley College
Lyon College
Marietta College
Marion Military Institute
Massachusetts Maritime Academy
McPherson College
Mendocino College
Mesa Community College
Mineral Area College
Mississippi Gulf Coast Community College
Mitchell College
North Idaho College
Ohlone College
Olivet Nazarene University
Otterbein University
Palm Beach State College
Palomar College
Panola College
Patrick & Henry Community College
Penn State University, Altoona
Pima Community College
Ranger College
Rockford University
Seward County Community College
Southern Union State Community College
Spartanburg Methodist College
Sterling College
Sul Ross State University
Surry Community College
Sussex County Community College
Tallahassee Community College
Texas A&M University–San Antonio
Treasure Valley Community College
University of Alabama in Huntsville
University of Pikeville
University of Saint Joseph (Connecticut)
University of Valley Forge
Utica University
Waldorf University
Wallace State Community College`
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const logPath = "/tmp/recheck-84-v2.log";
const csvPath = "/mnt/documents/recheck-84-results-v2.csv";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { ids, missing } = await schoolIdsForNames(supabase, SCHOOLS);
appendFileSync(logPath, `named ${SCHOOLS.length}, matched ${ids.length}, unmatched ${missing.length}: ${missing.join(" | ")}\n`);

const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
writeFileSync(csvPath, "school,sport,page,url,outcome,reason,how_it_was_read\n");

let cursor: string | null = null;
const totals = { checked: 0, confirmed: 0, cleared: 0, unclear: 0, failed: 0 };

for (let round = 0; round < 200; round += 1) {
  const result = await auditStoredLinks(supabase, {
    apply: true,
    schoolIds: ids,
    onlyPreviouslyFailed: true,
    limit: 24,
    budgetMs: 900_000,
    cursor,
  });
  cursor = result.nextCursor;
  totals.checked += result.checked;
  totals.confirmed += result.confirmed;
  totals.cleared += result.cleared;
  totals.unclear += result.unclear;
  totals.failed += result.failed;

  if (result.rows.length) {
    appendFileSync(
      csvPath,
      result.rows
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

  appendFileSync(logPath, `round ${round + 1}: ${JSON.stringify(totals)} cursor ${cursor}\n`);
  if (!result.moreWaiting) break;
}

const attempted = totals.checked + totals.failed;
const rate = attempted ? Math.round((totals.checked / attempted) * 100) : 0;
appendFileSync(logPath, `DONE ${JSON.stringify(totals)} pass rate ${rate}%\n`);
console.log("done", { ...totals, attempted, passRate: `${rate}%`, unmatchedSchools: missing });
