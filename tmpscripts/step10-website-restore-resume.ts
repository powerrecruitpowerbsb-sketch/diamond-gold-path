/**
 * Finishes the restoration begun under an existing archive run id. Safe to
 * re-run: it only touches schools whose stored website still disagrees with the
 * federal record, and never records the same school twice for this run.
 */
import { writeFileSync } from "node:fs";

import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RUN_ID = process.env["RESTORE_RUN_ID"]!;
if (!RUN_ID) throw new Error("RESTORE_RUN_ID is required");

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

const federal = await pageAll<{ unitid: number; website: string | null }>("federal_directory", "unitid, website", "unitid");
const fedById = new Map(federal.map((f) => [Number(f.unitid), f.website]));
const archived = new Set(
  (await pageAll<{ university_id: string }>("university_website_archive", "university_id", "university_id"))
    .map((r) => r.university_id),
);

async function pending() {
  const schools = await pageAll<School>("universities", "id, name, state, website_url, ipeds_unitid", "name");
  return schools
    .filter((s) => s.ipeds_unitid && s.website_url)
    .map((s) => ({ school: s, federalWebsite: fedById.get(Number(s.ipeds_unitid)) ?? null }))
    .filter((t) => t.federalWebsite && dom(t.federalWebsite) && dom(t.school.website_url) !== dom(t.federalWebsite));
}

const todo = await pending();
console.log("still to restore:", todo.length);

const applied: string[][] = [];
const failed: string[][] = [];

async function one({ school, federalWebsite }: { school: School; federalWebsite: string | null }) {
  const row = [school.name, school.state ?? "", String(school.ipeds_unitid), school.website_url ?? "", federalWebsite!];
  if (!archived.has(school.id)) {
    const { error } = await supabaseAdmin.from("university_website_archive" as any).insert({
      run_id: RUN_ID,
      university_id: school.id,
      prior_value: school.website_url,
      new_value: federalWebsite,
      note: "step10 restore of institutional website from the federal record",
    } as any);
    if (error) {
      failed.push([...row, `archive: ${error.message}`]);
      return;
    }
  }
  const { error } = await supabaseAdmin
    .from("universities")
    .update({ website_url: federalWebsite, updated_at: new Date().toISOString() } as any)
    .eq("id", school.id);
  if (error) failed.push([...row, error.message]);
  else applied.push(row);
}

const BATCH = 25;
for (let i = 0; i < todo.length; i += BATCH) {
  await Promise.all(todo.slice(i, i + BATCH).map(one));
}

const remaining = (await pending()).length;
console.log("restored this pass:", applied.length);
console.log("failed:", failed.length);
console.log("mismatches remaining:", remaining);
const { count } = await supabaseAdmin
  .from("university_website_archive" as any)
  .select("id", { count: "exact", head: true })
  .eq("run_id", RUN_ID);
console.log("archive rows for run:", count);

writeFileSync(
  "/mnt/documents/step10-website-restore-applied.csv",
  [
    ["school", "state", "institution_id", "previous_website", "restored_website", "archive_run_id"].join(","),
    ...applied.map((r) => [...r, RUN_ID].map(csv).join(",")),
  ].join("\n") + "\n",
);
if (failed.length) {
  writeFileSync(
    "/mnt/documents/step10-website-restore-failed.csv",
    [["school", "state", "institution_id", "stored_website", "federal_website", "reason"].join(","), ...failed.map((r) => r.map(csv).join(","))].join("\n") + "\n",
  );
}
