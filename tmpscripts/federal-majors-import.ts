/**
 * FEDERAL IMPORT 1 — the full CIP list of study programs, per school.
 *
 * Why the old numbers capped at 30: majors were built from the 38 broad
 * degree-field FLAGS in the College Scorecard record (see FEDERAL_MAJOR_FIELDS
 * in src/lib/federal-data.server.ts). 38 buckets is the ceiling, and a school
 * that awards no bachelor's degrees trips none of them, which is why 1,065
 * programs showed zero. No crawling is involved either way.
 *
 * This reads IPEDS Completions (C2023_A, final/revised release) directly: one
 * row per school per CIP code per award level. Undergraduate degree levels only
 * — associate (3) and bachelor's (5). Titles come from the file's own data
 * dictionary, so every major name is a federal name.
 *
 *   bun tmpscripts/federal-majors-import.ts          # report only
 *   bun tmpscripts/federal-majors-import.ts --apply  # writes, resumable
 *
 * Writes /mnt/documents/federal-majors-distribution.csv and, on apply,
 * federal-majors-applied.csv. Resumable through /tmp/federal-majors-state.json.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const OUT = "/mnt/documents";
const WORK = "/tmp/ipeds";
const STATE = "/tmp/federal-majors-state.json";
const SOURCE_URL = "https://nces.ed.gov/ipeds/datacenter/data/C2023_A.zip";
const COMPLETIONS = "C2023_A";

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

/** The 2-digit CIP families, so every major carries a broad grouping too. */
const FAMILIES: Record<string, string> = {
  "01": "Agriculture & Related Sciences",
  "03": "Natural Resources & Conservation",
  "04": "Architecture",
  "05": "Ethnic, Cultural & Gender Studies",
  "09": "Communication & Journalism",
  "10": "Communications Technologies",
  "11": "Computer & Information Sciences",
  "12": "Culinary, Entertainment & Personal Services",
  "13": "Education",
  "14": "Engineering",
  "15": "Engineering Technologies",
  "16": "Foreign Languages & Linguistics",
  "19": "Family & Consumer Sciences",
  "21": "Technology Education",
  "22": "Legal Studies",
  "23": "English Language & Literature",
  "24": "Liberal Arts & Sciences",
  "25": "Library Science",
  "26": "Biological & Biomedical Sciences",
  "27": "Mathematics & Statistics",
  "28": "Military Science",
  "29": "Military Technologies",
  "30": "Multi/Interdisciplinary Studies",
  "31": "Parks, Recreation, Fitness & Kinesiology",
  "32": "Basic Skills",
  "33": "Citizenship Activities",
  "34": "Health-Related Knowledge & Skills",
  "35": "Interpersonal & Social Skills",
  "36": "Leisure & Recreational Activities",
  "37": "Personal Awareness & Self-Improvement",
  "38": "Philosophy & Religious Studies",
  "39": "Theology & Religious Vocations",
  "40": "Physical Sciences",
  "41": "Science Technologies",
  "42": "Psychology",
  "43": "Criminal Justice, Fire & Protective Services",
  "44": "Public Administration & Social Services",
  "45": "Social Sciences",
  "46": "Construction Trades",
  "47": "Mechanic & Repair Technologies",
  "48": "Precision Production",
  "49": "Transportation & Materials Moving",
  "50": "Visual & Performing Arts",
  "51": "Health Professions",
  "52": "Business, Management & Marketing",
  "53": "High School Equivalence",
  "54": "History",
  "60": "Residency Programs",
  "61": "Medical Residency",
};

function ensureFiles() {
  mkdirSync(WORK, { recursive: true });
  const need: [string, string][] = [
    [`${COMPLETIONS}.zip`, `https://nces.ed.gov/ipeds/datacenter/data/${COMPLETIONS}.zip`],
    [`${COMPLETIONS}_Dict.zip`, `https://nces.ed.gov/ipeds/datacenter/data/${COMPLETIONS}_Dict.zip`],
  ];
  for (const [file, url] of need) {
    if (existsSync(`${WORK}/${file}`)) continue;
    console.log(`downloading ${file}`);
    execFileSync("curl", ["-sfL", "-o", `${WORK}/${file}`, url]);
  }
  for (const [file] of need) execFileSync("unzip", ["-o", "-q", `${WORK}/${file}`, "-d", WORK]);
}

/** CIP code -> federal title, straight out of the file's data dictionary. */
function cipTitles(): Map<string, string> {
  const csv = `${WORK}/cip-titles.csv`;
  if (!existsSync(csv)) {
    execFileSync("python3", [
      "-c",
      `import pandas as pd
f = pd.read_excel("${WORK}/C2023_a_dict.xlsx", "Frequencies")
c = f[f.VarName == "CIPCODE"][["CodeValue", "ValueLabel"]].dropna()
c["code"] = c.CodeValue.map(lambda v: "%07.4f" % float(v))
c[["code", "ValueLabel"]].drop_duplicates("code").to_csv("${csv}", index=False, header=False)`,
    ]);
  }
  const map = new Map<string, string>();
  for (const line of readFileSync(csv, "utf8").trim().split("\n")) {
    const comma = line.indexOf(",");
    const code = line.slice(0, comma);
    let title = line.slice(comma + 1).trim();
    if (title.startsWith('"') && title.endsWith('"')) title = title.slice(1, -1).replace(/""/g, '"');
    map.set(code, title.replace(/\.$/, ""));
  }
  return map;
}

type FedRow = { unitid: number; cip: string; levels: string; completions: number };

/**
 * One row per school per CIP code. Degree levels (associate, bachelor's) are
 * what a recruit picks a school for, so those are preferred; a school that
 * awards no undergraduate degree at all — some technical colleges — falls back
 * to its certificate programs rather than showing nothing.
 */
function schoolCips(): FedRow[] {
  const csv = `${WORK}/cip-by-school.csv`;
  if (!existsSync(csv)) {
    execFileSync("duckdb", [
      "-c",
      `copy (
         select cast(UNITID as int) unitid, CIPCODE cip,
                string_agg(distinct case when AWLEVEL='5' then 'bachelors'
                                         when AWLEVEL='3' then 'associate'
                                         else 'certificate' end, '+' order by 1) levels,
                sum(coalesce(try_cast(CTOTALT as int), 0)) completions
           from read_csv_auto('${WORK}/C2023_a_RV.csv', all_varchar=true)
          where MAJORNUM='1' and CIPCODE <> '99' and AWLEVEL in ('1','2','3','4','5','20','21')
          group by 1, 2
       ) to '${csv}' (header, delimiter ',')`,
    ]);
  }

  const rows: FedRow[] = [];
  const lines = readFileSync(csv, "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [unitid, cip, levels, completions] = line.split(",");
    rows.push({
      unitid: Number(unitid),
      cip: (cip ?? "").replace(/"/g, ""),
      levels: (levels ?? "").replace(/"/g, ""),
      completions: Number(completions ?? 0),
    });
  }
  return rows;
}

function distribution(counts: number[]) {
  const buckets = [
    ["0", (n: number) => n === 0],
    ["1-9", (n: number) => n >= 1 && n <= 9],
    ["10-29", (n: number) => n >= 10 && n <= 29],
    ["30-49", (n: number) => n >= 30 && n <= 49],
    ["50-99", (n: number) => n >= 50 && n <= 99],
    ["100+", (n: number) => n >= 100],
  ] as [string, (n: number) => boolean][];
  const sorted = [...counts].sort((a, b) => a - b);
  return {
    rows: buckets.map(([label, test]) => [label, counts.filter(test).length]),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0,
    mean: counts.length ? Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10 : 0,
  };
}

/** majors_count per PROGRAM, exactly as the export computes it. */
function programMajorCounts(): number[] {
  return q(
    `select coalesce(m.c, 0) from programs p
       left join (select university_id, count(*) c from university_majors group by 1) m
              on m.university_id = p.university_id`,
  ).map((r) => Number(r[0]));
}

const before = distribution(programMajorCounts());
console.log(
  `BEFORE  programs=${before.rows.reduce((a, r) => a + Number(r[1]), 0)} min=${before.min} max=${before.max} median=${before.median} mean=${before.mean}`,
);
console.table(Object.fromEntries(before.rows.map(([k, v]) => [k, v])));

ensureFiles();
const titles = cipTitles();
const fed = schoolCips();

// Our schools, by federal id. Retired records are left out.
const schools = new Map<number, { id: string; name: string }>();
for (const [id, unitid, name] of q(
  `select id, ipeds_unitid, name from universities where ipeds_unitid is not null and retired_at is null`,
)) {
  schools.set(Number(unitid), { id: id!, name: name! });
}

const wanted = new Map<string, FedRow[]>();
let unknownTitle = 0;
for (const row of fed) {
  const school = schools.get(row.unitid);
  if (!school) continue;
  if (!titles.has(row.cip)) {
    unknownTitle += 1;
    continue;
  }
  const list = wanted.get(school.id) ?? [];
  list.push(row);
  wanted.set(school.id, list);
}

// Degrees where a school awards any; certificate-only schools keep theirs.
let certificateOnly = 0;
for (const [universityId, rows] of wanted) {
  const degrees = rows.filter((r) => r.levels !== "certificate");
  if (degrees.length) wanted.set(universityId, degrees);
  else certificateOnly += 1;
}
console.log(`${certificateOnly} schools award no undergraduate degree and keep their certificate programs`);


const cips = [...new Set([...wanted.values()].flat().map((r) => r.cip))].sort();
console.log(
  `federal file: ${fed.length} school/CIP rows; ${wanted.size} of our ${schools.size} federal-id schools present; ${cips.length} distinct CIP codes; ${unknownTitle} rows skipped for having no federal title`,
);

const afterCounts = q(`select id, university_id from programs`).map(([, universityId]) => {
  const list = wanted.get(universityId!);
  return list ? list.length : 0;
});
const projected = distribution(afterCounts);

write("federal-majors-distribution.csv", [
  ["bucket", "programs_before", "programs_projected_after"],
  ...before.rows.map(([label, count], i) => [label, count, projected.rows[i]![1]]),
  ["min", before.min, projected.min],
  ["median", before.median, projected.median],
  ["mean", before.mean, projected.mean],
  ["max", before.max, projected.max],
]);

if (!APPLY) {
  console.log(
    `PROJECTED  min=${projected.min} max=${projected.max} median=${projected.median} mean=${projected.mean}`,
  );
  console.table(Object.fromEntries(projected.rows.map(([k, v]) => [k, v])));
  console.log("report only — nothing written. Re-run with --apply to import.");
  process.exit(0);
}

// ---- apply ----------------------------------------------------------------

type State = { runId: string; majorIds?: Record<string, string>; done: string[] };
const state: State = existsSync(STATE)
  ? (JSON.parse(readFileSync(STATE, "utf8")) as State)
  : { runId: crypto.randomUUID(), done: [] };
const save = () => writeFileSync(STATE, JSON.stringify(state));
console.log(`run ${state.runId}`);

// 1. the catalog itself: one majors row per CIP code, tagged federal.
const majorIds = new Map<string, string>(Object.entries(state.majorIds ?? {}));
const missing = cips.filter((cip) => !majorIds.has(cip));
for (let i = 0; i < missing.length; i += 500) {
  const slice = missing.slice(i, i + 500);
  const { data, error } = await sb
    .from("majors")
    .upsert(
      slice.map((cip) => ({
        name: `${titles.get(cip)!} (${cip})`,
        cip_code: cip,
        cip_family: FAMILIES[cip.slice(0, 2)] ?? null,
        category: FAMILIES[cip.slice(0, 2)] ?? null,
        source: "federal_cip",
      })),
      { onConflict: "cip_code" },
    )
    .select("id, cip_code");
  if (error) throw new Error(`majors upsert failed: ${error.message}`);
  for (const row of data ?? []) majorIds.set(row.cip_code as string, row.id as string);
  state.majorIds = Object.fromEntries(majorIds);
  save();
  console.log(`majors ${majorIds.size}/${cips.length}`);
}

// 2. the links, one school at a time so a stop is resumable.
const now = new Date().toISOString();
const done = new Set(state.done);
const applied: unknown[][] = [["university_id", "school", "ipeds_unitid", "cip_links"]];
let links = 0;
const unitidOf = new Map([...schools].map(([unitid, s]) => [s.id, unitid]));

for (const [universityId, rows] of wanted) {
  if (done.has(universityId)) continue;
  for (let i = 0; i < rows.length; i += 1000) {
    const slice = rows.slice(i, i + 1000);
    const { error } = await sb.from("university_majors").upsert(
      slice.map((r) => ({
        university_id: universityId,
        major_id: majorIds.get(r.cip)!,
        source: "federal_cip",
        award_levels: r.levels,
        completions: r.completions,
        synced_at: now,
      })),
      { onConflict: "university_id,major_id" },
    );
    if (error) throw new Error(`link upsert failed for ${universityId}: ${error.message}`);
  }
  links += rows.length;
  done.add(universityId);
  state.done = [...done];
  save();
  applied.push([
    universityId,
    schools.get(unitidOf.get(universityId)!)?.name ?? "",
    unitidOf.get(universityId) ?? "",
    rows.length,
  ]);
  if (done.size % 100 === 0) console.log(`schools ${done.size}/${wanted.size} links ${links}`);
}

write("federal-majors-applied.csv", applied);

const after = distribution(programMajorCounts());
console.log(
  `AFTER  min=${after.min} max=${after.max} median=${after.median} mean=${after.mean}  (source ${SOURCE_URL})`,
);
console.table(Object.fromEntries(after.rows.map(([k, v]) => [k, v])));
write("federal-majors-distribution.csv", [
  ["bucket", "programs_before", "programs_after"],
  ...before.rows.map(([label, count], i) => [label, count, after.rows[i]![1]]),
  ["min", before.min, after.min],
  ["median", before.median, after.median],
  ["mean", before.mean, after.mean],
  ["max", before.max, after.max],
]);
