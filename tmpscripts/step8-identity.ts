/**
 * STEP 8 — report only. Nothing is written to the database.
 *
 *  1. Mislabeled federal id report: stored name vs the federal name for its unitid.
 *  2. Duplicate detection, tightened: a no-id row is only called a duplicate when it
 *     matches EXACTLY ONE federal institution (state-filtered) and the id-holder's
 *     own name agrees with its federal record. Multi-match rows are reported as
 *     ambiguous name matches, never paired.
 *  3. Merge plan v2: campus-of-one-system groups removed entirely; survivor is the
 *     record whose name agrees with the federal record, not merely the id holder.
 *  4. Change list re-issued: duplicate partners of the rightful owner are held for a
 *     record fix instead of cleared.
 *
 * Run: bun tmpscripts/step8-identity.ts
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

const NAME_STOP = new Set(["the", "of", "at", "and", "college", "university", "community"]);
const norm = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (name: string, stop: Set<string>) =>
  new Set(norm(name).split(" ").filter((t) => t && !stop.has(t)));
const MATCH_STOP = new Set([...NAME_STOP, "state", "campus"]);

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
const schoolById = new Map(schools.map((s) => [s.id, s]));

// ---- 1. mislabeled federal id ---------------------------------------------
const aliasList = (f: Fed) => [f.name, ...String(f.alias ?? "").split(/[|;,]/)]
  .map((v) => v.trim()).filter(Boolean);
const setEq = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((t) => b.has(t));

type NameVerdict = { verdict: "agrees" | "review" | "disagrees"; why: string };
const nameVerdict = (stored: string, f: Fed): NameVerdict => {
  const s = norm(stored);
  const names = aliasList(f).map(norm);
  if (names.includes(s)) return { verdict: "agrees", why: "exact match to the federal name or a listed alias" };
  const contained = names.find((n) => n && (s.includes(n) || n.includes(s)));
  if (contained) {
    const extra = [...tokens(stored, NAME_STOP)].filter((t) => !tokens(contained, NAME_STOP).has(t));
    const city = norm(f.city ?? "");
    if (extra.length && !extra.every((t) => city.includes(t)))
      return {
        verdict: "review",
        why: `stored name adds "${extra.join(" ")}", which is not in the federal name or its city (${f.city ?? "?"})`,
      };
    return { verdict: "agrees", why: "one name contains the other, no extra campus word" };
  }
  const mine = tokens(stored, MATCH_STOP);
  if (names.some((n) => setEq(mine, tokens(n, MATCH_STOP))))
    return { verdict: "review", why: "same words in a different order — may be a different institution with a similar name" };
  return {
    verdict: "disagrees",
    why: `federal record is "${f.name}"${f.alias ? ` (aliases: ${f.alias})` : ""} in ${f.city ?? "?"}, ${f.state ?? "?"}`,
  };
};

const misRows: string[][] = [[
  "verdict", "stored_name", "university_id", "stored_state", "unitid",
  "federal_name", "federal_alias", "federal_state", "federal_city",
  "stored_website", "athletics_domains", "programs", "why",
]];
const athleticsOf = (id: string) =>
  [...new Set((byUniversity.get(id) ?? []).map((p) => host(p.athletic_website)).filter(Boolean))].join(" ");
const badId = new Set<string>();
for (const s of schools) {
  if (!s.ipeds_unitid) continue;
  const f = fed.get(s.ipeds_unitid);
  if (!f) continue;
  const v = nameVerdict(s.name, f);
  if (v.verdict === "agrees") continue;
  if (v.verdict === "disagrees") badId.add(s.id);
  misRows.push([
    v.verdict === "disagrees" ? "name and federal record disagree" : "needs a human look",
    s.name, s.id, st(s.state), String(s.ipeds_unitid),
    f.name, f.alias ?? "", st(f.state), f.city ?? "",
    s.website_url ?? "", athleticsOf(s.id), String((byUniversity.get(s.id) ?? []).length), v.why,
  ]);
}
// no-id rows carrying a domain that an id-holding school also carries
const domainOwners = new Map<string, School[]>();
for (const s of schools) {
  for (const h of [host(s.website_url), ...(byUniversity.get(s.id) ?? []).map((p) => host(p.athletic_website))]) {
    if (!h) continue;
    const list = domainOwners.get(h) ?? [];
    if (!list.some((x) => x.id === s.id)) domainOwners.set(h, [...list, s]);
  }
}
for (const s of schools) {
  if (s.ipeds_unitid) continue;
  const hs = [...new Set([host(s.website_url), ...(byUniversity.get(s.id) ?? []).map((p) => host(p.athletic_website))].filter(Boolean))];
  for (const h of hs) {
    const others = (domainOwners.get(h) ?? []).filter((o) => o.id !== s.id && o.ipeds_unitid);
    if (!others.length) continue;
    misRows.push([
      "no federal id, address held by an identified school",
      s.name, s.id, st(s.state), "", "", "", "", "",
      s.website_url ?? "", athleticsOf(s.id), String((byUniversity.get(s.id) ?? []).length),
      `${h} is also on ${others.map((o) => `${o.name} (unitid ${o.ipeds_unitid})`).join("; ")}`,
    ]);
  }
}
write("/mnt/documents/step8-mislabeled-federal-id.csv", misRows);

// ---- 2. duplicate detection, tightened ------------------------------------
/** stored name is the federal institution's own name, with no extra campus word */
const sameInstitution = (name: string, f: Fed): boolean => {
  const mine = tokens(name, MATCH_STOP);
  if (!mine.size) return false;
  return aliasList(f).some((candidate) => {
    const theirs = tokens(candidate, MATCH_STOP);
    if (theirs.size < 2) return false;
    const extra = [...mine].filter((t) => !theirs.has(t));
    const shared = [...mine].filter((t) => theirs.has(t)).length;
    return extra.length === 0 && shared >= Math.min(2, theirs.size);
  });
};
/** Strict: every word of the federal name is present, and the only extra words the
 *  stored name carries are that institution's own state or city. */
const sameInstitutionStrict = (name: string, f: Fed): boolean => {
  const mine = tokens(name, MATCH_STOP);
  if (!mine.size) return false;
  const place = new Set<string>([
    ...norm(f.city ?? "").split(" ").filter(Boolean),
    ...norm(Object.entries(STATES).find(([, code]) => code === st(f.state ?? null))?.[0] ?? "").split(" ").filter(Boolean),
    st(f.state ?? null).toLowerCase(),
  ]);
  return aliasList(f).some((candidate) => {
    const theirs = tokens(candidate, MATCH_STOP);
    if (!theirs.size) return false;
    const missing = [...theirs].filter((t) => !mine.has(t));
    const extra = [...mine].filter((t) => !theirs.has(t));
    return missing.length === 0 && extra.every((t) => place.has(t));
  });
};

/** A record whose own name does not agree with its federal record cannot anchor a
 *  duplicate — its identity is the thing in question. */
const identityFirm = (s: School) => {
  const f = s.ipeds_unitid ? fed.get(s.ipeds_unitid) : undefined;
  return Boolean(f) && nameVerdict(s.name, f!).verdict === "agrees";
};
const withId = schools.filter((s) => s.ipeds_unitid && !badId.has(s.id) && identityFirm(s));
const noId = schools.filter((s) => !s.ipeds_unitid);

const dupPartners = new Map<string, Set<string>>();
const link = (a: string, b: string) => {
  dupPartners.set(a, new Set([...(dupPartners.get(a) ?? []), b]));
  dupPartners.set(b, new Set([...(dupPartners.get(b) ?? []), a]));
};
const dupRows: string[][] = [[
  "signal", "evidence",
  "record_a", "a_university_id", "a_unitid", "a_state", "a_programs", "a_athletics",
  "record_b", "b_university_id", "b_unitid", "b_state", "b_programs", "b_athletics",
]];
const ambigRows: string[][] = [[
  "no_id_record", "university_id", "state", "athletics_domains",
  "federal_institutions_matched", "count", "note",
]];

for (const s of noId) {
  const inState = withId.filter((holder) => {
    const f = fed.get(holder.ipeds_unitid!);
    if (!f) return false;
    return !(st(s.state) && st(f.state ?? null) && st(s.state) !== st(f.state ?? null));
  });
  const matches = inState.filter((h) => sameInstitutionStrict(s.name, fed.get(h.ipeds_unitid!)!));
  const loose = inState.filter((h) => sameInstitution(s.name, fed.get(h.ipeds_unitid!)!));
  const ambiguous = matches.length > 1 || loose.length > 1;
  if (matches.length === 1 && !ambiguous) {

    const holder = matches[0]!;
    const f = fed.get(holder.ipeds_unitid!)!;
    link(s.id, holder.id);
    dupRows.push([
      "no federal id; name is one federal institution's own name, and only that one",
      `${f.name}${f.alias ? ` (alias ${f.alias})` : ""} — unitid ${f.unitid}, ${f.city ?? "?"} ${st(f.state)}`,
      s.name, s.id, "", st(s.state), String((byUniversity.get(s.id) ?? []).length), athleticsOf(s.id),
      holder.name, holder.id, String(holder.ipeds_unitid), st(holder.state), String((byUniversity.get(holder.id) ?? []).length), athleticsOf(holder.id),
    ]);
  } else if (ambiguous) {
    const all = [...new Set([...matches, ...loose])];
    ambigRows.push([
      s.name, s.id, st(s.state), athleticsOf(s.id),
      all.map((m) => `${m.name} (unitid ${m.ipeds_unitid}, ${fed.get(m.ipeds_unitid!)?.city ?? "?"})`).join("; "),
      String(all.length),
      "name matching alone cannot identify this record — not treated as a duplicate of anything",
    ]);
  }

}
write("/mnt/documents/step8-duplicate-records.csv", dupRows);
write("/mnt/documents/step8-ambiguous-name-matches.csv", ambigRows);

// ---- 3. merge plan v2 ------------------------------------------------------
const mergeRows: string[][] = [[
  "survivor", "survivor_id", "survivor_unitid", "survivor_programs",
  "absorbed", "absorbed_id", "absorbed_unitid", "absorbed_programs",
  "why_the_survivor", "shared_evidence",
]];
const seenMerge = new Set<string>();
for (const [a, partners] of dupPartners) {
  for (const b of partners) {
    const key = [a, b].sort().join("|");
    if (seenMerge.has(key)) continue;
    seenMerge.add(key);
    const A = schoolById.get(a)!; const B = schoolById.get(b)!;
    // survivor = the record whose own name agrees with its federal record
    const agrees = (s: School) => {
      if (!s.ipeds_unitid) return false;
      const f = fed.get(s.ipeds_unitid);
      return f ? nameVerdict(s.name, f).verdict === "agrees" : false;
    };
    const survivor = agrees(A) ? A : agrees(B) ? B : null;
    if (!survivor) continue;
    const other = survivor.id === A.id ? B : A;
    mergeRows.push([
      survivor.name, survivor.id, String(survivor.ipeds_unitid ?? ""), String((byUniversity.get(survivor.id) ?? []).length),
      other.name, other.id, String(other.ipeds_unitid ?? ""), String((byUniversity.get(other.id) ?? []).length),
      "its stored name matches the federal record for its unitid; the other record has no federal id",
      athleticsOf(survivor.id) || athleticsOf(other.id),
    ]);
  }
}
write("/mnt/documents/step8-merge-plan.csv", mergeRows);

// ---- 4. change list re-issued ---------------------------------------------
const rows = parseCsv(readFileSync("/mnt/documents/diagnostic/ownership-ncaa-4b.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
type Row = Record<string, string>;
const data: Row[] = rows.slice(1).filter((r) => r.length === head.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);
const groups = new Map<string, Row[]>();
for (const r of data) groups.set(`${r["group_type"]}|${r["address"]}`, [...(groups.get(`${r["group_type"]}|${r["address"]}`) ?? []), r]);

const out: string[][] = [[
  "group_id", "group_type", "shared_address", "group_kind", "group_status", "schools_in_group",
  "school", "university_id", "ipeds_unitid", "state", "determination", "basis",
  "program_id", "sport", "field", "current_value", "action", "resulting_state",
  "group_members_and_determinations",
]];
const kinds: string[][] = [["group_id", "group_type", "shared_address", "group_kind", "group_status", "why", "members"]];
let groupId = 0;
const tally: Record<string, number> = { clear: 0, keep: 0, flag: 0, "hold-record-fix": 0 };
const kindCount: Record<string, number> = {};
const clearedSchools = new Set<string>();
let heldNoIdOwner = 0;
let heldMislabeled = 0;


for (const [key, members] of groups) {
  groupId += 1;
  const [type, address] = key.split("|");
  const isDomainGroup = type === "athletics_domain";
  const targetKey = isDomainGroup ? host(address!) : pageKey(address!);
  const resolved = members.some((m) => m["determination"] === "rightful owner");
  const memberIds = members.map((m) => m["university_id"] ?? "");
  const allDuplicates = memberIds.length > 1 && memberIds.every((id) =>
    memberIds.every((o) => o === id || (dupPartners.get(id)?.has(o) ?? false)));
  const someDuplicate = memberIds.some((id) => memberIds.some((o) => o !== id && (dupPartners.get(id)?.has(o) ?? false)));
  const kind = allDuplicates
    ? "duplicate records (one institution)"
    : someDuplicate
      ? "collision, with a duplicate record inside the group"
      : "collision (distinct institutions)";
  kindCount[kind] = (kindCount[kind] ?? 0) + 1;
  const summary = members.map((m) => `${m["school"]} (${m["state"] || "?"}) = ${m["determination"]}`).join(" | ");
  kinds.push([String(groupId), type!, address!, kind, resolved ? "resolved" : "ambiguous",
    allDuplicates ? "every member is the same institution under a different name"
      : someDuplicate ? "two members are the same institution; the rest are different institutions"
      : "members are different institutions", summary]);

  const namedOwnerIds = members.filter((m) => m["determination"] === "rightful owner").map((m) => m["university_id"] ?? "");
  // RULE: a record with no resolved institution ID cannot be a rightful owner, and cannot
  // cause any other record's link to be cleared.
  const ownerIds = namedOwnerIds.filter((id) => Boolean(schoolById.get(id)?.ipeds_unitid));
  const ownerUnidentified = namedOwnerIds.length > 0 && ownerIds.length === 0;
  // A group holding a record whose federal id belongs to a different institution must have
  // the id fixed first; clearing links would only move the error.
  const groupMislabeled = memberIds.some((id) => badId.has(id));
  const resolvedOwner = ownerIds.length > 0 && !groupMislabeled;

  for (const member of members) {
    const universityId = member["university_id"] ?? "";
    const determination = member["determination"] ?? "unknown";
    const dupOfOwner = ownerIds.some((o) => o !== universityId && (dupPartners.get(universityId)?.has(o) ?? false));
    const fields: Array<"athletic_website" | "roster_url" | "coaching_staff_url"> = isDomainGroup
      ? ["athletic_website", "roster_url", "coaching_staff_url"]
      : ["roster_url", "coaching_staff_url"];
    for (const program of programs.filter((p) => p.university_id === universityId)) {
      for (const field of fields) {
        const value = (program[field] ?? "").trim();
        if (!value) continue;
        if (!(isDomainGroup ? host(value) === targetKey : pageKey(value) === targetKey)) continue;

        let action: string; let resulting: string;
        if (allDuplicates || dupOfOwner) {
          action = "hold-record-fix";
          resulting = "held — same school as the other record; fix the record, not the link";
        } else if (groupMislabeled) {
          action = "hold-record-fix";
          heldMislabeled += 1;
          resulting = "held — a record in this group carries another institution's federal id; fix the id first";
        } else if (ownerUnidentified) {
          if (schoolById.get(universityId)?.ipeds_unitid) {
            action = "keep";
            resulting = "unverified — kept; the only rival claim comes from a record with no institution id";
          } else {
            action = "hold-record-fix";
            heldNoIdOwner += 1;
            resulting = "held — this record has no resolved institution id, so it cannot own or displace anything";
          }
        } else if (!resolvedOwner) {
          action = "flag"; resulting = "conflicted — kept, withheld from the product";

        } else if (determination === "rightful owner") {
          action = "keep"; resulting = "unverified — kept, page not yet read";
        } else if (!schoolById.get(universityId)?.ipeds_unitid) {
          action = "hold-record-fix";
          resulting = "held — this record has no resolved institution id; fix the record before touching its links";
        } else {
          action = "clear"; resulting = "removed — queued to look for its own page (held)";
        }

        tally[action] = (tally[action] ?? 0) + 1;
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
write("/mnt/documents/step8-change-list.csv", [out[0]!, ...body]);
write("/mnt/documents/step8-group-kinds.csv", kinds);

console.log(JSON.stringify({
  mislabeledRows: misRows.length - 1,
  nameDisagrees: misRows.slice(1).filter((r) => r[0]!.startsWith("name and federal")).length,
  needsHumanLook: misRows.slice(1).filter((r) => r[0] === "needs a human look").length,
  noIdSharingAnIdentifiedAddress: misRows.slice(1).filter((r) => r[0]!.startsWith("no federal id")).length,
  duplicatePairs: dupRows.length - 1,
  ambiguousNameMatches: ambigRows.length - 1,
  mergeCandidates: mergeRows.length - 1,
  groups: groups.size, kindCount, actions: tally,
  schoolsLosingALink: clearedSchools.size,
  heldBecauseClaimedOwnerHasNoId: heldNoIdOwner,
  heldBecauseGroupHasMislabeledId: heldMislabeled,

}, null, 1));
