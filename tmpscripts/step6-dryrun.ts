/**
 * 6D. The collision remediation dry run. READ-ONLY: not one row is written.
 *
 * For every collision group we already resolved (by federal-website or NCAA
 * directory domain match) the confirmed non-owner's address is listed to CLEAR
 * and the owner's is listed to KEEP, still unverified. Every group that stayed
 * ambiguous is listed to FLAG: kept, conflicted, withheld from the product.
 *
 * Each row carries its whole group so the call is reviewable side by side.
 *
 * Run: bun tmpscripts/step6-dryrun.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const host = (value: string): string => {
  try {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return ""; }
};
const pageKey = (value: string): string => {
  try {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}`;
  } catch { return ""; }
};

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type ProgramRow = {
  id: string; university_id: string; sport: string;
  athletic_website: string | null; roster_url: string | null; coaching_staff_url: string | null;
};
const programs: ProgramRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, university_id, sport, athletic_website, roster_url, coaching_staff_url")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  const page = (data ?? []) as ProgramRow[];
  programs.push(...page);
  if (page.length < 1000) break;
}

const schools = new Map<string, { name: string; state: string | null; ipeds: number | null }>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("universities").select("id, name, state, ipeds_unitid")
    .order("id", { ascending: true }).range(from, from + 999);
  if (error) throw new Error(error.message);
  const page = (data ?? []) as any[];
  for (const s of page) schools.set(s.id, { name: s.name, state: s.state, ipeds: s.ipeds_unitid });
  if (page.length < 1000) break;
}

// ---- the ownership determinations (4B-i logic: domain match only) ----------
const rows = parseCsv(readFileSync("/mnt/documents/diagnostic/ownership-ncaa-4b.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
type Row = Record<string, string>;
const data: Row[] = rows.slice(1).filter((r) => r.length === head.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);

const groups = new Map<string, Row[]>();
for (const r of data) {
  const key = `${r["group_type"]}|${r["address"]}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}

const out: string[][] = [[
  "group_id", "group_type", "shared_address", "group_status", "schools_in_group",
  "school", "university_id", "ipeds_unitid", "state", "determination", "basis",
  "program_id", "sport", "field", "current_value", "action", "resulting_state",
  "group_members_and_determinations",
]];

let groupId = 0;
const tally = { clear: 0, keep: 0, flag: 0 };
const clearedSchoolRows = new Set<string>();
const flaggedPrograms = new Set<string>();
const flaggedSchools = new Set<string>();
const resolvedGroups = new Set<number>();
const ambiguousGroups = new Set<number>();

for (const [key, members] of groups) {
  groupId += 1;
  const [type, address] = key.split("|");
  const isDomainGroup = type === "athletics_domain";
  const targetKey = isDomainGroup ? host(address!) : pageKey(address!);
  const resolved = members.some((m) => m["determination"] === "rightful owner");
  if (resolved) resolvedGroups.add(groupId); else ambiguousGroups.add(groupId);

  const summary = members
    .map((m) => `${m["school"]} (${m["state"] || "?"}) = ${m["determination"]}`)
    .join(" | ");

  for (const member of members) {
    const universityId = member["university_id"] ?? "";
    const determination = member["determination"] ?? "unknown";
    const mine = programs.filter((p) => p.university_id === universityId);
    const fields: Array<"athletic_website" | "roster_url" | "coaching_staff_url"> = isDomainGroup
      ? ["athletic_website", "roster_url", "coaching_staff_url"]
      : ["roster_url", "coaching_staff_url"];

    for (const program of mine) {
      for (const field of fields) {
        const value = (program[field] ?? "").trim();
        if (!value) continue;
        const matches = isDomainGroup ? host(value) === targetKey : pageKey(value) === targetKey;
        if (!matches) continue;

        let action: "clear" | "keep" | "flag";
        let resulting: string;
        if (!resolved) { action = "flag"; resulting = "conflicted — kept, withheld from the product"; }
        else if (determination === "rightful owner") { action = "keep"; resulting = "unverified — kept, page not yet read"; }
        else { action = "clear"; resulting = "removed — queued to look for its own page (held)"; }

        tally[action] += 1;
        if (action === "clear") clearedSchoolRows.add(universityId);
        if (action === "flag") { flaggedPrograms.add(program.id); flaggedSchools.add(universityId); }

        const school = schools.get(universityId);
        out.push([
          String(groupId), type!, address!, resolved ? "resolved" : "ambiguous", String(members.length),
          school?.name ?? member["school"] ?? "", universityId, String(school?.ipeds ?? member["ipeds_unitid"] ?? ""),
          school?.state ?? member["state"] ?? "", determination, member["basis"] ?? "",
          program.id, program.sport, field, value, action, resulting, summary,
        ]);
      }
    }
  }
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// Group rows sit together so a "clear" reads directly against its "keep".
const body = out.slice(1).sort((a, b) => Number(a[0]) - Number(b[0]) || a[15]!.localeCompare(b[15]!));
writeFileSync(
  "/mnt/documents/step6d-change-list.csv",
  [out[0]!, ...body].map((r) => r.map(esc).join(",")).join("\n") + "\n",
);

const summary = [
  ["measure", "value"],
  ["collision groups", String(groups.size)],
  ["resolved groups (owner determined by domain match)", String(resolvedGroups.size)],
  ["ambiguous groups (no owner determined)", String(ambiguousGroups.size)],
  ["links to clear from confirmed non-owners", String(tally.clear)],
  ["links kept for the rightful owner (unverified)", String(tally.keep)],
  ["links kept and flagged conflicted (withheld)", String(tally.flag)],
  ["school-rows losing at least one address", String(clearedSchoolRows.size)],
  ["programs holding a conflicted address", String(flaggedPrograms.size)],
  ["schools holding a conflicted address", String(flaggedSchools.size)],
];
writeFileSync("/mnt/documents/step6d-summary.csv", summary.map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(JSON.stringify(Object.fromEntries(summary.slice(1)), null, 1));
