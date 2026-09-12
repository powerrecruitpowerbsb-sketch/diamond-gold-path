/**
 * Applies the reviewed restoration: universities.website_url is set back to the
 * federal record's institutional website wherever the stored domain differs.
 * Nothing else is touched — athletics, roster and coach addresses stay put.
 * Every change is recorded under one run id so the batch can be undone at once.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const dom = (url: string | null) => (url ? registrableDomain(hostOf(url)) || "" : "");
const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function pageAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table as any)
      .select(columns)
      .order(order)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type School = { id: string; name: string; state: string | null; website_url: string | null; ipeds_unitid: number | null };
type Fed = { unitid: number; website: string | null };

const schools = await pageAll<School>("universities", "id, name, state, website_url, ipeds_unitid", "name");
const federal = await pageAll<Fed>("federal_directory", "unitid, website", "unitid");
const fedById = new Map(federal.map((f) => [Number(f.unitid), f.website]));

const targets = schools
  .filter((s) => s.ipeds_unitid)
  .map((s) => ({ school: s, federalWebsite: fedById.get(Number(s.ipeds_unitid)) ?? null }))
  .filter((t) => {
    if (!t.federalWebsite) return false;
    const stored = dom(t.school.website_url);
    const fed = dom(t.federalWebsite);
    return Boolean(fed) && stored !== fed;
  });

console.log("schools with a federal id:", schools.filter((s) => s.ipeds_unitid).length);
console.log("about to restore website_url for:", targets.length);
if (targets.length !== 1562) {
  console.log("COUNT DOES NOT MATCH THE REVIEWED 1562 — nothing written.");
  process.exit(1);
}

const runId = randomUUID();
console.log("archive run id:", runId);

const applied: string[][] = [];
const failed: string[][] = [];

for (const { school, federalWebsite } of targets) {
  const { error: archiveError } = await supabaseAdmin.from("university_website_archive" as any).insert({
    run_id: runId,
    university_id: school.id,
    prior_value: school.website_url,
    new_value: federalWebsite,
    note: "step10 restore of institutional website from the federal record",
  } as any);
  if (archiveError) {
    failed.push([school.name, school.state ?? "", String(school.ipeds_unitid), school.website_url ?? "", federalWebsite!, `archive: ${archiveError.message}`]);
    continue;
  }
  const { error } = await supabaseAdmin
    .from("universities")
    .update({ website_url: federalWebsite, updated_at: new Date().toISOString() } as any)
    .eq("id", school.id);
  if (error) {
    failed.push([school.name, school.state ?? "", String(school.ipeds_unitid), school.website_url ?? "", federalWebsite!, error.message]);
    continue;
  }
  applied.push([school.name, school.state ?? "", String(school.ipeds_unitid), school.website_url ?? "", federalWebsite!]);
}

// Verify by re-reading.
const after = await pageAll<School>("universities", "id, name, state, website_url, ipeds_unitid", "name");
const stillMismatched = after.filter((s) => {
  if (!s.ipeds_unitid) return false;
  const fed = dom(fedById.get(Number(s.ipeds_unitid)) ?? null);
  return Boolean(fed) && dom(s.website_url) !== fed;
}).length;

console.log("restored:", applied.length);
console.log("failed:", failed.length);
console.log("mismatches remaining after the run:", stillMismatched);

writeFileSync(
  "/mnt/documents/step10-website-restore-applied.csv",
  [
    ["school", "state", "institution_id", "previous_website", "restored_website", "archive_run_id"].join(","),
    ...applied.map((r) => [...r, runId].map(csv).join(",")),
  ].join("\n") + "\n",
);
if (failed.length) {
  writeFileSync(
    "/mnt/documents/step10-website-restore-failed.csv",
    [
      ["school", "state", "institution_id", "stored_website", "federal_website", "reason"].join(","),
      ...failed.map((r) => r.map(csv).join(",")),
    ].join("\n") + "\n",
  );
}
