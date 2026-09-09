/** Read-only: judge every stored link as if it were being written today. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { registrableDomain } from "../src/lib/program-ownership";
import { US_STATE_NAMES } from "../src/lib/data-quality";

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

const rows = parseCsv(readFileSync("/tmp/dryrun-in.csv", "utf8"));
const head = rows[0]!.map((h) => h.trim());
const data = rows.slice(1).filter((r) => r.length === head.length).map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Record<string, string>);

const platforms = new Set(
  readFileSync("/tmp/platforms.csv", "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean),
);

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; } };
const dom = (url: string) => { const h = host(url); return h ? registrableDomain(h) : ""; };
const key = (url: string) => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`; } catch { return url.trim().toLowerCase(); } };

// Domains serving 5+ distinct schools are shared platforms, not school-owned.
const schoolsPerDomain = new Map<string, Set<string>>();
for (const r of data) {
  const d = dom(r["athletic_website"] ?? "");
  if (!d) continue;
  if (!schoolsPerDomain.has(d)) schoolsPerDomain.set(d, new Set());
  schoolsPerDomain.get(d)!.add(r["university_id"]!);
}
const isPlatform = (d: string) =>
  !!d && ([...platforms].some((p) => d === p || d.endsWith(`.${p}`)) || (schoolsPerDomain.get(d)?.size ?? 0) >= 5);

const codeOf = (state: string) => {
  const s = (state ?? "").trim();
  if (!s) return "";
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const flat = s.replace(/\./g, "").toLowerCase();
  for (const [code, name] of Object.entries(US_STATE_NAMES)) if (name.toLowerCase() === flat) return code;
  return "";
};

// Who else holds each domain / exact page.
const domainHolders = schoolsPerDomain;
const pageHolders = new Map<string, Set<string>>();
for (const r of data) for (const f of ["roster_url", "coaching_staff_url"]) {
  const k = key(r[f] ?? ""); if (!k) continue;
  if (!pageHolders.has(k)) pageHolders.set(k, new Set());
  pageHolders.get(k)!.add(r["university_id"]!);
}

const TWO_YEAR_BODIES = new Set(["NJCAA", "CCCAA", "NWAC"]);
const out: string[][] = [["program_id", "school", "stored_state", "fed_state", "sport", "governing_body", "field", "url", "verdict", "check_failed", "detail"]];
const tally = new Map<string, number>();
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);

for (const r of data) {
  for (const field of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
    const url = (r[field] ?? "").trim();
    if (!url) continue;
    const fedSite = r["fed_website"] ?? "";
    const fedState = codeOf(r["fed_state"] ?? "");
    const storedState = codeOf(r["stored_state"] ?? "");
    const d = dom(url);
    let verdict = "pass", failed = "", detail = "";

    if (!r["ipeds_unitid"]) { verdict = "reject"; failed = "no_institution_id"; detail = "School has no federal institution ID."; }
    else if (!fedSite || !r["two_year"]) { verdict = "not_evaluable"; failed = "missing_federal_data"; detail = "Federal website or level missing."; }
    else if (field === "athletic_website" && d && !isPlatform(d) && (domainHolders.get(d)?.size ?? 0) > 1) {
      verdict = "reject"; failed = "collision"; detail = `Domain ${d} is attached to ${domainHolders.get(d)!.size} schools.`;
    } else if (field !== "athletic_website" && (pageHolders.get(key(url))?.size ?? 0) > 1) {
      verdict = "reject"; failed = "collision"; detail = `This exact page is attached to ${pageHolders.get(key(url))!.size} schools.`;
    } else if (storedState && fedState && storedState !== fedState) {
      verdict = "reject"; failed = "state_mismatch"; detail = `Stored ${storedState} vs federal ${fedState}.`;
    } else if (r["two_year"] === "t" ? !TWO_YEAR_BODIES.has(r["governing_body"] ?? "") : TWO_YEAR_BODIES.has(r["governing_body"] ?? "")) {
      verdict = "reject"; failed = "level_mismatch"; detail = `Federal two-year=${r["two_year"]} vs ${r["governing_body"]}.`;
    } else if (d && dom(fedSite) && d === dom(fedSite)) {
      detail = "Same domain as the institution's own website.";
    } else {
      verdict = "needs_link_check"; failed = "website_domain_mismatch";
      detail = `${d} is not the institution's own domain (${dom(fedSite)}); would need a link from the institution site to pass.`;
    }

    bump(`${field}|${verdict}|${failed}`);
    out.push([r["program_id"]!, r["school"]!, r["stored_state"]!, r["fed_state"] ?? "", r["sport"]!, r["governing_body"] ?? "", field, url, verdict, failed, detail]);
  }
}

mkdirSync("/mnt/documents/diagnostic", { recursive: true });
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync("/mnt/documents/diagnostic/guard-dryrun.csv", out.map((r) => r.map(esc).join(",")).join("\n") + "\n");

const summary: string[][] = [["field", "verdict", "check_failed", "count"]];
for (const [k, n] of [...tally].sort()) summary.push([...k.split("|"), String(n)]);
writeFileSync("/mnt/documents/diagnostic/guard-dryrun-summary.csv", summary.map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(summary.map((r) => r.join("  ")).join("\n"));
console.log("rows judged:", out.length - 1);
