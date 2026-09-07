/**
 * Fetch every stored roster and staff page once and make it prove whose team it is.
 *
 * Proven pages are kept, wrong-school and non-varsity pages are cleared and sent
 * back to search, and anything unclear is written to the exception list.
 *
 * Run: bun tmpscripts/link-audit-run.ts [--dry] [--rounds 400]
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { auditStoredLinks } from "../src/lib/link-audit.server";

const args = process.argv.slice(2);
const apply = !args.includes("--dry");
const roundsAt = args.indexOf("--rounds");
const rounds = roundsAt === -1 ? 400 : Number(args[roundsAt + 1]);

const statePath = "/tmp/link-audit-state.json";
const logPath = "/tmp/link-audit.log";
const exceptionsPath = "/mnt/documents/link-audit-exceptions.csv";

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let cursor: string | null = null;
const totals = { checked: 0, confirmed: 0, cleared: 0, unclear: 0, failed: 0 };
try {
  const saved = JSON.parse(readFileSync(statePath, "utf8"));
  cursor = saved.cursor ?? null;
  Object.assign(totals, saved.totals ?? {});
} catch {
  writeFileSync(exceptionsPath, "school,sport,page,url,verdict,reason\n");
}

const csv = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

for (let round = 0; round < rounds; round += 1) {
  const result = await auditStoredLinks(supabase, {
    apply,
    limit: 20,
    budgetMs: 90_000,
    cursor,
  });
  cursor = result.nextCursor;
  totals.checked += result.checked;
  totals.confirmed += result.confirmed;
  totals.cleared += result.cleared;
  totals.unclear += result.unclear;
  totals.failed += result.failed;

  const exceptions = result.rows.filter((row) => row.verdict === "unclear" || row.verdict === "failed");
  if (exceptions.length) {
    appendFileSync(
      exceptionsPath,
      exceptions
        .map((row) =>
          [row.school, row.sport, row.field === "roster_url" ? "roster" : "coaches", row.url, row.verdict, row.reason]
            .map(csv)
            .join(","),
        )
        .join("\n") + "\n",
    );
  }
  for (const row of result.rows.filter((r) => r.verdict === "wrong_school" || r.verdict === "non_varsity")) {
    appendFileSync(logPath, `DROPPED ${row.school} ${row.sport} ${row.field}: ${row.url} — ${row.reason}\n`);
  }

  appendFileSync(logPath, `round ${round + 1}: ${JSON.stringify(totals)} cursor ${cursor}\n`);
  writeFileSync(statePath, JSON.stringify({ cursor, totals }));
  if (!result.moreWaiting && !result.checked) break;
  if (!apply) break;
}

appendFileSync(logPath, `done: ${JSON.stringify(totals)}\n`);
console.log("done", totals);
