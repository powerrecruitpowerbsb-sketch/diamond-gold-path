/**
 * School-name matching against the federal (College Scorecard) directory.
 *
 * Our school names come from governing-body membership lists and Wikipedia, so
 * they carry wiki-style disambiguators ("Regis College (Massachusetts)"),
 * marketing forms ("The Ohio State University") and long official forms
 * ("Rutgers, The State Univ. of New Jersey, Newark"). The federal directory
 * uses its own registered forms ("Ohio State University-Main Campus",
 * "Rutgers University-New Brunswick"). Everything here is pure string work so
 * it can be reasoned about and tested without touching the network.
 */

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

/** Words that carry no identifying weight when comparing two school names. */
const STOPWORDS = new Set(["the", "of", "at", "and", "a", "in", "campus", "main"]);

/** Wording differences that mean the same thing in a school name. */
const SYNONYMS: [RegExp, string][] = [
  [/&/g, " and "],
  [/\bu\.?\s?s\.?(?=\s|$)/g, " united states "],
  [/\bmil\.?\b/g, "military"],
  [/\bpenn\b(?!sylvania)/g, "pennsylvania"],
  [/\bst\.?\b/g, "saint"],
  [/\bste\.?\b/g, "sainte"],
  [/\bmt\.?\b/g, "mount"],
  [/\bft\.?\b/g, "fort"],
  [/\buniv\.?\b/g, "university"],
  [/\bcoll\.?\b/g, "college"],
  [/\bcc\b/g, "community college"],
  [/\bcomm\.?\b/g, "community"],
  [/\btech\.?\b/g, "technical"],
  [/\bpoly\b/g, "polytechnic"],
  [/\bagricultural\b/g, "a"],
  [/\bmechanical\b/g, "m"],
  [/\bsuny\b/g, "state university of new york"],
  [/\bccbc\b/g, "community college of baltimore county"],
  [/\bjc\b/g, "junior college"],
  [/\bagri\.?\b/g, "a"],
  [/\bintl\.?\b/g, "international"],
];

/**
 * Words that only ever appear as a campus qualifier, never as the identifying
 * part of a school name. "Penn State Beaver" and "CCBC-Catonsville" name one
 * specific campus, so a record without that qualifier is the wrong school even
 * though every other word lines up.
 */
const QUALIFIER_SEPARATORS = /\s*(?:[-\u2013\u2014,]|\bat\b)\s*/;

/**
 * The campus qualifier in our name, if it has one. Returns null for a plain
 * school name like "University of Michigan", which is what lets the main-campus
 * preference kick in.
 */
export function campusQualifier(rawName: string): string | null {
  const { name } = splitStateHint(rawName);
  const parts = name.split(QUALIFIER_SEPARATORS).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1]!;
  const tokens = matchTokens(tail);
  // A trailing "The State University of New Jersey" style clause is a long
  // official form, not a campus; qualifiers are one or two identifying words.
  if (!tokens.length || tokens.length > 2) return null;
  // "Community College" style tails are category words, not a campus name.
  const generic = new Set(["university", "college", "school", "institute", "academy", "state"]);
  if (tokens.every((token) => generic.has(token))) return null;
  return tokens.join(" ");
}

/** Strip a trailing wiki disambiguator and read it as a state hint. */
export function splitStateHint(name: string): { name: string; stateHint: string | null } {
  const match = String(name ?? "").match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!match) return { name: String(name ?? "").trim(), stateHint: null };
  const inner = match[2]!.trim().toLowerCase();
  const abbrev = STATE_NAMES[inner] ?? (/^[a-z]{2}$/.test(inner) ? inner.toUpperCase() : null);
  // A parenthetical that isn't a state ("Brooklyn") still isn't part of the
  // registered name, so it comes off either way.
  return { name: match[1]!.trim(), stateHint: abbrev };
}

/** Comparison form: lowercase, synonyms folded, punctuation and noise dropped. */
export function matchTokens(name: string): string[] {
  let text = String(name ?? "").toLowerCase();
  for (const [pattern, replacement] of SYNONYMS) text = text.replace(pattern, replacement);
  return text
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
}

export function matchKey(name: string): string {
  return matchTokens(name).join(" ");
}

/**
 * 0–1 similarity between our name and a federal name. Shared identifying words
 * carry the score; a name that is fully contained in the other (our "Ohio State
 * University" inside federal "Ohio State University-Main Campus") scores near
 * the top because the extra words are the federal directory's own suffixes.
 */
export function nameSimilarity(ours: string, theirs: string): number {
  const a = matchTokens(ours);
  const b = matchTokens(theirs);
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 1;

  const setB = new Set(b);
  const shared = a.filter((token) => setB.has(token)).length;
  const contained = shared === a.length || shared === new Set(b).size;
  const score = shared / Math.max(a.length, new Set(b).size);
  return contained ? Math.max(score, 0.9) : score;
}

/**
 * Query forms to try against the federal name search, best first. The federal
 * search is literal enough that "Rutgers, The State Univ. of New Jersey,
 * Newark" finds nothing while "Rutgers" finds the whole family, so the variants
 * get progressively shorter and the scorer decides which candidate is right.
 */
export function queryVariants(rawName: string): string[] {
  const { name } = splitStateHint(rawName);
  const out: string[] = [];
  const push = (candidate: string) => {
    const trimmed = candidate.replace(/\s+/g, " ").trim();
    if (trimmed.length >= 3 && !out.includes(trimmed)) out.push(trimmed);
  };

  push(name);
  const noThe = name.replace(/^the\s+/i, "");
  push(noThe);

  // "Rutgers, The State University of New Jersey, New Brunswick" → "Rutgers"
  if (noThe.includes(",")) {
    push(noThe.split(",")[0]!);
    const tail = noThe.split(",").pop()!;
    push(`${noThe.split(",")[0]!} ${tail}`);
  }

  // "State University of New York at Brockport" → "SUNY Brockport" / "Brockport"
  const suny = noThe.match(/state university of new york(?:\s+(?:at|college at))?\s+(.+)$/i);
  if (suny) {
    push(`SUNY ${suny[1]}`);
    push(suny[1]!);
  }

  // "Pennsylvania Western University, California" → "Pennsylvania Western California"
  push(noThe.replace(/\buniversity\b/gi, "").replace(/,/g, " "));

  // Hyphenated joint names ("Pomona-Pitzer Colleges") and long official forms:
  // fall back to the first two or three identifying words.
  // "U.S. Naval Academy" → "United States Naval Academy"
  push(noThe.replace(/\bU\.?\s?S\.?(?=\s|$)/gi, "United States"));
  // "Texas A&M University–Victoria" → "Texas A&M University Victoria"
  push(noThe.replace(/[-\u2013\u2014]/g, " "));
  // "Penn State Beaver" → "Pennsylvania State Beaver"
  push(noThe.replace(/\bPenn\b(?!sylvania)/g, "Pennsylvania"));
  // Drop a trailing campus qualifier so the family shows up at all.
  const qualifier = campusQualifier(rawName);
  if (qualifier) {
    const base = noThe.split(/\s*(?:[-\u2013\u2014,]|\bat\b)\s*/)[0];
    if (base) push(base);
  }

  const words = noThe.replace(/[,]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 3) push(words.slice(0, 3).join(" "));
  if (words.length > 2) push(words.slice(0, 2).join(" "));

  return out;
}

export type ScoredCandidate = {
  unitid: number;
  name: string;
  alias: string | null;
  city: string | null;
  state: string | null;
  mainCampus?: boolean | null;
  enrollment?: number | null;
  score: number;
};

/**
 * Score every candidate for one school. A candidate in the wrong state is
 * rejected outright — same-name schools in different states are different
 * schools, which is exactly how another state's record got written onto a
 * school before.
 */
export function scoreCandidates(
  ourName: string,
  ourState: string | null,
  candidates: Omit<ScoredCandidate, "score">[],
  ourCity?: string | null,
): ScoredCandidate[] {
  const { name, stateHint } = splitStateHint(ourName);
  const state = (ourState || stateHint || "").toUpperCase() || null;
  const qualifier = campusQualifier(ourName);
  const city = (ourCity || "").trim().toLowerCase() || null;
  const largest = Math.max(
    1,
    ...candidates.map((candidate) => Number(candidate.enrollment) || 0),
  );

  return candidates
    .filter((candidate) => !state || !candidate.state || candidate.state.toUpperCase() === state)
    .map((candidate) => {
      const direct = nameSimilarity(name, candidate.name);
      const viaAlias = candidate.alias ? nameSimilarity(name, candidate.alias) : 0;
      let score = Math.max(direct, viaAlias);

      const haystack = `${candidate.name} ${candidate.alias ?? ""}`;
      if (qualifier) {
        // Our name names one campus. A record that doesn't mention that campus
        // is a different school, however well the rest of the words match.
        const theirTokens = new Set(matchTokens(haystack));
        const covered = qualifier.split(" ").every((token) => theirTokens.has(token));
        if (!covered) score *= 0.5;
      } else {
        // Plain name: the main campus is what people mean by it, and a branch
        // record carrying extra campus words is not.
        if (candidate.mainCampus) score += 0.06;
        else if (candidate.mainCampus === false) score -= 0.04;
        const size = Number(candidate.enrollment) || 0;
        if (size) score += 0.03 * (size / largest);
      }

      if (city && candidate.city && candidate.city.trim().toLowerCase() === city) score += 0.03;

      return { ...candidate, score: Math.max(0, Math.min(1, score)) };
    })
    .sort((a, b) => b.score - a.score);
}

/** How sure we have to be to write federal facts without asking a human. */
export const CONFIRM_SCORE = 0.85;
/** Below this a candidate isn't even worth showing as a possibility. */
export const CONSIDER_SCORE = 0.5;
/** A confirmed match must also be clearly better than the runner-up. */
export const CONFIRM_LEAD = 0.08;

export type Verdict = "confirmed" | "ambiguous" | "unmatched";

export function verdictFor(scored: ScoredCandidate[]): Verdict {
  const best = scored[0];
  if (!best || best.score < CONSIDER_SCORE) return "unmatched";
  const runnerUp = scored[1];
  const clearLead = !runnerUp || best.score - runnerUp.score >= CONFIRM_LEAD;
  if (best.score >= CONFIRM_SCORE && clearLead) return "confirmed";
  return "ambiguous";
}
