/**
 * Server-only URL discovery: find a school's official athletics site with a real
 * web search (never model recall), then map that site for sport-specific roster
 * and coaching pages. Everything lands in url_discovery_queue for staff review —
 * live records are never written here.
 *
 * Identity rule: a candidate address is only ever offered for a school whose
 * federal institution record it can be tied back to. Name-token overlap is used
 * to order candidates, never to accept one.
 */

import { mentionsOtherState } from "@/lib/data-quality";
import {
  loadInstitution,
  verifyCandidateForInstitution,
  type Institution,
  type MatchEvidence,
} from "@/lib/institution-identity.server";
import { classifyLink, isSchoolHomepage } from "@/lib/link-quality";

const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";

export type DiscoveryType = "athletic_website" | "roster_page" | "coaching_staff_page";
export type Confidence = "high" | "low" | "failed";

export type DiscoveryResult = {
  discoveryType: DiscoveryType;
  programId: string | null;
  sport: string | null;
  url: string | null;
  confidence: Confidence;
  notes: string;
  /** Which identity check justified (or refused) this address. */
  evidence?: MatchEvidence | null;
};

export type DiscoveryOutcome = {
  universityId: string;
  universityName: string;
  results: DiscoveryResult[];
  errorMessage: string | null;
};

/** Never propose one of these as a school's own athletics site. */
const NON_OFFICIAL = [
  "wikipedia.org",
  "ncaa.com",
  "ncaa.org",
  "naia.org",
  "njcaa.org",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "linkedin.com",
  "maxpreps.com",
  "rivals.com",
  "247sports.com",
  "hudl.com",
  "prepbaseballreport.com",
  "perfectgame.org",
  "collegefactual.com",
  "niche.com",
  "usnews.com",
  "athleticnet.com",
  "eab.com",
  "indeed.com",
];

const NAME_STOPWORDS = new Set([
  "university",
  "college",
  "of",
  "the",
  "at",
  "and",
  "community",
  "school",
  "institute",
  "campus",
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function firecrawl(path: string, body: unknown): Promise<any> {
  const lovableKey = requireEnv("LOVABLE_API_KEY");
  // Power's own Firecrawl account — search/map credits bill to that plan.
  const firecrawlKey = requireEnv("FIRECRAWL_API_KEY_1");

  const response = await fetch(`${GATEWAY_FIRECRAWL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Firecrawl ${path} failed [${response.status}]: ${text}`);
    if (response.status === 402 || /credit limit reached|not enough credits/i.test(text)) {
      throw new Error(
        "the Firecrawl scraping account is out of credits — top it up before running more discovery",
      );
    }
    throw new Error(`Firecrawl ${path} returned ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function nameTokens(name: string): string[] {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !NAME_STOPWORDS.has(token));
}

/** 0-1: how much of the school's name shows up in the host name. */
export function nameMatchScore(name: string, url: string): number {
  const host = hostOf(url).replace(/\.[a-z.]+$/i, "");
  if (!host) return 0;
  const tokens = nameTokens(name);
  if (!tokens.length) return 0;
  const flat = host.replace(/[^a-z0-9]/g, "");
  let hits = 0;
  for (const token of tokens) {
    const stem = token.slice(0, Math.max(4, Math.min(token.length, 6)));
    if (flat.includes(stem)) hits += 1;
  }
  // Initialisms: "goutsa.com" for "University of Texas at San Antonio".
  const initials = tokens.map((t) => t[0]).join("");
  if (initials.length >= 2 && flat.includes(initials)) hits = Math.max(hits, tokens.length - 1);
  return hits / tokens.length;
}

function looksLikeAthletics(url: string, title: string): boolean {
  const host = hostOf(url);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return (
    /athletic|sports|gogriz|^go[a-z]/.test(host) ||
    /athletic|sports/.test(host) ||
    /^\/athletics?/.test(path) ||
    /athletics/i.test(title)
  );
}

export function isNonOfficial(url: string): boolean {
  const host = hostOf(url);
  return NON_OFFICIAL.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/** Comparable form of a URL, so a rejected link is recognised however it was written. */
export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(String(url));
    return `${parsed.hostname.replace(/^www\./i, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return String(url).trim().toLowerCase().replace(/\/+$/, "");
  }
}

/** Links a person already declined for this school, so they never come back. */
export async function loadRejectedUrls(
  supabase: any,
  universityId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("url_discovery_queue")
    .select("discovered_url")
    .eq("university_id", universityId)
    .eq("status", "rejected");
  const blocked = new Set<string>();
  for (const row of (data ?? []) as { discovered_url: string | null }[]) {
    const key = normalizeUrl(row.discovered_url);
    if (key) blocked.add(key);
  }
  return blocked;
}


type Candidate = { url: string; title: string };

/** Follow a school website one hop to whatever athletics section lives inside it. */
async function findAthleticsSection(
  origin: string,
  excluded: Set<string>,
): Promise<string | null> {
  const found = new Set<string>();
  for (const term of ["athletics", "sports"]) {
    try {
      const payload = await firecrawl("/map", { url: origin, search: term, limit: 150 });
      for (const link of readMapLinks(payload)) found.add(link);
    } catch (failure) {
      console.error("Firecrawl map failed while looking for an athletics section", failure);
    }
  }

  const candidates = [...found].filter((url) => {
    if (excluded.has(normalizeUrl(url))) return false;
    if (/\.pdf($|[?#])/i.test(url)) return false;
    return /(athletic|sports|teams)/i.test(url);
  });
  if (!candidates.length) return null;

  // Shortest matching path wins: that is the section index rather than a story
  // or a single team page buried inside it.
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0] ?? null;
}

function readSearchResults(payload: any): Candidate[] {
  const raw = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.web)
      ? payload.data.web
      : Array.isArray(payload?.web)
        ? payload.web
        : [];
  return raw
    .map((row: any) => ({ url: String(row?.url ?? ""), title: String(row?.title ?? "") }))
    .filter((row: Candidate) => /^https?:\/\//i.test(row.url));
}

/**
 * Search the web for the school's athletics site, then verify candidates against
 * the school's federal institution record. Name-token overlap only decides the
 * order in which candidates are checked; acceptance is an identity question.
 */
export type CandidateTrace = (row: {
  stage: DiscoveryType;
  sport: string | null;
  url: string;
  outcome: "accepted" | "rejected" | "skipped";
  reason: string;
}) => void;

export async function discoverAthleticWebsite(
  supabase: any,
  inst: Institution,
  excluded: Set<string> = new Set(),
  schoolWebsite: string | null = null,
  trace?: CandidateTrace,
): Promise<DiscoveryResult> {
  const name = inst.federalName ?? inst.storedName;
  const state = inst.federalState ?? inst.storedState;

  // No institution ID means there is nothing to verify against. The result goes
  // to review; it never reaches the record.
  if (!inst.unitid) {
    return {
      discoveryType: "athletic_website",
      programId: null,
      sport: null,
      url: null,
      confidence: "failed",
      notes:
        "This school has no federal institution ID yet. Its identity has to be settled before any website can be attached.",
      evidence: null,
    };
  }

  const query = `${name}${state ? ` ${state}` : ""} official athletics website`;
  const payload = await firecrawl("/search", { query, limit: 8 });
  const isBlocked = (url: string) => {
    if (excluded.has(normalizeUrl(url))) return true;
    try {
      return excluded.has(normalizeUrl(new URL(url).origin));
    } catch {
      return false;
    }
  };
  const candidates = readSearchResults(payload).filter((row) => {
    if (isNonOfficial(row.url)) {
      trace?.({ stage: "athletic_website", sport: null, url: row.url, outcome: "skipped", reason: "not an official school address (aggregator, social or directory site)" });
      return false;
    }
    if (isBlocked(row.url)) {
      trace?.({ stage: "athletic_website", sport: null, url: row.url, outcome: "skipped", reason: "already declined for this school" });
      return false;
    }
    return true;
  });

  if (!candidates.length) {
    return {
      discoveryType: "athletic_website",
      programId: null,
      sport: null,
      url: null,
      confidence: "failed",
      notes: "Web search returned no plausible official athletics site.",
      evidence: null,
    };
  }

  const scored = candidates
    .map((row) => {
      const score = nameMatchScore(name, row.url);
      const athletics = looksLikeAthletics(row.url, row.title);
      // "Southeastern University" (FL) must not be matched to "Southeastern
      // Oklahoma State" just because the domain shares a word.
      const wrongState = mentionsOtherState(`${row.title} ${row.url}`, state);
      return { ...row, score, athletics, wrongState };
    })
    .sort(
      (a, b) =>
        Number(a.wrongState) - Number(b.wrongState) ||
        Number(b.athletics) - Number(a.athletics) ||
        b.score - a.score,
    );

  const originOf = (url: string) => {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  };

  // Walk candidates in order and keep the first one the institution record can
  // actually vouch for. A candidate that fails is refused, not downgraded.
  let lastRefusal: MatchEvidence | null = null;
  for (const row of scored) {
    const origin = originOf(row.url);

    // Athletics inside the school's own website: step into the athletics section.
    if (isSchoolHomepage(origin, schoolWebsite ?? origin)) {
      const section = await findAthleticsSection(origin, excluded);
      const target = section ?? null;
      if (!target) {
        trace?.({ stage: "athletic_website", sport: null, url: origin, outcome: "rejected", reason: "school website has no athletics section that could be found" });
        continue;
      }
      const verdict = await verifyCandidateForInstitution(supabase, inst, target, {
        title: row.title,
      });
      if (!verdict.ok) {
        lastRefusal = verdict.evidence;
        trace?.({ stage: "athletic_website", sport: null, url: target, outcome: "rejected", reason: verdict.evidence.detail });
        continue;
      }
      trace?.({ stage: "athletic_website", sport: null, url: target, outcome: "accepted", reason: verdict.evidence.detail });
      return {
        discoveryType: "athletic_website",
        programId: null,
        sport: null,
        url: target,
        confidence: "high",
        notes: `Athletics sits inside the school's own website. ${verdict.evidence.detail}`,
        evidence: verdict.evidence,
      };
    }

    const verdict = await verifyCandidateForInstitution(supabase, inst, origin, {
      title: row.title,
    });
    if (!verdict.ok) {
      lastRefusal = verdict.evidence;
      trace?.({ stage: "athletic_website", sport: null, url: origin, outcome: "rejected", reason: verdict.evidence.detail });
      continue;
    }

    const reasons: string[] = [];
    if (!row.athletics) reasons.push("the domain doesn't look like an athletics site");
    trace?.({ stage: "athletic_website", sport: null, url: origin, outcome: "accepted", reason: verdict.evidence.detail });
    return {
      discoveryType: "athletic_website",
      programId: null,
      sport: null,
      url: origin,
      confidence: reasons.length ? "low" : "high",
      notes: reasons.length
        ? `${verdict.evidence.detail} Still worth a look: ${reasons.join("; ")}.`
        : verdict.evidence.detail,
      evidence: verdict.evidence,
    };
  }

  return {
    discoveryType: "athletic_website",
    programId: null,
    sport: null,
    url: null,
    confidence: "failed",
    notes: lastRefusal
      ? `No candidate could be tied to this institution. Closest attempt: ${lastRefusal.detail}`
      : "No candidate could be tied to this institution's own website.",
    evidence: lastRefusal,
  };
}

const ROSTER_PATTERN = /roster/i;
const COACH_PATTERN = /coach|staff|directory/i;

function sportPattern(sport: string): RegExp {
  return sport === "softball" ? /softball|sball/i : /baseball|bsb/i;
}

function readMapLinks(payload: any): string[] {
  const raw = Array.isArray(payload?.links)
    ? payload.links
    : Array.isArray(payload?.data?.links)
      ? payload.data.links
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return raw
    .map((row: any) => (typeof row === "string" ? row : String(row?.url ?? "")))
    .filter((url: string) => /^https?:\/\//i.test(url));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Sidearm sites carry a page per player and an archive page per season, and both
 * contain the word "roster". Only the index page is useful, so a path that ends
 * in something else — a name, a jersey number, a year — is never treated as the
 * roster page.
 */
function isIndexPage(url: string, kind: "roster" | "coach"): boolean {
  const path = pathOf(url);
  return kind === "roster"
    ? /\/roster$/.test(path)
    : /\/(coaches|staff|coaching-staff|staff-directory)$/.test(path);
}

function pickPageUrl(links: string[], sport: string, kind: "roster" | "coach") {
  const sportRe = sportPattern(sport);
  const kindRe = kind === "roster" ? ROSTER_PATTERN : COACH_PATTERN;

  const sportMatches = links.filter((url) => sportRe.test(url) && kindRe.test(url));
  const indexPages = sportMatches.filter((url) => isIndexPage(url, kind));
  if (indexPages.length) {
    indexPages.sort((a, b) => pathOf(a).length - pathOf(b).length);
    return {
      url: indexPages[0]!,
      confidence: "high" as Confidence,
      note: "Sport-specific page found in the site map.",
    };
  }
  // Site maps often only return deep links ("/roster/2024", "/roster/jane-doe/12").
  // The index page is that same path trimmed at the roster/coaches segment.
  for (const url of sportMatches) {
    const segment = kind === "roster" ? "roster" : "coaches";
    const path = pathOf(url);
    const index = path.indexOf(`/${segment}/`);
    if (index === -1) continue;
    try {
      const origin = new URL(url).origin;
      return {
        url: `${origin}${path.slice(0, index)}/${segment}`,
        confidence: "high" as Confidence,
        note: "Sport-specific page found in the site map.",
      };
    } catch {
      continue;
    }
  }

  if (sportMatches.length) {
    // Right sport, but only a player page or a season archive was found.
    sportMatches.sort((a, b) => pathOf(a).length - pathOf(b).length);
    return {
      url: sportMatches[0]!,
      confidence: "low" as Confidence,
      note: "Only a player or season-archive page was found, not the main page — worth checking.",
    };
  }
  const loose = links.filter((url) => kindRe.test(url) && /sports|athletic/i.test(url));
  if (loose.length) {
    loose.sort((a, b) => pathOf(a).length - pathOf(b).length);
    return {
      url: loose[0]!,
      confidence: "low" as Confidence,
      note: "Page matched the link pattern but isn't clearly sport-specific.",
    };
  }
  return null;
}


/**
 * Map the athletics site and pick roster + coaching pages per sport program.
 * Every pick is verified against the school's institution record before it is
 * offered, exactly as the athletics domain is.
 */
export async function discoverProgramPages(
  supabase: any,
  inst: Institution,
  athleticSite: string,
  programs: { id: string; sport: string }[],
  excluded: Set<string> = new Set(),
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  if (!inst.unitid) {
    for (const program of programs) {
      for (const discoveryType of ["roster_page", "coaching_staff_page"] as DiscoveryType[]) {
        results.push({
          discoveryType,
          programId: program.id,
          sport: program.sport,
          url: null,
          confidence: "failed",
          notes:
            "This school has no federal institution ID yet, so pages can't be tied to it. Settle the identity first.",
          evidence: null,
        });
      }
    }
    return results;
  }

  const links = new Set<string>();

  for (const term of ["roster", "coaches"]) {
    try {
      const payload = await firecrawl("/map", { url: athleticSite, search: term, limit: 300 });
      for (const link of readMapLinks(payload)) links.add(link);
    } catch (failure) {
      console.error("Firecrawl map failed", failure);
    }
  }

  // Anything a person already declined for this school is a dead end.
  const all = [...links].filter((url) => !excluded.has(normalizeUrl(url)));

  for (const program of programs) {
    for (const kind of ["roster", "coach"] as const) {
      const discoveryType: DiscoveryType = kind === "roster" ? "roster_page" : "coaching_staff_page";
      const candidate = all.length ? pickPageUrl(all, program.sport, kind) : null;
      const pick = candidate && excluded.has(normalizeUrl(candidate.url)) ? null : candidate;

      let evidence: MatchEvidence | null = null;
      let url = pick?.url ?? null;
      let confidence: Confidence = pick?.confidence ?? "failed";
      let notes =
        pick?.note ??
        (all.length
          ? `No ${kind === "roster" ? "roster" : "coaching staff"} page found for ${program.sport}.`
          : "The athletics site returned no mappable links.");

      if (url) {
        const verdict = await verifyCandidateForInstitution(supabase, inst, url);
        evidence = verdict.evidence;
        if (verdict.ok) {
          notes = `${notes} ${verdict.evidence.detail}`.trim();
        } else {
          url = null;
          confidence = "failed";
          notes = `Refused: ${verdict.evidence.detail}`;
        }
      }

      results.push({
        discoveryType,
        programId: program.id,
        sport: program.sport,
        url,
        confidence,
        notes,
        evidence,
      });
    }
  }

  return results;
}

/** One school end to end: search, map, then stage every result for review. */
export async function discoverUniversityUrls(
  supabase: any,
  universityId: string,
): Promise<DiscoveryOutcome> {
  const { data: school, error } = await supabase
    .from("universities")
    .select("id, name, state, athletic_site:website_url")
    .eq("id", universityId)
    .single();
  if (error) throw new Error(error.message);

  // Identity first: everything below is judged against the institution record.
  const inst = await loadInstitution(supabase, universityId);
  const name = String((school as any).name ?? "");

  const { data: programs, error: programError } = await supabase
    .from("programs")
    .select("id, sport")
    .eq("university_id", universityId)
    // A sport the school doesn't field has no pages to find.
    .neq("offering_status", "not_offered");
  if (programError) throw new Error(programError.message);

  const results: DiscoveryResult[] = [];
  let errorMessage: string | null = null;
  const excluded = await loadRejectedUrls(supabase, universityId);

  try {
    const site = await discoverAthleticWebsite(
      supabase,
      inst,
      excluded,
      ((school as any).athletic_site ?? null) as string | null,
    );
    results.push(site);
    if (site.url) {
      const pageResults = await discoverProgramPages(
        supabase,
        inst,
        site.url,
        (programs ?? []) as { id: string; sport: string }[],
        excluded,
      );
      results.push(...pageResults);
    }
  } catch (failure) {
    errorMessage = failure instanceof Error ? failure.message : "Discovery failed";
  }


  // Apply the same link-quality rules a person would apply on the review screen,
  // so plainly wrong links never reach the approval list at all.
  const { data: schoolRow } = await supabase
    .from("universities")
    .select("website_url")
    .eq("id", universityId)
    .maybeSingle();

  for (const result of results) {
    if (result.url) {
      const verdict = classifyLink({
        kind: result.discoveryType,
        url: result.url,
        sport: result.sport ?? null,
        schoolWebsite: (schoolRow as any)?.website_url ?? null,
      });
      if (verdict.action === "reject") {
        result.url = null;
        result.confidence = "failed";
        result.notes = `Discarded automatically: ${verdict.reason}`;
      } else if (verdict.normalizedUrl) {
        // Found on one team's page — keep the athletics home page instead.
        result.url = verdict.normalizedUrl;
      }

    }
  }

  for (const result of results) {
    // Refresh the open proposal for this school/program/link kind rather than
    // stacking duplicates in the queue on a re-run.
    await supabase
      .from("url_discovery_queue")
      .delete()
      .eq("university_id", universityId)
      .eq("discovery_type", result.discoveryType)
      .eq("status", "pending_review")
      .filter("program_id", result.programId ? "eq" : "is", result.programId ?? null);

    const { error: insertError } = await supabase.from("url_discovery_queue").insert({
      university_id: universityId,
      program_id: result.programId,
      discovery_type: result.discoveryType,
      discovered_url: result.url,
      confidence: result.confidence,
      notes: result.notes,
      match_evidence: result.evidence ?? null,
    });
    if (insertError) console.error("Could not queue discovered URL", insertError.message);
  }

  return { universityId, universityName: name, results, errorMessage };
}

/**
 * Write a confirmed URL into the live field it belongs to.
 *
 * This is the last gate before a live record changes, so the identity check runs
 * again here — a proposal raised before the school's institution ID was resolved,
 * or one confirmed by hand, still has to be tied to the institution.
 */
export async function applyDiscoveredUrl(
  supabase: any,
  row: {
    id: string;
    university_id: string;
    program_id: string | null;
    discovery_type: DiscoveryType;
    discovered_url: string | null;
  },
) {
  if (!row.discovered_url) throw new Error("There's no URL on this item to confirm");

  const inst = await loadInstitution(supabase, row.university_id);
  if (!inst.unitid) {
    throw new Error(
      "This school has no federal institution ID yet — settle its identity before attaching a website.",
    );
  }
  const verdict = await verifyCandidateForInstitution(supabase, inst, row.discovered_url);
  if (!verdict.ok) {
    // Refused, and the refusal is kept where a person can see it.
    await supabase
      .from("url_discovery_queue")
      .update({
        status: "pending_review",
        notes: `Refused on save: ${verdict.evidence.detail}`,
        match_evidence: verdict.evidence,
      })
      .eq("id", row.id);
    throw new Error(`Refused: ${verdict.evidence.detail}`);
  }

  const evidence = verdict.evidence;

  if (row.discovery_type === "athletic_website") {
    const { error } = await supabase
      .from("universities")
      .update({ website_url: row.discovered_url })
      .eq("id", row.university_id);
    if (error) throw new Error(error.message);

    // The school's athletics site is also the program-level athletics link.
    const { error: programError } = await supabase
      .from("programs")
      .update({ athletic_website: row.discovered_url, link_evidence: evidence })
      .eq("university_id", row.university_id)
      .is("athletic_website", null);
    if (programError) throw new Error(programError.message);
    return;
  }

  if (!row.program_id) throw new Error("This item isn't linked to a program");
  const field = row.discovery_type === "roster_page" ? "roster_url" : "coaching_staff_url";
  const { error } = await supabase
    .from("programs")
    .update({ [field]: row.discovered_url, link_evidence: evidence })
    .eq("id", row.program_id);
  if (error) throw new Error(error.message);
}

/** How many times a person has already declined a link of this kind for a school. */
export async function rejectedCount(
  supabase: any,
  universityId: string,
  discoveryType: DiscoveryType,
): Promise<number> {
  const { count } = await supabase
    .from("url_discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("university_id", universityId)
    .eq("discovery_type", discoveryType)
    .eq("status", "rejected");
  return count ?? 0;
}

export const REJECT_RESEARCH_LIMIT = 3;

/**
 * Send a school back for a fresh link search. Stops after a few rounds so a
 * school whose site simply can't be found doesn't loop forever.
 */
export async function requeueSchoolForDiscovery(
  supabase: any,
  universityId: string,
  discoveryType?: DiscoveryType,
): Promise<{ requeued: boolean; reason: string }> {
  if (discoveryType) {
    const tries = await rejectedCount(supabase, universityId, discoveryType);
    if (tries >= REJECT_RESEARCH_LIMIT) {
      return {
        requeued: false,
        reason: `Searched ${tries} times already — this one needs a link pasted in by hand.`,
      };
    }
  }

  const { data: existing } = await supabase
    .from("ingest_queue")
    .select("id")
    .eq("university_id", universityId)
    .eq("stage", "url_discovery")
    .limit(1);

  if (existing && existing.length) {
    const { error } = await supabase
      .from("ingest_queue")
      .update({ status: "pending", attempts: 0, last_error: null, leased_at: null })
      .eq("id", (existing[0] as { id: string }).id);
    if (error) return { requeued: false, reason: error.message };
    return { requeued: true, reason: "Queued for a fresh search." };
  }

  const { error } = await supabase
    .from("ingest_queue")
    .insert({ university_id: universityId, stage: "url_discovery", status: "pending" });
  if (error) return { requeued: false, reason: error.message };
  return { requeued: true, reason: "Queued for a fresh search." };
}

/**
 * A person typed in the school's real athletics site (search kept guessing the
 * wrong domain). Save it for every sport the school fields, forget the wrong
 * guesses, then look for that school's roster and staff pages inside the
 * correct site only.
 */
export async function setAthleticsSiteByHand(
  supabase: any,
  universityId: string,
  url: string,
  userId: string | null,
): Promise<{ programs: number; found: number; searched: boolean; message: string }> {
  const site = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  })();

  const { data: programs, error: programError } = await supabase
    .from("programs")
    .select("id, sport")
    .eq("university_id", universityId)
    .neq("offering_status", "not_offered");
  if (programError) throw new Error(programError.message);

  const list = (programs ?? []) as { id: string; sport: string }[];
  if (list.length) {
    const { error } = await supabase
      .from("programs")
      .update({ athletic_website: site })
      .in(
        "id",
        list.map((program) => program.id),
      );
    if (error) throw new Error(error.message);
  }

  const now = new Date().toISOString();

  // Declining the open guesses is also how they're remembered: a rejected link
  // for this school is never suggested again.
  await supabase
    .from("url_discovery_queue")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: now,
      notes: "Replaced by the athletics site entered by hand.",
    })
    .eq("university_id", universityId)
    .eq("discovery_type", "athletic_website")
    .eq("status", "pending_review");

  let results: DiscoveryResult[] = [];
  let searched = false;
  try {
    const excluded = await loadRejectedUrls(supabase, universityId);
    const inst = await loadInstitution(supabase, universityId);
    results = await discoverProgramPages(supabase, inst, site, list, excluded);
    searched = true;
  } catch (failure) {
    console.error("Could not map the hand-entered athletics site", failure);
  }

  const { data: schoolRow } = await supabase
    .from("universities")
    .select("website_url")
    .eq("id", universityId)
    .maybeSingle();

  for (const result of results) {
    if (!result.url) continue;
    const verdict = classifyLink({
      kind: result.discoveryType,
      url: result.url,
      sport: result.sport ?? null,
      schoolWebsite: (schoolRow as any)?.website_url ?? null,
    });
    if (verdict.action === "reject") {
      result.url = null;
      result.confidence = "failed";
      result.notes = `Discarded automatically: ${verdict.reason}`;
    } else if (verdict.normalizedUrl) {
      result.url = verdict.normalizedUrl;
    }
  }

  for (const result of results) {
    await supabase
      .from("url_discovery_queue")
      .delete()
      .eq("university_id", universityId)
      .eq("discovery_type", result.discoveryType)
      .eq("status", "pending_review")
      .filter("program_id", result.programId ? "eq" : "is", result.programId ?? null);

    const { error: insertError } = await supabase.from("url_discovery_queue").insert({
      university_id: universityId,
      program_id: result.programId,
      discovery_type: result.discoveryType,
      discovered_url: result.url,
      confidence: result.confidence,
      notes: result.notes,
    });
    if (insertError) console.error("Could not queue discovered URL", insertError.message);
  }

  const found = results.filter((result) => Boolean(result.url)).length;
  return {
    programs: list.length,
    found,
    searched,
    message: searched
      ? `Saved for ${list.length} program${list.length === 1 ? "" : "s"} — found ${found} roster/staff page${found === 1 ? "" : "s"} on that site.`
      : `Saved for ${list.length} program${list.length === 1 ? "" : "s"} — the follow-up search couldn't run just now.`,
  };
}

/**
 * The school simply doesn't field this sport. Keep the record so the decision is
 * visible and reversible, and close every outstanding job for it.
 */
export async function markProgramNotOffered(
  supabase: any,
  programId: string,
  userId: string | null,
): Promise<{ sport: string | null; closedLinks: number; closedJobs: number }> {
  const now = new Date().toISOString();

  const { data: program, error } = await supabase
    .from("programs")
    .update({
      offering_status: "not_offered",
      offering_source: "manual",
      offering_evidence: { decided_by: userId, decided_at: now, note: "Staff confirmed by hand" },
      offering_verified_at: now,
      sponsorship_checked_at: now,
    })
    .eq("id", programId)
    .select("id, sport")
    .single();
  if (error) throw new Error(error.message);

  const { data: links } = await supabase
    .from("url_discovery_queue")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: now,
      notes: "The school doesn't field this sport.",
    })
    .eq("program_id", programId)
    .eq("status", "pending_review")
    .select("id");

  const { data: jobs } = await supabase
    .from("ingest_queue")
    .update({ status: "skipped", leased_at: null, last_error: null })
    .eq("program_id", programId)
    .in("status", ["pending", "running", "failed", "held"])
    .select("id");

  return {
    sport: ((program as any)?.sport ?? null) as string | null,
    closedLinks: (links ?? []).length,
    closedJobs: (jobs ?? []).length,
  };
}
