/**
 * FEDERAL IMPORT 2 — SAT and ACT ranges from IPEDS Admissions (ADM2023).
 *
 * ADM is the federal admissions survey: 25th and 75th percentile SAT reading,
 * SAT math and composite ACT, plus how many enrolled students submitted each
 * test. Only institutions that use admission test scores are in the survey at
 * all, which is why open-admission community colleges have no row — that is a
 * genuine federal absence, not a gap we can close by crawling.
 *
 * IPEDS holds NO average high-school GPA figure for any institution, so
 * avg_gpa cannot be federally sourced. The report says so explicitly.
 *
 * Averages already on file (avg_sat / avg_act, from College Scorecard) are left
 * alone; this fills the ranges and only gap-fills the averages where empty.
 *
 *   bun tmpscripts/federal-test-scores-import.ts          # report only
 *   bun tmpscripts/federal-test-scores-import.ts --apply  # one reversible run
 *
 * Writes /mnt/documents/federal-test-scores-report.csv and, on apply,
 * federal-test-scores-applied.csv.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const OUT = "/mnt/documents";
const WORK = "/tmp/ipeds";
const FILE = "ADM2023";
const SOURCE_URL = "https://nces.ed.gov/ipeds/datacenter/data/ADM2023.zip";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};
const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));

mkdirSync(WORK, { recursive: true });
if (!existsSync(`${WORK}/${FILE}.zip`)) {
  execFileSync("curl", ["-sfL", "-o", `${WORK}/${FILE}.zip`, SOURCE_URL]);
}
execFileSync("unzip", ["-o", "-q", `${WORK}/${FILE}.zip`, "-d", WORK]);

const csv = readFileSync(`${WORK}/${FILE.toLowerCase()}.csv`, "utf8").trim().split("\n");
const head = csv[0]!.replace(/^\uFEFF/, "").split(",").map((h) => h.replace(/"/g, "").trim());
const idx = (name: string) => {
  const at = head.indexOf(name);
  if (at < 0) throw new Error(`ADM file has no ${name} column`);
  return at;
};
const splitCsv = (line: string) => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

const COLS = {
  unitid: idx("UNITID"),
  satvr25: idx("SATVR25"),
  satvr75: idx("SATVR75"),
  satmt25: idx("SATMT25"),
  satmt75: idx("SATMT75"),
  actcm25: idx("ACTCM25"),
  actcm75: idx("ACTCM75"),
  satnum: idx("SATNUM"),
  actnum: idx("ACTNUM"),
  admcon7: idx("ADMCON7"),
};

const int = (v: string | undefined) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

type Fed = {
  unitid: number;
  sat_reading_25: number | null;
  sat_reading_75: number | null;
  sat_math_25: number | null;
  sat_math_75: number | null;
  act_25: number | null;
  act_75: number | null;
  sat_test_takers: number | null;
  act_test_takers: number | null;
  admcon7: number | null;
};

const fed = new Map<number, Fed>();
for (const line of csv.slice(1)) {
  const cells = splitCsv(line);
  const unitid = Number(cells[COLS.unitid]);
  if (!Number.isFinite(unitid)) continue;
  fed.set(unitid, {
    unitid,
    sat_reading_25: int(cells[COLS.satvr25]),
    sat_reading_75: int(cells[COLS.satvr75]),
    sat_math_25: int(cells[COLS.satmt25]),
    sat_math_75: int(cells[COLS.satmt75]),
    act_25: int(cells[COLS.actcm25]),
    act_75: int(cells[COLS.actcm75]),
    sat_test_takers: int(cells[COLS.satnum]),
    act_test_takers: int(cells[COLS.actnum]),
    admcon7: int(cells[COLS.admcon7]),
  });
}
console.log(`ADM2023: ${fed.size} institutions`);

type School = {
  id: string;
  unitid: number;
  name: string;
  state: string;
  body: string;
  avg_sat: number | null;
  avg_act: number | null;
  avg_gpa: number | null;
  test_optional: string;
};
const schools: School[] = q(
  `select u.id, u.ipeds_unitid, u.name, coalesce(u.state,''),
          coalesce((select string_agg(distinct p.governing_body::text, '+') from programs p where p.university_id = u.id), ''),
          coalesce(u.avg_sat::text,''), coalesce(u.avg_act::text,''), coalesce(u.avg_gpa::text,''), coalesce(u.test_optional::text,'')
     from universities u
    where u.ipeds_unitid is not null and u.retired_at is null`,
).map(([id, unitid, name, state, body, sat, act, gpa, opt]) => ({
  id: id!,
  unitid: Number(unitid),
  name: name!,
  state: state!,
  body: body!,
  avg_sat: sat ? Number(sat) : null,
  avg_act: act ? Number(act) : null,
  avg_gpa: gpa ? Number(gpa) : null,
  test_optional: opt!,
}));

type Plan = {
  school: School;
  patch: Record<string, unknown>;
  verdict: "fills ranges" | "in ADM, no scores reported" | "not in ADM (open admission or no test use)";
};

const plans: Plan[] = [];
for (const school of schools) {
  const row = fed.get(school.unitid);
  if (!row) {
    plans.push({ school, patch: {}, verdict: "not in ADM (open admission or no test use)" });
    continue;
  }
  const patch: Record<string, unknown> = {};
  for (const field of [
    "sat_reading_25",
    "sat_reading_75",
    "sat_math_25",
    "sat_math_75",
    "act_25",
    "act_75",
    "sat_test_takers",
    "act_test_takers",
  ] as const) {
    if (row[field] !== null) patch[field] = row[field];
  }
  if (row.sat_reading_25 && row.sat_math_25) patch["sat_total_25"] = row.sat_reading_25 + row.sat_math_25;
  if (row.sat_reading_75 && row.sat_math_75) patch["sat_total_75"] = row.sat_reading_75 + row.sat_math_75;

  // Gap-fill only: an average already on file stays as it is.
  if (school.avg_sat === null && patch["sat_total_25"] && patch["sat_total_75"]) {
    patch["avg_sat"] = Math.round(((patch["sat_total_25"] as number) + (patch["sat_total_75"] as number)) / 2);
  }
  if (school.avg_act === null && row.act_25 && row.act_75) {
    patch["avg_act"] = Math.round((row.act_25 + row.act_75) / 2);
  }
  // ADMCON7 is the federal "admission test scores" requirement: 1 required,
  // 2 recommended, 3 neither required nor recommended, 5 considered but not
  // required. Only filled where we hold nothing.
  if (school.test_optional === "" && row.admcon7 !== null) {
    if (row.admcon7 === 1) patch["test_optional"] = false;
    else if (row.admcon7 === 3 || row.admcon7 === 5) patch["test_optional"] = true;
  }

  const hasScores = Boolean(row.sat_reading_25 || row.act_25);
  if (Object.keys(patch).length) {
    patch["test_scores_source_url"] = SOURCE_URL;
    patch["test_scores_synced_at"] = new Date().toISOString();
  }
  plans.push({
    school,
    patch,
    verdict: hasScores ? "fills ranges" : "in ADM, no scores reported",
  });
}

const fills = plans.filter((p) => p.verdict === "fills ranges");
const inAdmNoScores = plans.filter((p) => p.verdict === "in ADM, no scores reported");
const notInAdm = plans.filter((p) => p.verdict.startsWith("not in ADM"));
const byBody = (list: Plan[]) => {
  const counts = new Map<string, number>();
  for (const p of list) counts.set(p.school.body || "(no programs)", (counts.get(p.school.body || "(no programs)") ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

console.log(`schools with a federal id: ${schools.length}`);
console.log(`  SAT or ACT range available: ${fills.length}`);
console.log(`  in the admissions survey but reporting no scores: ${inAdmNoScores.length}`);
console.log(`  not in the admissions survey at all: ${notInAdm.length}`);
console.log(`  average GPA fillable from IPEDS: 0 — IPEDS publishes no average GPA figure`);
console.log("no-score schools by governing body:", JSON.stringify(byBody([...inAdmNoScores, ...notInAdm])));

write("federal-test-scores-report.csv", [
  [
    "university_id",
    "ipeds_unitid",
    "school",
    "state",
    "governing_bodies",
    "verdict",
    "sat_reading_25",
    "sat_reading_75",
    "sat_math_25",
    "sat_math_75",
    "sat_total_25",
    "sat_total_75",
    "act_25",
    "act_75",
    "sat_test_takers",
    "act_test_takers",
    "avg_sat_stored",
    "avg_act_stored",
    "avg_gpa_stored",
    "avg_gpa_from_ipeds",
    "fields_to_write",
  ],
  ...plans.map((p) => [
    p.school.id,
    p.school.unitid,
    p.school.name,
    p.school.state,
    p.school.body,
    p.verdict,
    p.patch["sat_reading_25"] ?? "",
    p.patch["sat_reading_75"] ?? "",
    p.patch["sat_math_25"] ?? "",
    p.patch["sat_math_75"] ?? "",
    p.patch["sat_total_25"] ?? "",
    p.patch["sat_total_75"] ?? "",
    p.patch["act_25"] ?? "",
    p.patch["act_75"] ?? "",
    p.patch["sat_test_takers"] ?? "",
    p.patch["act_test_takers"] ?? "",
    p.school.avg_sat ?? "",
    p.school.avg_act ?? "",
    p.school.avg_gpa ?? "",
    "not published by IPEDS",
    Object.keys(p.patch).filter((k) => !k.startsWith("test_scores_")).join(" "),
  ]),
]);

if (!APPLY) {
  console.log("report only — nothing written. Re-run with --apply to import.");
  process.exit(0);
}

const runId = crypto.randomUUID();
console.log(`run ${runId}`);
const applied: unknown[][] = [["university_id", "school", "field", "prior_value", "new_value"]];
let updated = 0;

for (const plan of plans) {
  const fields = Object.keys(plan.patch).filter((f) => !f.startsWith("test_scores_"));
  if (!fields.length) continue;

  const { data: prior, error: readError } = await sb
    .from("universities")
    .select(fields.join(", "))
    .eq("id", plan.school.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  // Never overwrite a value already on file: ranges are new columns, and the
  // averages are gap-fills by construction.
  const patch: Record<string, unknown> = {
    test_scores_source_url: plan.patch["test_scores_source_url"],
    test_scores_synced_at: plan.patch["test_scores_synced_at"],
  };
  for (const field of fields) {
    const existing = (prior as Record<string, unknown> | null)?.[field];
    if (existing !== null && existing !== undefined) continue;
    patch[field] = plan.patch[field];
    applied.push([plan.school.id, plan.school.name, field, "", String(plan.patch[field])]);
  }
  if (Object.keys(patch).length <= 2) continue;

  const { error } = await sb.from("universities").update(patch).eq("id", plan.school.id);

  if (error) throw new Error(`${plan.school.name}: ${error.message}`);
  updated += 1;
  if (updated % 200 === 0) console.log(`updated ${updated}`);
}

write("federal-test-scores-applied.csv", applied);
console.log(`run ${runId}: ${updated} schools updated, ${applied.length - 1} field values written`);
