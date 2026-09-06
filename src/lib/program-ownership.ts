/**
 * Does this page actually belong to THIS school?
 *
 * We found College of Central Florida (a junior college in Ocala) holding the
 * University of Central Florida's athletics pages. Same words in the name, very
 * different school — and left alone it would have put UCF's coach and UCF's
 * roster on a JUCO program. These are pure string tests: given a page address
 * and what we know about the school, how strongly is the page tied to it?
 */

import { hostOf } from "@/lib/link-quality";

/** Words that appear in hundreds of school names and prove nothing on their own. */
const GENERIC_NAME_WORDS = new Set([
  "university",
  "universities",
  "college",
  "colleges",
  "community",
  "state",
  "the",
  "of",
  "at",
  "and",
  "saint",
  "st",
  "school",
  "institute",
  "technical",
  "technology",
  "junior",
  "county",
  "campus",
  "main",
  "north",
  "south",
  "east",
  "west",
  "central",
  "america",
  "american",
  "national",
  "international",
]);

/** athletics.example.edu → example.edu */
export function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const tail = parts.slice(-2).join(".");
  return /^(co|ac|org|net|gov|edu)\.[a-z]{2}$/.test(tail) ? parts.slice(-3).join(".") : tail;
}

function nameWords(schoolName: string | null | undefined): string[] {
  return String(schoolName ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** "University of Central Florida" → "ucf" */
export function schoolAcronym(schoolName: string | null | undefined): string {
  const words = nameWords(schoolName).filter((word) => word !== "of" && word !== "the" && word !== "and");
  return words.map((word) => word[0]).join("");
}

/** Name words distinctive enough to recognise a school by inside a domain. */
export function distinctiveWords(schoolName: string | null | undefined): string[] {
  return nameWords(schoolName).filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word));
}

export type OwnershipStrength = "own_domain" | "named_in_domain" | "unproven";

export type OwnershipVerdict = {
  strength: OwnershipStrength;
  /** Higher wins when two schools claim the same nickname domain. */
  score: number;
  reason: string;
};

/**
 * How strongly is `url` tied to this school? Same domain as the school's own
 * site is proof; a nickname domain that spells out the school's name or its
 * initials is good evidence; anything else is unproven and needs a person.
 */
export function pageOwnership(input: {
  url: string | null | undefined;
  schoolName: string | null | undefined;
  schoolWebsite?: string | null;
}): OwnershipVerdict {
  const host = hostOf(input.url);
  if (!host) return { strength: "unproven", score: 0, reason: "no page address" };

  const domain = registrableDomain(host);
  const schoolDomain = registrableDomain(hostOf(input.schoolWebsite));
  if (schoolDomain && domain === schoolDomain) {
    return { strength: "own_domain", score: 100, reason: "the school's own website" };
  }

  const flatHost = host.replace(/[^a-z0-9]/g, "");
  const words = distinctiveWords(input.schoolName);
  const matched = words.filter((word) => flatHost.includes(word));
  if (matched.length) {
    const longest = matched.reduce((best, word) => (word.length > best.length ? word : best), "");
    // Words in the school's name that the address does NOT contain count against
    // it: lemoynedolphins.com names Le Moyne College, not LeMoyne-Owen College,
    // because "owen" is missing from the address.
    const missing = words.length - matched.length;
    return {
      strength: "named_in_domain",
      score: 40 + longest.length + matched.length * 5 - missing * 8,
      reason: `the address names this school (“${longest}”)`,
    };
  }

  const acronym = schoolAcronym(input.schoolName);
  if (acronym.length >= 3 && new RegExp(`(^|[^a-z])${acronym}[a-z]*`).test(host)) {
    return {
      strength: "named_in_domain",
      score: 30 + acronym.length,
      reason: `the address uses this school's initials (“${acronym}”)`,
    };
  }

  return { strength: "unproven", score: 0, reason: "the address isn't tied to this school" };
}

/**
 * Two schools cannot share one athletics domain. Given every school claiming a
 * domain, the strongest claim keeps it and the rest are mix-ups to clear.
 */
export function resolveSharedDomain<T extends { schoolId: string; verdict: OwnershipVerdict }>(
  claims: T[],
): { winner: T | null; losers: T[] } {
  if (claims.length <= 1) return { winner: claims[0] ?? null, losers: [] };
  const ranked = [...claims].sort((a, b) => b.verdict.score - a.verdict.score);
  const best = ranked[0]!;
  if (best.verdict.score === 0) return { winner: null, losers: [] };
  const tied = ranked.filter((claim) => claim.verdict.score === best.verdict.score);
  // A genuine tie is not evidence either way — leave both for a person.
  if (tied.length > 1) return { winner: null, losers: [] };
  return { winner: best, losers: ranked.slice(1).filter((claim) => claim.schoolId !== best.schoolId) };
}
