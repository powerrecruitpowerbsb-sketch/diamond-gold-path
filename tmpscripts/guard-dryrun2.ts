/**
 * Read-only. Judges every stored link as if it were being written today, under
 * the corrected rules: no governing-body-vs-federal-level gate; state stays a
 * hard filter; level/state/city only separate institutions that contend for the
 * same address. Also emits the collision worksheet and the no-institution-ID
 * report. Writes nothing to the database.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { registrableDomain } from "../src/lib/program-ownership";
import { US_STATE_NAMES } from "../src/lib/data-quality";
import { pickOwnerAmongCandidates, type Contender } from "../src/lib/institution-identity.server";

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

type Row = Record<string, string>;
const rows = parseCsv(readFileSync("/tmp/dryrun-in2.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
const data: Row[] = rows.slice(1).filter((r) => r.length === head.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);

const platforms = new Set(
  readFileSync("/tmp/platforms.csv", "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean),
);

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; } };
const dom = (url: string) => { const h = host(url); return h ? registrableDomain(h) : ""; };
const key = (url: string) => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`; } catch { return url.trim().toLowerCase(); } };

const codeOf = (state: string) => {
  const s = (state ?? "").trim();
  if (!s) return "";
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const flat = s.replace(/\./g, "").toLowerCase();
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    if (name.toLowerCase() === flat) return code;
    if (flat.length >= 3 && name.toLowerCase().startsWith(flat)) return code;
  }
  return "";
};

const TWO_YEAR_BODIES = new Set(["NJCAA", "CCCAA", "NWAC"]);

// ---- schools -------------------------------------------------------------
type School = {
  id: string; name: string; state: string; city: string; unitid: string;
  fedState: string; fedCity: string; fedWebsite: string; twoYear: string;
  programs: number; leagues: Set<string>; levels: Set<string>;
};
const schools = new Map<string, School>();
for (const r of data) {
  const id = r["university_id"]!;
  let s = schools.get(id);
  if (!s) {
    s = {
      id, name: r["school"] ?? "", state: r["stored_state"] ?? "", city: r["stored_city"] ?? "",
      unitid: r["ipeds_unitid"] ?? "", fedState: r["fed_state"] ?? "", fedCity: r["fed_city"] ?? "",
      fedWebsite: r["fed_website"] ?? "", twoYear: r["two_year"] ?? "",
      programs: 0, leagues: new Set(), levels: new Set(),
    };
    schools.set(id, s);
  }
  s.programs += 1;
  if (r["governing_body"]) s.leagues.add(r["governing_body"]!);
  if (r["division"]) s.levels.add(r["division"]!);
}
const contenderOf = (s: School): Contender => ({
  universityId: s.id, unitid: s.unitid ? Number(s.unitid) : null, name: s.name,
  storedState: s.state || null, storedCity: s.city || null,
  federalState: s.fedState || null, federalCity: s.fedCity || null,
  federalWebsite: s.fedWebsite || null,
  twoYear: s.twoYear === "t" ? true : s.twoYear === "f" ? false : null,
  federalTwoYear: s.twoYear === "t" ? true : s.twoYear === "f" ? false : null,
  leagueTwoYear: s.leagues.size ? [...s.leagues].some((b) => TWO_YEAR_BODIES.has(b)) : null,
} as Contender);

// ---- shared-platform detection ------------------------------------------
const schoolsPerDomain = new Map<string, Set<string>>();
for (const r of data) {
  const d = dom(r["athletic_website"] ?? "");
  if (!d) continue;
  if (!schoolsPerDomain.has(d)) schoolsPerDomain.set(d, new Set());
  schoolsPerDomain.get(d)!.add(r["university_id"]!);
}
const isPlatform = (d: string) =>
  !!d && ([...platforms].some((p) => d === p || d.endsWith(`.${p}`)) || (schoolsPerDomain.get(d)?.size ?? 0) >= 5);

const pageHolders = new Map<string, Set<string>>();
const pageUrl = new Map<string, string>();
for (const r of data) for (const f of ["roster_url", "coaching_staff_url"] as const) {
  const url = (r[f] ?? "").trim(); if (!url) continue;
  const k = key(url); if (!k) continue;
  if (!pageHolders.has(k)) pageHolders.set(k, new Set());
  pageHolders.get(k)!.add(r["university_id"]!);
  if (!pageUrl.has(k)) pageUrl.set(k, url);
}

// ---- per-link verdicts ---------------------------------------------------
const out: string[][] = [["program_id", "school", "stored_state", "fed_state", "sport", "governing_body", "field", "url", "verdict", "check_failed", "detail"]];
const tally = new Map<string, number>();
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
type Verdict = { verdict: string; failed: string; detail: string };

function judge(r: Row, field: "athletic_website" | "roster_url" | "coaching_staff_url", url: string): Verdict {
  const fedSite = r["fed_website"] ?? "";
  const fedState = codeOf(r["fed_state"] ?? "");
  const storedState = codeOf(r["stored_state"] ?? "");
  const d = dom(url);
  if (!r["ipeds_unitid"]) return { verdict: "reject", failed: "no_institution_id", detail: "School has no federal institution ID." };
  if (!fedSite) return { verdict: "not_evaluable", failed: "missing_federal_website", detail: "Federal website missing." };
  if (field === "athletic_website" && d && !isPlatform(d) && (schoolsPerDomain.get(d)?.size ?? 0) > 1)
    return { verdict: "reject", failed: "collision", detail: `Domain ${d} is attached to ${schoolsPerDomain.get(d)!.size} schools.` };
  if (field !== "athletic_website" && (pageHolders.get(key(url))?.size ?? 0) > 1)
    return { verdict: "reject", failed: "collision", detail: `This exact page is attached to ${pageHolders.get(key(url))!.size} schools.` };
  if (storedState && fedState && storedState !== fedState)
    return { verdict: "reject", failed: "state_mismatch", detail: `Stored ${storedState} vs federal ${fedState}.` };
  if (d && dom(fedSite) && d === dom(fedSite))
    return { verdict: "pass", failed: "", detail: "Same domain as the institution's own website." };
  return { verdict: "needs_link_check", failed: "website_domain_mismatch", detail: `${d} is not the institution's own domain (${dom(fedSite)}); would need a link from the institution site to pass.` };
}

for (const r of data) {
  for (const field of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
    const url = (r[field] ?? "").trim();
    if (!url) continue;
    const v = judge(r, field, url);
    bump(`${field}|${v.verdict}|${v.failed}`);
    out.push([r["program_id"]!, r["school"]!, r["stored_state"]!, r["fed_state"] ?? "", r["sport"]!, r["governing_body"] ?? "", field, url, v.verdict, v.failed, v.detail]);
  }
}

mkdirSync("/mnt/documents/diagnostic", { recursive: true });
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const write = (name: string, table: string[][]) =>
  writeFileSync(`/mnt/documents/diagnostic/${name}`, table.map((r) => r.map(esc).join(",")).join("\n") + "\n");

write("guard-dryrun.csv", out);
const summary: string[][] = [["field", "verdict", "check_failed", "count"]];
for (const [k, n] of [...tally].sort()) summary.push([...k.split("|"), String(n)]);
write("guard-dryrun-summary.csv", summary);

// ---- 3C collision worksheet ---------------------------------------------
// Which links each school holds, so we can say whether a non-owner keeps anything.
const linksOf = new Map<string, { field: string; url: string }[]>();
for (const r of data) for (const f of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
  const url = (r[f] ?? "").trim(); if (!url) continue;
  const list = linksOf.get(r["university_id"]!) ?? [];
  list.push({ field: f, url });
  linksOf.set(r["university_id"]!, list);
}

const ws: string[][] = [[
  "group_type", "address", "school_count", "school", "university_id", "ipeds_unitid", "state", "city",
  "federal_website", "federal_level", "leagues", "divisions", "program_count", "role",
  "determination", "evidence", "confidence", "links_to_clear", "surviving_links",
]];
let resolved = 0, ambiguous = 0, groups = 0;

function emitGroup(type: string, address: string, holderIds: string[]) {
  const cands = holderIds.map((id) => schools.get(id)!).filter(Boolean);
  if (cands.length < 2) return;
  groups += 1;
  const decision = pickOwnerAmongCandidates(address, cands.map(contenderOf));
  if (decision.confidence === "resolved") resolved += 1; else ambiguous += 1;
  for (const s of cands) {
    const owner = decision.ownerUniversityId === s.id;
    const mine = (linksOf.get(s.id) ?? []);
    const clearing = owner ? [] : mine.filter((l) => (type === "athletics_domain" ? dom(l.url) === dom(address) : key(l.url) === key(address)));
    const surviving = mine.filter((l) => !clearing.some((c) => c.url === l.url && c.field === l.field));
    ws.push([
      type, address, String(cands.length), s.name, s.id, s.unitid,
      codeOf(s.fedState || s.state), s.fedCity || s.city, s.fedWebsite,
      s.twoYear === "t" ? "two-year" : s.twoYear === "f" ? "four-year" : "",
      [...s.leagues].join("/"), [...s.levels].join("/"), String(s.programs),
      owner ? "rightful owner" : decision.ownerUniversityId ? "not the owner" : "undecided",
      owner ? "yes" : decision.ownerUniversityId ? "no" : "unknown",
      decision.evidence, decision.confidence,
      String(new Set(clearing.map((c) => `${c.field}`)).size ? [...new Set(clearing.map((c) => c.field))].join("/") : ""),
      String(new Set(surviving.map((l) => l.url)).size),
    ]);
  }
}

for (const [d, holders] of schoolsPerDomain) {
  if (holders.size < 2 || isPlatform(d)) continue;
  const sample = data.find((r) => dom(r["athletic_website"] ?? "") === d)?.["athletic_website"] ?? `https://${d}`;
  emitGroup("athletics_domain", sample, [...holders]);
}
for (const [k, holders] of pageHolders) {
  if (holders.size < 2) continue;
  emitGroup("page_url", pageUrl.get(k)!, [...holders]);
}
write("collision-worksheet.csv", ws);

// ---- 3D schools with no federal institution ID --------------------------
const noId: string[][] = [["school", "university_id", "state", "athletics_domains", "program_count", "leagues", "links_attached"]];
let noIdLinks = 0;
for (const s of [...schools.values()].filter((x) => !x.unitid).sort((a, b) => a.name.localeCompare(b.name))) {
  const mine = linksOf.get(s.id) ?? [];
  noIdLinks += mine.length;
  const domains = [...new Set(mine.filter((l) => l.field === "athletic_website").map((l) => dom(l.url)).filter(Boolean))];
  noId.push([s.name, s.id, codeOf(s.state), domains.join(" | "), String(s.programs), [...s.leagues].join("/"), String(mine.length)]);
}
write("no-federal-id.csv", noId);

console.log(summary.map((r) => r.join("  ")).join("\n"));
console.log("links judged:", out.length - 1);
console.log("collision groups:", groups, "resolved:", resolved, "ambiguous:", ambiguous, "worksheet rows:", ws.length - 1);
console.log("schools with no federal ID:", noId.length - 1, "links attached:", noIdLinks);
