/**
 * 4B-i. Re-run collision ownership with the name-and-state fallback REMOVED.
 *
 * Ownership is decided ONLY by an address matching a candidate institution's own
 * websites: the federal directory website, the NCAA feed's athletics website, or
 * the NCAA feed's institutional website. A match on ANY of those counts, because
 * the NCAA feed sometimes carries the institutional site where we expected the
 * athletics one (Simon Fraser: sfu.ca; Springfield College: springfield.edu).
 *
 * A failed comparison yields "unknown". We NEVER conclude a school does not own
 * an address from the absence of a match — a school is only marked "not the
 * owner" when a DIFFERENT candidate in the same group matched on a domain.
 *
 * Read-only. Writes one CSV. Run: bun tmpscripts/ownership-4b.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { registrableDomain } from "../src/lib/program-ownership";

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

const dom = (value: string): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return registrableDomain(u.hostname.replace(/^www\./i, "").toLowerCase());
  } catch { return ""; }
};

const flat = (name: string) =>
  name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    // Only true connectives are dropped. Stripping words like "technical" or
    // "community" is what let Springfield Technical Community College match the
    // NCAA record for Springfield College — the exact defect being removed here.
    .replace(/\b(the|of|at)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();

// ---- NCAA member directory (public JSON feed; a data service, not a page read)
type Member = { name: string; state: string; siteDom: string; athDom: string };
const members: Member[] = [];
for (const type of [1, 11, 12]) {
  const response = await fetch(`https://web3.ncaa.org/directory/api/directory/memberList?type=${type}`);
  if (!response.ok) continue;
  const list = (await response.json()) as any[];
  for (const m of list) {
    members.push({
      name: String(m.nameOfficial ?? ""),
      state: String(m?.memberOrgAddress?.state ?? "").toUpperCase(),
      siteDom: dom(String(m.webSiteUrl ?? "")),
      athDom: dom(String(m.athleticWebUrl ?? "")),
    });
  }
}
const byKey = new Map<string, Member[]>();
for (const m of members) {
  const k = `${flat(m.name)}|${m.state}`;
  byKey.set(k, [...(byKey.get(k) ?? []), m]);
}

// ---- collision worksheet -------------------------------------------------
const rows = parseCsv(readFileSync("/mnt/documents/diagnostic/collision-worksheet.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
type Row = Record<string, string>;
const data: Row[] = rows.slice(1).filter((r) => r.length === head.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);

const groups = new Map<string, Row[]>();
for (const r of data) {
  const k = `${r["group_type"]}|${r["address"]}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}

const out: string[][] = [[
  "group_type", "address", "school_count", "school", "university_id", "ipeds_unitid", "state",
  "leagues", "divisions", "program_count", "federal_website", "ncaa_member_matched",
  "ncaa_school_website", "ncaa_athletics_website", "determination", "basis", "confidence", "group_status",
]];

let resolved = 0, ambiguous = 0;
const basisTally = new Map<string, number>();

for (const [k, cands] of groups) {
  const [type, address] = k.split("|");
  const target = dom(address!);

  const matched = cands.map((c) => {
    const state = (c["state"] ?? "").toUpperCase();
    const hits = byKey.get(`${flat(c["school"] ?? "")}|${state}`) ?? [];
    const member = hits[0] ?? null;
    const fedDom = dom(c["federal_website"] ?? "");
    let basis = "";
    if (target && fedDom && fedDom === target) basis = "federal institution website domain";
    else if (target && member?.athDom && member.athDom === target) basis = "NCAA athletics website domain";
    else if (target && member?.siteDom && member.siteDom === target) basis = "NCAA institution website domain";
    return { row: c, member, basis };
  });

  const owners = matched.filter((m) => m.basis);
  // Exactly one candidate matched a domain we can attribute → that one owns it.
  const decided = owners.length === 1 ? owners[0]! : null;
  if (decided) { resolved += 1; basisTally.set(decided.basis, (basisTally.get(decided.basis) ?? 0) + 1); }
  else ambiguous += 1;

  for (const m of matched) {
    const isOwner = decided === m;
    out.push([
      type!, address!, String(cands.length), m.row["school"] ?? "", m.row["university_id"] ?? "",
      m.row["ipeds_unitid"] ?? "", m.row["state"] ?? "", m.row["leagues"] ?? "", m.row["divisions"] ?? "",
      m.row["program_count"] ?? "", m.row["federal_website"] ?? "",
      m.member ? m.member.name : "", m.member?.siteDom ?? "", m.member?.athDom ?? "",
      // No match, no verdict: "unknown", never "not the owner".
      isOwner ? "rightful owner" : decided ? "not the owner" : "unknown",
      isOwner ? m.basis : decided ? `another school matched: ${decided.basis}` : "",
      decided ? "resolved" : "ambiguous",
      decided ? "resolved by domain match" : "still ambiguous — needs a page read",
    ]);
  }
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync("/mnt/documents/diagnostic/ownership-ncaa-4b.csv", out.map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(JSON.stringify({ ncaaMembers: members.length, groups: groups.size, resolved, ambiguous, basis: Object.fromEntries(basisTally) }, null, 1));
