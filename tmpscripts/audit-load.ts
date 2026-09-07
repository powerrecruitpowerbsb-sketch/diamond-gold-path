/**
 * Load the hand-audited 536-row link file.
 *
 * - corrected states and athletics sites are saved
 * - a corrected deep link is stored on the team
 * - a root-only correction clears the wrong link, remembers it, and sends the
 *   team back to search inside the correct athletics domain
 * - the nine unresolved same-name-school rows are left alone
 *
 * Run: bun tmpscripts/audit-load.ts [--dry]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { clearWrongLink } from "../src/lib/link-repair.server";

const apply = !process.argv.includes("--dry");
const file = "/mnt/user-uploads/stored-team-links-audit-corrected.csv";

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Minimal CSV reader: quoted fields with doubled quotes inside. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** A correction with no path of its own only tells us the right domain. */
function isRootOnly(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, "") === "" && !parsed.search;
  } catch {
    return false;
  }
}

/** Rows the audit could not resolve to one real school — left for a decision. */
const UNRESOLVED = [
  "college of the ozarks",
  "university of the ozarks",
  "lsu new orleans",
  "mississippi christian university",
  "central lakes college",
  "st. thomas university",
  "bryant & stratton",
  "bryant and stratton",
];

const table = parseCsv(readFileSync(file, "utf8"));
const header = table[0]!.map((h) => h.trim());
const at = (name: string) => header.indexOf(name);
const rows = table.slice(1).map((cells) => ({
  school: (cells[at("school")] ?? "").trim(),
  state: (cells[at("state")] ?? "").trim(),
  sport: (cells[at("sport")] ?? "").trim(),
  athletics: (cells[at("athletics_site")] ?? "").trim(),
  rosterFix: (cells[at("roster_url_correction")] ?? "").trim(),
  staffFix: (cells[at("staff_url_correction")] ?? "").trim(),
}));

const counts = {
  rows: rows.length,
  skippedUnresolved: 0,
  unmatched: 0,
  statesFixed: 0,
  sitesFixed: 0,
  deepLinksStored: 0,
  linksCleared: 0,
};
const unmatched: string[] = [];

for (const row of rows) {
  const lowered = row.school.toLowerCase();
  if (UNRESOLVED.some((name) => lowered.includes(name))) {
    counts.skippedUnresolved += 1;
    continue;
  }

  const { data: schools } = await supabase
    .from("universities")
    .select("id, name, state, website_url")
    .ilike("name", row.school)
    .limit(2);
  const school = ((schools ?? []) as any[])[0];
  if (!school || (schools ?? []).length > 1) {
    counts.unmatched += 1;
    unmatched.push(`${row.school} (${row.sport})`);
    continue;
  }

  const { data: programs } = await supabase
    .from("programs")
    .select("id, sport, athletic_website, roster_url, coaching_staff_url")
    .eq("university_id", school.id)
    .eq("sport", row.sport)
    .limit(1);
  const program = ((programs ?? []) as any[])[0];
  if (!program) {
    counts.unmatched += 1;
    unmatched.push(`${row.school} (${row.sport}) — no such program`);
    continue;
  }

  if (row.state && row.state.length === 2 && row.state !== school.state) {
    counts.statesFixed += 1;
    if (apply) await supabase.from("universities").update({ state: row.state }).eq("id", school.id);
  }

  if (row.athletics && row.athletics !== program.athletic_website) {
    counts.sitesFixed += 1;
    if (apply) {
      await supabase
        .from("programs")
        .update({ athletic_website: row.athletics })
        .eq("university_id", school.id);
    }
  }

  const fixes: { field: "roster_url" | "coaching_staff_url"; value: string; stored: string | null }[] = [
    { field: "roster_url", value: row.rosterFix, stored: program.roster_url },
    { field: "coaching_staff_url", value: row.staffFix, stored: program.coaching_staff_url },
  ];

  for (const fix of fixes) {
    if (!fix.value) continue;
    if (fix.value === fix.stored) continue;
    if (isRootOnly(fix.value)) {
      counts.linksCleared += 1;
      if (apply && fix.stored) {
        await clearWrongLink(supabase, {
          programId: program.id,
          universityId: school.id,
          field: fix.field,
          url: fix.stored,
          reason: "Hand audit: this page belongs to a different school or team.",
        });
      }
      continue;
    }
    counts.deepLinksStored += 1;
    if (apply) {
      await supabase.from("programs").update({ [fix.field]: fix.value }).eq("id", program.id);
    }
  }
}

console.log(apply ? "APPLIED" : "DRY RUN", JSON.stringify(counts, null, 2));
if (unmatched.length) console.log(`unmatched (${unmatched.length}):\n${unmatched.slice(0, 40).join("\n")}`);
