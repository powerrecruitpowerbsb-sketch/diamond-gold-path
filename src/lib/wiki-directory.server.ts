/**
 * Layer 1, part two: the universe for the bodies that do NOT publish a machine
 * readable member list.
 *
 * NAIA, NJCAA, CCCAA and NWAC all sit behind bot protection (CloudFront 403s and
 * human-check walls) and render their team pages client-side, so scraping them is
 * both fragile and expensive. Wikipedia keeps maintained member tables for each
 * of those bodies, and MediaWiki hands us the raw wikitext over a free, stable
 * API — deterministic parsing, no AI, no scrape credits.
 *
 * These lists say who belongs to the body, not who sponsors each sport, so the
 * programs land `unverified`; the roster/coach stage later confirms or retires
 * them.
 */

import type { DirectoryRow } from "@/lib/directory-import.server";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "PowerRecruit/1.0 (college recruiting research; contact: powerrecruit.powerbsb@gmail.com)";

export const WIKI_BODIES = ["NAIA", "NJCAA", "CCCAA", "NWAC"] as const;
export type WikiBody = (typeof WIKI_BODIES)[number];

/** One fetchable slice of the non-NCAA universe. */
export const WIKI_SLICES: { key: string; body: WikiBody; label: string; division: string | null }[] = [
  { key: "naia", body: "NAIA", label: "NAIA members", division: null },
  { key: "njcaa-d1", body: "NJCAA", label: "NJCAA Division I members", division: "D1" },
  { key: "njcaa-d2", body: "NJCAA", label: "NJCAA Division II members", division: "D2" },
  { key: "njcaa-d3", body: "NJCAA", label: "NJCAA Division III members", division: "D3" },
  { key: "cccaa", body: "CCCAA", label: "CCCAA members", division: null },
  { key: "nwac", body: "NWAC", label: "NWAC members", division: null },
];

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function stateCode(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  const key = raw.toLowerCase().replace(/\s*\(u\.s\. state\)\s*/i, "").trim();
  return STATE_CODES[key] ?? null;
}

/** `[[Page|Shown]]` / `[[Page]]` / `'''bold'''` -> plain text. */
function plain(value: string): string {
  return value
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First `[[wiki link]]` target in a chunk of wikitext, unpiped. */
function firstLinkTarget(value: string): string | null {
  const match = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(value);
  return match ? match[1]!.trim() : null;
}

/** School names come from the link *label*, which is the common-usage name. */
function firstLinkLabel(value: string): string | null {
  const match = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(value);
  if (!match) return null;
  return plain(match[2] || match[1]!);
}

async function fetchWikitext(page: string, section?: number): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  if (section !== undefined) params.set("section", String(section));

  const response = await fetch(`${WIKI_API}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wikipedia request failed [${response.status}]: ${body.slice(0, 160)}`);
  }
  const payload = (await response.json()) as any;
  const text = payload?.parse?.wikitext;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`No member table found on the "${page}" page`);
  }
  return text;
}

type MemberRow = {
  name: string;
  state: string | null;
  conference: string | null;
  division: string | null;
};

/** Split a wikitable into its rows, each row a list of cell strings. */
function tableRows(wikitext: string): string[][] {
  const start = wikitext.indexOf('{|');
  if (start < 0) return [];
  // Only the first table: pages usually follow the member list with unrelated
  // tables (sports sponsored, championship history).
  const rest = wikitext.slice(start);
  const end = rest.search(/\n\|\}/);
  const table = end >= 0 ? rest.slice(0, end) : rest;
  return table
    .split(/\n\|-/)
    .slice(1)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => /^\s*[|!]/.test(line))
        .flatMap((line) => line.replace(/^\s*[|!]/, "").split("||"))
        .map((cell) => cell.replace(/^\s*scope="?(row|col)"?\s*\|/i, "").trim()),
    )
    .filter((cells) => cells.length > 1);
}

/** NAIA: one wikitable of School | Nickname | City | State | Enrollment | Conference. */
async function naiaMembers(): Promise<MemberRow[]> {
  const text = await fetchWikitext("List of NAIA institutions");
  const rows: MemberRow[] = [];
  for (const cells of tableRows(text)) {
    const name = firstLinkLabel(cells[0] ?? "");
    if (!name) continue;
    // Departing members are struck through with a background colour; keep them,
    // the scrape stage retires anything that no longer sponsors the sport.
    const state = stateCode(firstLinkTarget(cells[3] ?? "")?.split(",").pop()?.trim() ?? plain(cells[3] ?? ""));
    const conference = plain(cells[5] ?? "") || null;
    rows.push({ name, state, conference, division: null });
  }
  return rows;
}

/** NJCAA: `===State===` headings over `*[[School]] Nickname in [[City]]` bullets. */
async function njcaaMembers(division: string): Promise<MemberRow[]> {
  const roman = division === "D1" ? "I" : division === "D2" ? "II" : "III";
  const text = await fetchWikitext(`List of NJCAA Division ${roman} schools`);
  const rows: MemberRow[] = [];
  let state: string | null = null;

  for (const line of text.split("\n")) {
    const heading = /^===\s*([^=]+?)\s*===$/.exec(line);
    if (heading) {
      state = stateCode(heading[1]!);
      continue;
    }
    if (!/^\*\s*\[\[/.test(line)) continue;
    const name = firstLinkLabel(line);
    if (!name) continue;
    rows.push({ name, state, conference: null, division });
  }
  return rows;
}

/** CCCAA: conference headings over bullet lists; every member is in California. */
async function cccaaMembers(): Promise<MemberRow[]> {
  const text = await fetchWikitext("California Community College Athletic Association");
  const lines = text.split("\n");
  const startAt = lines.findIndex((line) => /^==\s*Conferences\s*==\s*$/.test(line));
  if (startAt < 0) throw new Error("The CCCAA conference list has moved");

  const rows: MemberRow[] = [];
  let conference: string | null = null;
  let subdivision: string | null = null;

  for (const raw of lines.slice(startAt + 1)) {
    // Some headings carry an anchor <span>, so strip markup before matching.
    const line = raw.replace(/<[^>]+>/g, "").trim();
    const heading = /^(={2,4})\s*(.+?)\s*\1$/.exec(line);
    if (heading) {
      const depth = heading[1]!.length;
      if (depth === 2) break; // left the Conferences section
      if (depth === 3) {
        conference = plain(heading[2]!);
        subdivision = null;
      } else {
        subdivision = plain(heading[2]!);
      }
      continue;
    }
    if (!/^\*\s*\[\[/.test(line)) continue;
    const name = firstLinkLabel(line);
    if (!name || !conference) continue;
    rows.push({
      name,
      state: "CA",
      conference: subdivision ? `${conference} (${subdivision})` : conference,
      division: null,
    });
  }
  return rows;
}

/** NWAC: one members table; its "Division" column is a geographic region. */
async function nwacMembers(): Promise<MemberRow[]> {
  const text = await fetchWikitext("Northwest Athletic Conference");
  const membersAt = text.search(/^===\s*Current members\s*===/m);
  if (membersAt < 0) throw new Error("The NWAC member table has moved");
  const rows: MemberRow[] = [];

  for (const cells of tableRows(text.slice(membersAt))) {
    const name = firstLinkLabel(cells[0] ?? "");
    const location = plain(cells[1] ?? "");
    // The sports-sponsorship table further down the page has no "City, State"
    // column, which is how a member row is told apart from it.
    if (!name || !location.includes(",")) continue;
    const region = plain(cells[cells.length - 1] ?? "");
    rows.push({
      name,
      state: stateCode(location.split(",").pop()?.trim() ?? ""),
      conference: /^(Northern|Southern|Eastern|Western|North|South|East|West)$/i.test(region)
        ? `NWAC ${region}`
        : "NWAC",
      division: null,
    });
  }
  return rows;
}

async function membersFor(slice: (typeof WIKI_SLICES)[number]): Promise<MemberRow[]> {
  switch (slice.body) {
    case "NAIA":
      return naiaMembers();
    case "NJCAA":
      return njcaaMembers(slice.division ?? "D1");
    case "CCCAA":
      return cccaaMembers();
    case "NWAC":
      return nwacMembers();
  }
}

/**
 * Fetch one non-NCAA slice as directory rows — a baseball and a softball program
 * per member school, both `unverified` because the source proves membership, not
 * sport sponsorship.
 */
export async function fetchWikiDirectory(sliceKey: string): Promise<DirectoryRow[]> {
  const slice = WIKI_SLICES.find((candidate) => candidate.key === sliceKey);
  if (!slice) throw new Error(`Unknown directory slice: ${sliceKey}`);

  const members = await membersFor(slice);
  const seen = new Set<string>();
  const rows: DirectoryRow[] = [];

  for (const member of members) {
    const key = member.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const sport of ["baseball", "softball"] as const) {
      rows.push({
        name: member.name,
        state: member.state,
        sport,
        governingBody: slice.body,
        division: member.division ?? slice.division ?? "",
        conference: member.conference,
        websiteUrl: null,
        athleticWebsite: null,
        offeringStatus: "unverified",
      });
    }
  }
  return rows;
}
