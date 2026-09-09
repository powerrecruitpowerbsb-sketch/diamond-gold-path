/**
 * 7. Tell duplicate records (one school, two rows) apart from true collisions
 * (two schools, one address). READ-ONLY: nothing is written.
 *
 * Signals, strongest first:
 *   1. the same federal unit id on two school rows
 *   2. the same federal website host on two rows holding different unit ids
 *   3. a row with no unit id whose name matches the federal name or alias of a
 *      row that does hold one (the Cal Poly case)
 *   4. one row's name contained in another's, same state
 *
 * Then every resolved collision group is re-labelled duplicate or collision,
 * and the change list is re-issued with clearings limited to true collisions.
 *
 * Run: bun tmpscripts/step7-duplicates.ts
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
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const write = (path: string, rows: string[][]) =>
  writeFileSync(path, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

const host = (value: string | null): string => {
  try {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return ""; }
};
const pageKey = (value: string | null): string => {
  try {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch { return ""; }
};

const STOP = new Set(["the", "of", "at", "and", "college", "university", "community", "state", "campus"]);
const norm = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (name: string) => new Set(norm(name).split(" ").filter((t) => t && !STOP.has(t)));
const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const st = (value: string | null) => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.length === 2) return raw.toUpperCase();
  return STATES[raw.toLowerCase()] ?? raw.toUpperCase();
};

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type School = {
  id: string; name: string; state: string | null; ipeds_unitid: number | null;
  website_url: string | null; federal_match_name: string | null;
};
const schools: School[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("universities")
    .select("id, name, state, ipeds_unitid, website_url, federal_match_name")
    .order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  const page = (data ?? []) as School[];
  schools.push(...page);
  if (page.length < 1000) break;
}

type Fed = { unitid: number; name: string; alias: string | null; website: string | null; state: string | null; city: string | null; two_year: boolean | null };
const fed = new Map<number, Fed>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("federal_directory")
    .select("unitid, name, alias, website, state, city, two_year").order("unitid").range(from, from + 999);
  if (error) throw new Error(error.message);
  const page = (data ?? []) as Fed[];
  for (const f of page) fed.set(f.unitid, f);
  if (page.length < 1000) break;
}

type Program = { id: string; university_id: string; sport: string; athletic_website: string | null; roster_url: string | null; coaching_staff_url: string | null };
const programs: Program[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("programs")
    .select("id, university_id, sport, athletic_website, roster_url, coaching_staff_url")
    .order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  const page = (data ?? []) as Program[];
  programs.push(...page);
  if (page.length < 1000) break;
}
const byUniversity = new Map<string, Program[]>();
for (const p of programs) byUniversity.set(p.university_id, [...(byUniversity.get(p.university_id) ?? []), p]);

// ---- 1. duplicate detection ------------------------------------------------
type Strength = "strong" | "campus" | "candidate";
type Pair = { a: School; b: School; signal: string; evidence: string; strength: Strength };
const pairs: Pair[] = [];
const seenPair = new Set<string>();
const addPair = (
  a: School, b: School, signal: string, evidence: string, strength: Strength,
) => {
  const key = [a.id, b.id].sort().join("|");
  if (seenPair.has(key)) return;
  seenPair.add(key);
  pairs.push({ a, b, signal, evidence, strength });
};

// signal 1: same unit id
const byUnit = new Map<number, School[]>();
for (const s of schools) if (s.ipeds_unitid) byUnit.set(s.ipeds_unitid, [...(byUnit.get(s.ipeds_unitid) ?? []), s]);
let sharedUnitIds = 0;
for (const [unit, group] of byUnit) {
  if (group.length < 2) continue;
  sharedUnitIds += 1;
  for (let i = 0; i < group.length; i += 1)
    for (let j = i + 1; j < group.length; j += 1)
      addPair(group[i]!, group[j]!, "same federal unit id", `unitid ${unit}`, "strong");
}

// signal 2: same federal website host, different unit ids
const byFedHost = new Map<string, School[]>();
for (const s of schools) {
  if (!s.ipeds_unitid) continue;
  const h = host(fed.get(s.ipeds_unitid)?.website ?? null);
  if (!h) continue;
  byFedHost.set(h, [...(byFedHost.get(h) ?? []), s]);
}
for (const [h, group] of byFedHost) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i += 1)
    for (let j = i + 1; j < group.length; j += 1)
      addPair(group[i]!, group[j]!, "shares an institutional website but holds its own federal id — campus of one system, not a duplicate", h, "campus");
}

// signal 3: a no-id row matching the federal name or alias of an id-holder
const withId = schools.filter((s) => s.ipeds_unitid);
const noId = schools.filter((s) => !s.ipeds_unitid);
const aliasIndex = new Map<string, School[]>();
for (const s of withId) {
  const f = fed.get(s.ipeds_unitid!);
  if (!f) continue;
  const keys = [f.name, ...String(f.alias ?? "").split(/[|;,]/)].map(norm).filter(Boolean);
  for (const k of new Set(keys)) aliasIndex.set(k, [...(aliasIndex.get(k) ?? []), s]);
}
/** Does `name` describe the same institution as the federal record, with no
 *  extra campus word of its own? "California Polytechnic State University" does;
 *  "Coastal Alabama Community College Brewton" does not. */
const sameInstitution = (name: string, f: Fed): boolean => {
  const mine = tokens(name);
  if (!mine.size) return false;
  const names = [f.name, ...String(f.alias ?? "").split(/[|;,]/)].filter(Boolean);
  return names.some((candidate) => {
    const theirs = tokens(candidate);
    if (theirs.size < 2) return false;
    const extra = [...mine].filter((t) => !theirs.has(t));
    const shared = [...mine].filter((t) => theirs.has(t)).length;
    return extra.length === 0 && shared >= Math.min(2, theirs.size);
  });
};

for (const s of noId) {
  for (const holder of withId) {
    const f = fed.get(holder.ipeds_unitid!);
    if (!f) continue;
    if (st(s.state) && st(f.state ?? null) && st(s.state) !== st(f.state ?? null)) continue;
    if (!sameInstitution(s.name, f)) continue;
    addPair(s, holder, "no federal id, and the name is the federal institution's own name",
      `${f.name}${f.alias ? ` (alias ${f.alias})` : ""} — unitid ${f.unitid}`, "strong");
  }
}
// and the reverse: a no-id row's athletics host shared with an id-holder whose
// federal alias covers the no-id name
const athleticsHosts = new Map<string, Set<string>>();
for (const p of programs) {
  const h = host(p.athletic_website);
  if (!h) continue;
  athleticsHosts.set(h, new Set([...(athleticsHosts.get(h) ?? []), p.university_id]));
}
const schoolById = new Map(schools.map((s) => [s.id, s]));
for (const [h, uniIds] of athleticsHosts) {
  if (uniIds.size < 2) continue;
  const group = [...uniIds].map((id) => schoolById.get(id)!).filter(Boolean);
  for (const a of group) {
    for (const b of group) {
      if (a.id >= b.id) continue;
      if (a.ipeds_unitid && b.ipeds_unitid) continue;
      const holder = a.ipeds_unitid ? a : b.ipeds_unitid ? b : null;
      const other = holder ? (holder === a ? b : a) : null;
      if (!holder || !other) continue;
      const f = fed.get(holder.ipeds_unitid!);
      if (!f) continue;
      const alias = sameInstitution(other.name, f);
      if (alias) addPair(other, holder, "shares an athletics domain and carries the federal institution's own name",
        `${h}; ${f.name}${f.alias ? ` (alias ${f.alias})` : ""}`, "strong");
    }
  }
}

// signal 4: one name contained in the other, same state
for (const a of schools) {
  for (const b of schools) {
    if (a.id >= b.id) continue;
    if (st(a.state) !== st(b.state) || !st(a.state)) continue;
    const an = norm(a.name); const bn = norm(b.name);
    if (an === bn || (an.length > 8 && bn.includes(an)) || (bn.length > 8 && an.includes(bn)))
      addPair(a, b, "one name contained in the other, same state — needs a human look",
        `${a.name} / ${b.name}`, "candidate");
  }
}

const dupRows: string[][] = [[
  "strength", "signal", "evidence",
  "record_a", "a_university_id", "a_unitid", "a_state", "a_programs", "a_athletics",
  "record_b", "b_university_id", "b_unitid", "b_state", "b_programs", "b_athletics",
]];
const athleticsOf = (id: string) =>
  [...new Set((byUniversity.get(id) ?? []).map((p) => host(p.athletic_website)).filter(Boolean))].join(" ");
for (const p of pairs) {
  dupRows.push([
    p.strength, p.signal, p.evidence,
    p.a.name, p.a.id, String(p.a.ipeds_unitid ?? ""), st(p.a.state), String((byUniversity.get(p.a.id) ?? []).length), athleticsOf(p.a.id),
    p.b.name, p.b.id, String(p.b.ipeds_unitid ?? ""), st(p.b.state), String((byUniversity.get(p.b.id) ?? []).length), athleticsOf(p.b.id),
  ]);
}
write("/mnt/documents/step7-duplicate-records.csv", dupRows);

// duplicate school ids, for the reclassification below
const dupPartners = new Map<string, Set<string>>();
const campusPartners = new Map<string, Set<string>>();
for (const p of pairs) {
  const target = p.strength === "strong" ? dupPartners : p.strength === "campus" ? campusPartners : null;
  if (!target) continue;
  target.set(p.a.id, new Set([...(target.get(p.a.id) ?? []), p.b.id]));
  target.set(p.b.id, new Set([...(target.get(p.b.id) ?? []), p.a.id]));
}
// Campus rows of one system that all sit under the same federal id are the same
// institution twice over, so they belong with the duplicates.
for (const [unit, group] of byUnit) {
  void unit;
  if (group.length < 2) continue;
}

// ---- 2/4. reclassify the resolved groups and re-issue the change list -------
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
  "group_id", "group_type", "shared_address", "group_kind", "group_status", "schools_in_group",
  "school", "university_id", "ipeds_unitid", "state", "determination", "basis",
  "program_id", "sport", "field", "current_value", "action", "resulting_state",
  "group_members_and_determinations",
]];
const kinds: string[][] = [["group_id", "group_type", "shared_address", "group_kind", "group_status", "why", "members"]];

let groupId = 0;
const tally = { clear: 0, keep: 0, flag: 0, merge: 0, hold: 0 };
const counts = {
  resolvedCollision: 0, resolvedDuplicate: 0, resolvedCampus: 0,
  ambiguousCollision: 0, ambiguousDuplicate: 0, ambiguousCampus: 0,
};
const clearedSchools = new Set<string>();
const mergeGroups: Row[][] = [];

for (const [key, members] of groups) {
  groupId += 1;
  const [type, address] = key.split("|");
  const isDomainGroup = type === "athletics_domain";
  const targetKey = isDomainGroup ? host(address!) : pageKey(address!);
  const resolved = members.some((m) => m["determination"] === "rightful owner");

  // duplicate group: every member is a known duplicate of every other
  const memberIds = members.map((m) => m["university_id"] ?? "");
  const allPairs = (map: Map<string, Set<string>>) => memberIds.length > 1 && memberIds.every((id) =>
    memberIds.every((other) => other === id || (map.get(id)?.has(other) ?? false)));
  const duplicate = allPairs(dupPartners);
  const campus = !duplicate && memberIds.length > 1 && memberIds.every((id) =>
    memberIds.every((other) => other === id
      || (campusPartners.get(id)?.has(other) ?? false)
      || (dupPartners.get(id)?.has(other) ?? false)));
  const kind = duplicate
    ? "duplicate records (one institution)"
    : campus
      ? "campuses of one system — needs a human call"
      : "collision (distinct institutions)";
  if (duplicate || campus) mergeGroups.push(members);
  const bucket = duplicate ? "Duplicate" : campus ? "Campus" : "Collision";
  counts[`${resolved ? "resolved" : "ambiguous"}${bucket}` as keyof typeof counts] += 1;

  const summary = members.map((m) => `${m["school"]} (${m["state"] || "?"}) = ${m["determination"]}`).join(" | ");
  kinds.push([String(groupId), type!, address!, kind, resolved ? "resolved" : "ambiguous",
    duplicate ? "all members are the same institution under different names"
      : campus ? "members are campuses of one system, each with its own federal id"
      : "members are different institutions",
    summary]);

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

        let action: "clear" | "keep" | "flag" | "merge" | "hold";
        let resulting: string;
        if (duplicate || campus) {
          action = duplicate ? "merge" : "hold";
          resulting = duplicate
            ? "held for merge — the address is right, the second record is not"
            : "held — campuses of one system, your call before anything is cleared";
        } else if (!resolved) {
          action = "flag"; resulting = "conflicted — kept, withheld from the product";
        } else if (determination === "rightful owner") {
          action = "keep"; resulting = "unverified — kept, page not yet read";
        } else {
          action = "clear"; resulting = "removed — queued to look for its own page (held)";
        }
        tally[action] += 1;
        if (action === "clear") clearedSchools.add(universityId);

        const school = schoolById.get(universityId);
        out.push([
          String(groupId), type!, address!, kind, resolved ? "resolved" : "ambiguous", String(members.length),
          school?.name ?? member["school"] ?? "", universityId, String(school?.ipeds_unitid ?? member["ipeds_unitid"] ?? ""),
          st(school?.state ?? member["state"] ?? null), determination, member["basis"] ?? "",
          program.id, program.sport, field, value, action, resulting, summary,
        ]);
      }
    }
  }
}
const body = out.slice(1).sort((a, b) => Number(a[0]) - Number(b[0]) || a[16]!.localeCompare(b[16]!));
write("/mnt/documents/step7-change-list.csv", [out[0]!, ...body]);
write("/mnt/documents/step7-group-kinds.csv", kinds);

// ---- 3. merge plan ---------------------------------------------------------
const mergeRows: string[][] = [[
  "shared_address", "survivor", "survivor_id", "survivor_unitid", "survivor_programs", "survivor_sports",
  "absorbed", "absorbed_id", "absorbed_unitid", "absorbed_programs", "absorbed_sports",
  "programs_after_merge", "notes",
]];
const sportsOf = (id: string) => [...new Set((byUniversity.get(id) ?? []).map((p) => p.sport))].sort().join("+");
const seenMerge = new Set<string>();
for (const members of mergeGroups) {
  const rowsIn = members.map((m) => schoolById.get(m["university_id"] ?? "")).filter(Boolean) as School[];
  const survivor = [...rowsIn].sort((a, b) => {
    if (Boolean(b.ipeds_unitid) !== Boolean(a.ipeds_unitid)) return Number(Boolean(b.ipeds_unitid)) - Number(Boolean(a.ipeds_unitid));
    return (byUniversity.get(b.id) ?? []).length - (byUniversity.get(a.id) ?? []).length;
  })[0]!;
  for (const other of rowsIn) {
    if (other.id === survivor.id) continue;
    const key = [survivor.id, other.id].sort().join("|");
    if (seenMerge.has(key)) continue;
    seenMerge.add(key);
    const sports = new Set([...sportsOf(survivor.id).split("+"), ...sportsOf(other.id).split("+")].filter(Boolean));
    mergeRows.push([
      members[0]!["address"] ?? "", survivor.name, survivor.id, String(survivor.ipeds_unitid ?? ""),
      String((byUniversity.get(survivor.id) ?? []).length), sportsOf(survivor.id),
      other.name, other.id, String(other.ipeds_unitid ?? ""),
      String((byUniversity.get(other.id) ?? []).length), sportsOf(other.id),
      String(sports.size),
      "survivor holds the federal id; same-sport programs collapse into the one with more collected roster data",
    ]);
  }
}
write("/mnt/documents/step7-merge-plan.csv", mergeRows);

// ---- extra: stored addresses pointing at a sport we do not cover -----------
const OTHER_SPORTS = /\/sports\/(cheer|wbkb|mbkb|fball|wsoc|msoc|wvball|mvball|wten|mten|wgolf|mgolf|wxc|mxc|track|wswim|mswim|wlax|mlax|wrest|field-hockey|volleyball|basketball|football|soccer|tennis|golf|lacrosse|wrestling|hockey|cross-country|swimming)\b/i;
const offSport: string[][] = [["school", "university_id", "program_id", "sport", "field", "url", "points_at"]];
for (const p of programs) {
  for (const field of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
    const value = (p[field] ?? "").trim();
    const m = value.match(OTHER_SPORTS);
    if (!m) continue;
    const target = m[1]!.toLowerCase();
    const ours = p.sport === "baseball" ? ["bsb", "baseball"] : ["sball", "softball"];
    if (ours.includes(target)) continue;
    const school = schoolById.get(p.university_id);
    offSport.push([school?.name ?? "", p.university_id, p.id, p.sport, field, value, target]);
  }
}
write("/mnt/documents/step7-wrong-sport-links.csv", offSport);

console.log(JSON.stringify({
  schools: schools.length,
  ipedsIdsOnMoreThanOneRecord: sharedUnitIds,
  duplicatePairs: pairs.length,
  strongPairs: pairs.filter((p) => p.strength === "strong").length,
  candidatePairs: pairs.filter((p) => p.strength === "candidate").length,
  bySignal: pairs.reduce<Record<string, number>>((a, p) => ({ ...a, [p.signal]: (a[p.signal] ?? 0) + 1 }), {}),
  groups: groups.size, ...counts,
  actions: tally,
  schoolsLosingALink: clearedSchools.size,
  mergePairsInGroups: mergeRows.length - 1,
  wrongSportLinks: offSport.length - 1,
}, null, 1));
