/**
 * Shared, direction-aware school-name matching.
 *
 * Two rules drive everything here, both learned the hard way:
 *
 * 1. DIRECTION. A league list writes shorthand of a school's real name, never
 *    the other way round. So the STORED name has to be accounted for by the
 *    listed name — not "whichever name is shorter is contained in the other",
 *    which let a short stored name swallow a long listed one.
 *
 * 2. A DROPPED WORD MAY NOT BE WHAT MAKES TWO NAMES MATCH. Only words that
 *    carry no institutional identity ("the", "of", "college", "university")
 *    may be missing from one side. Words like "community", "state", "city",
 *    "technical", "junior" and "county" are precisely what separates
 *    Kansas City Kansas Community College from the University of Kansas, and
 *    Cleveland State Community College from Cleveland Community College, so a
 *    name that only matches once one of them is removed is refused.
 *
 * Whole-name equality is always tried before any word-set comparison.
 */

/** Words that may be absent from either side without changing which school it is. */
export const DROPPABLE = new Set([
  "the", "of", "at", "and", "a", "in",
  "college", "colleges", "university", "universities", "institute", "school",
]);

/** Word forms that mean the same institution written differently. */
const STEM: Record<string, string> = {
  univ: "university",
  saint: "st",
  mount: "mt",
  technology: "technical",
  technological: "technical",
  tech: "technical",
  cc: "community",
  jc: "junior",
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameWords(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter(Boolean)
    .map((w) => STEM[w] ?? w);
}

/** Every word that carries identity: droppable filler removed, nothing else. */
export function significantWords(name: string): string[] {
  return nameWords(name).filter((w) => !DROPPABLE.has(w));
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size || sa.size === 0) return false;
  for (const w of sa) if (!sb.has(w)) return false;
  return true;
}

export type NameMatchTier = "exact name" | "same significant words" | null;

/**
 * How a listed name relates to a stored name. Never fuzzy: either the whole
 * names agree, or their identity-carrying words agree exactly.
 */
export function nameMatch(listed: string, stored: string): NameMatchTier {
  if (normalizeName(listed) === normalizeName(stored)) return "exact name";
  if (sameSet(significantWords(listed), significantWords(stored))) return "same significant words";
  return null;
}

/** Words present on one side only — used to explain a refusal. */
export function distinguishingDifference(listed: string, stored: string): string[] {
  const a = new Set(significantWords(listed));
  const b = new Set(significantWords(stored));
  const diff: string[] = [];
  for (const w of a) if (!b.has(w)) diff.push(w);
  for (const w of b) if (!a.has(w)) diff.push(w);
  return diff;
}

/* --------------------------------- states --------------------------------- */

export const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
]);

/** Full names and AP-style abbreviations, as league lists and stored rows use them. */
export const STATE_NAMES: Record<string, string> = {
  alabama: "AL", ala: "AL", alaska: "AK", arizona: "AZ", ariz: "AZ",
  arkansas: "AR", ark: "AR", california: "CA", calif: "CA", cal: "CA",
  colorado: "CO", colo: "CO", connecticut: "CT", conn: "CT", delaware: "DE", del: "DE",
  florida: "FL", fla: "FL", georgia: "GA", ga: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", ill: "IL", indiana: "IN", ind: "IN",
  iowa: "IA", kansas: "KS", kan: "KS", kans: "KS", kentucky: "KY", ky: "KY",
  louisiana: "LA", la: "LA", maine: "ME", maryland: "MD", md: "MD",
  massachusetts: "MA", mass: "MA", michigan: "MI", mich: "MI",
  minnesota: "MN", minn: "MN", mississippi: "MS", miss: "MS",
  missouri: "MO", mo: "MO", montana: "MT", mont: "MT",
  nebraska: "NE", neb: "NE", nebr: "NE", nevada: "NV", nev: "NV",
  "new hampshire": "NH", "n h": "NH", "new jersey": "NJ", "n j": "NJ",
  "new mexico": "NM", "n m": "NM", "new york": "NY", "n y": "NY",
  "north carolina": "NC", "n c": "NC", "north dakota": "ND", "n d": "ND",
  ohio: "OH", oklahoma: "OK", okla: "OK", oregon: "OR", ore: "OR",
  pennsylvania: "PA", pa: "PA", penn: "PA", "rhode island": "RI", "r i": "RI",
  "south carolina": "SC", "s c": "SC", "south dakota": "SD", "s d": "SD",
  tennessee: "TN", tenn: "TN", texas: "TX", tex: "TX", utah: "UT",
  vermont: "VT", vt: "VT", virginia: "VA", va: "VA", washington: "WA", wash: "WA",
  "west virginia": "WV", "w va": "WV", wisconsin: "WI", wis: "WI", wisc: "WI",
  wyoming: "WY", wyo: "WY", "district of columbia": "DC",
};

/** Stored states are a mix of codes and spelled-out names; compare only codes. */
export function stateCode(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (v.length === 2 && STATE_CODES.has(v.toUpperCase())) return v.toUpperCase();
  const named = STATE_NAMES[normalizeName(v)];
  if (named) return named;
  return STATE_CODES.has(v.toUpperCase()) ? v.toUpperCase() : "";
}

export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = stateCode(a);
  const cb = stateCode(b);
  return ca !== "" && ca === cb;
}

/* -------------------------------- resolution ------------------------------- */

export type Candidate = { id: string; name: string };

export type Resolution<T extends Candidate> =
  | { school: T; how: string; method: "exact name" | "same significant words"; candidates: T[] }
  | { school: null; how: string; method: "ambiguous" | "no match"; candidates: T[] };

/**
 * Picks the one school in `pool` whose name the listed name accounts for.
 * Exact whole-name agreement wins outright; otherwise identity-word agreement,
 * and only when a single school survives. `tieBreak` may resolve a genuine tie
 * on evidence outside the name (e.g. already holding this sport in this league).
 */
export function resolveByName<T extends Candidate>(
  listed: string,
  pool: T[],
  tieBreak?: (c: T) => boolean,
): Resolution<T> {
  const exact = pool.filter((c) => nameMatch(listed, c.name) === "exact name");
  const significant = pool.filter((c) => nameMatch(listed, c.name) === "same significant words");

  for (const [tier, hits] of [
    ["exact name", exact],
    ["same significant words", significant],
  ] as ["exact name" | "same significant words", T[]][]) {
    if (hits.length === 1) return { school: hits[0]!, how: tier, method: tier, candidates: hits };
    if (hits.length > 1) {
      const narrowed = tieBreak ? hits.filter(tieBreak) : [];
      if (narrowed.length === 1)
        return {
          school: narrowed[0]!,
          how: `${tier}; tie broken on existing program`,
          method: tier,
          candidates: narrowed,
        };
      return { school: null, how: `ambiguous on ${tier}`, method: "ambiguous", candidates: hits };
    }
  }
  return { school: null, how: "no name match", method: "no match", candidates: [] };
}
