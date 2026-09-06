/**
 * One shared place for "is this proposed value actually different?" and for
 * canonicalising the values our sources phrase inconsistently.
 *
 * Both the scraping pipeline and the federal sync use these helpers, so a
 * trailing slash, a "SEC" vs "South East Conference" wording difference, or a
 * default-value fill never reaches the review queue as if it were real news.
 */

const URL_FIELDS = new Set([
  "website_url",
  "admissions_url",
  "financial_aid_url",
  "tuition_source_url",
  "athletic_website",
  "coaching_staff_url",
  "roster_url",
  "facility_url",
]);

/** Columns that are NOT NULL with a falsy default — an unset flag reads as "no data". */
const DEFAULTED_FLAG_FIELDS = new Set(["religious_affiliation"]);

const NUMERIC_TOLERANCE: Record<string, number> = {
  avg_gpa: 0.01,
  acceptance_rate: 0.5,
  graduation_rate: 0.5,
};

/** http/https, www, trailing slash and case differences are the same address. */
export function normalizeUrlValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * "Kansas" and "KS" are the same answer. We store the two-letter code, so a page
 * that spells the state out must never read as a disagreement.
 */
export function normalizeStateValue(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (/^[a-z]{2}$/.test(raw)) return raw.toUpperCase();
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    if (name === raw) return code;
  }
  return raw.toUpperCase();
}

const STATE_FIELDS = new Set(["state", "home_state"]);

/** True when the live value carries no real information yet. */
export function isEmptyValue(field: string, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (DEFAULTED_FLAG_FIELDS.has(field) && value === false) return true;
  return false;
}

/**
 * Would writing `next` over `current` actually change anything a person cares
 * about? Numbers compare with a per-field tolerance, URLs and text compare
 * normalized, conferences compare canonicalised.
 */
export function valuesEquivalent(field: string, current: unknown, next: unknown): boolean {
  if (isEmptyValue(field, current)) return false;

  if (typeof next === "boolean" || typeof current === "boolean") {
    return Boolean(current) === Boolean(next);
  }

  if (typeof next === "number" || (typeof current === "number" && !Number.isNaN(Number(next)))) {
    const currentNumber = Number(current);
    const nextNumber = Number(next);
    if (!Number.isFinite(currentNumber) || !Number.isFinite(nextNumber)) return false;
    const tolerance = NUMERIC_TOLERANCE[field] ?? 0.05;
    return Math.abs(currentNumber - nextNumber) <= tolerance;
  }

  if (URL_FIELDS.has(field)) {
    return normalizeUrlValue(current) === normalizeUrlValue(next);
  }

  if (STATE_FIELDS.has(field)) {
    return normalizeStateValue(current) === normalizeStateValue(next);
  }

  if (field === "conference") {
    return canonicalConference(String(current)) === canonicalConference(String(next));
  }

  return normalizeText(current) === normalizeText(next);
}

/**
 * Conference wording differs wildly between directories and athletics sites.
 * Known abbreviations expand to the full name; anything unknown is just tidied
 * so at least casing and spacing stop generating fake differences.
 */
const CONFERENCE_ALIASES: Record<string, string> = {
  nwac: "Northwest Athletic Conference",
  "northwest athletic conference": "Northwest Athletic Conference",
  sec: "Southeastern Conference",
  "south east conference": "Southeastern Conference",
  "southeastern conference": "Southeastern Conference",
  "big 12": "Big 12 Conference",
  "big 12 conference": "Big 12 Conference",
  "big ten": "Big Ten Conference",
  "big ten conference": "Big Ten Conference",
  acc: "Atlantic Coast Conference",
  "atlantic coast conference": "Atlantic Coast Conference",
  "pac-12": "Pac-12 Conference",
  "big east": "Big East Conference",
  "big west": "Big West Conference",
  "sun belt": "Sun Belt Conference",
  "cusa": "Conference USA",
  "conference usa": "Conference USA",
  "aac": "American Athletic Conference",
  "american athletic conference": "American Athletic Conference",
  "mac": "Mid-American Conference",
  "mid-american conference": "Mid-American Conference",
  "mwc": "Mountain West Conference",
  "mountain west conference": "Mountain West Conference",
  "wcc": "West Coast Conference",
  "west coast conference": "West Coast Conference",
  "wac": "Western Athletic Conference",
  "caa": "Coastal Athletic Association",
  "socon": "Southern Conference",
  "gac": "Great American Conference",
  "great american conference": "Great American Conference",
  "pcac": "Pacific Coast Athletic Conference",
  "pacific coast athletic conference": "Pacific Coast Athletic Conference",
  scc: "South Coast Conference",
  "south coast conference": "South Coast Conference",
};

export function canonicalConference(value: unknown): string {
  const key = normalizeText(value).replace(/\bconf\.?\b/g, "conference");
  if (!key) return "";
  return CONFERENCE_ALIASES[key] ?? key.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** True for a conference string we don't recognise — worth a human glance. */
export function isUnknownConference(value: unknown): boolean {
  const key = normalizeText(value).replace(/\bconf\.?\b/g, "conference");
  return Boolean(key) && !(key in CONFERENCE_ALIASES);
}

/**
 * Roster pages carry jersey numbers, career stats and archive years that a model
 * happily mistakes for the season. Anything outside the live recruiting window
 * is not a season.
 */
export function plausibleSeasonYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  const current = new Date().getFullYear();
  if (year < current - 2 || year > current + 3) return null;
  return Math.trunc(year);
}

/** Governing bodies whose divisions are D1/D2/D3 vs the ones with no divisions. */
const DIVISIONED_BODIES = new Set(["NCAA", "NJCAA"]);

/**
 * A scraped division or governing body that contradicts the directory record is
 * a red flag, not an update — the page may belong to a different school.
 */
export function contradictsGoverningBody(
  field: string,
  currentBody: unknown,
  proposed: unknown,
): boolean {
  const body = String(currentBody ?? "").toUpperCase();
  if (!body) return false;
  if (field === "governing_body") {
    return String(proposed ?? "").toUpperCase() !== body;
  }
  if (field === "division") {
    const division = String(proposed ?? "").toUpperCase();
    if (!division) return false;
    if (!DIVISIONED_BODIES.has(body)) return /^D?[123]$/.test(division.replace(/\s/g, ""));
    return false;
  }
  return false;
}

const POSITION_ALIASES: Record<string, string> = {
  c: "C",
  catcher: "C",
  "1b": "1B",
  "first base": "1B",
  "2b": "2B",
  "second base": "2B",
  "3b": "3B",
  "third base": "3B",
  ss: "SS",
  shortstop: "SS",
  of: "OF",
  outfield: "OF",
  outfielder: "OF",
  lf: "OF",
  cf: "OF",
  rf: "OF",
  rhp: "RHP",
  lhp: "LHP",
  "two way": "TWO_WAY",
  two_way: "TWO_WAY",
  util: "UTIL",
  utility: "UTIL",
  inf: "UTIL",
  infield: "UTIL",
  infielder: "UTIL",
};

/**
 * Map a page's position wording onto our list. Unreadable values return null so
 * the player is stored without a position rather than dumped into UTIL, which
 * would quietly distort every position breakdown.
 */
export function normalizePosition(value: unknown): string | null {
  const raw = normalizeText(value).replace(/[./]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (POSITION_ALIASES[raw]) return POSITION_ALIASES[raw]!;
  const first = raw.split(" ")[0]!;
  return POSITION_ALIASES[first] ?? null;
}

/** US state names, used to spot a candidate page that belongs to another state. */
export const US_STATE_NAMES: Record<string, string> = {
  AL: "alabama",
  AK: "alaska",
  AZ: "arizona",
  AR: "arkansas",
  CA: "california",
  CO: "colorado",
  CT: "connecticut",
  DE: "delaware",
  FL: "florida",
  GA: "georgia",
  HI: "hawaii",
  ID: "idaho",
  IL: "illinois",
  IN: "indiana",
  IA: "iowa",
  KS: "kansas",
  KY: "kentucky",
  LA: "louisiana",
  ME: "maine",
  MD: "maryland",
  MA: "massachusetts",
  MI: "michigan",
  MN: "minnesota",
  MS: "mississippi",
  MO: "missouri",
  MT: "montana",
  NE: "nebraska",
  NV: "nevada",
  NH: "new hampshire",
  NJ: "new jersey",
  NM: "new mexico",
  NY: "new york",
  NC: "north carolina",
  ND: "north dakota",
  OH: "ohio",
  OK: "oklahoma",
  OR: "oregon",
  PA: "pennsylvania",
  RI: "rhode island",
  SC: "south carolina",
  SD: "south dakota",
  TN: "tennessee",
  TX: "texas",
  UT: "utah",
  VT: "vermont",
  VA: "virginia",
  WA: "washington",
  WV: "west virginia",
  WI: "wisconsin",
  WY: "wyoming",
};

/**
 * Does this search result plainly belong to a school in a different state?
 * "Southeastern University" (FL) must not match "Southeastern Oklahoma State".
 */
export function mentionsOtherState(text: string, state: string | null): boolean {
  const haystack = normalizeText(text);
  if (!haystack) return false;
  const ourState = state ? (US_STATE_NAMES[state.toUpperCase()] ?? null) : null;
  for (const [, name] of Object.entries(US_STATE_NAMES)) {
    if (name === ourState) continue;
    if (haystack.includes(name)) return true;
  }
  return false;
}

// --- Roster acceptance rules -------------------------------------------------

/**
 * The season years a freshly scraped roster may legitimately carry: the current
 * one, plus next year's once the new academic year has started.
 */
export function acceptableSeasonYears(now: Date = new Date()): number[] {
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? [year, year + 1] : [year - 1, year];
}

export type RosterVerdict = { auto: boolean; reason: string | null };

/**
 * Judge a scraped roster on the roster itself instead of a flat trust score: the
 * page it came from, the season it claims, the squad size and whether the names
 * read like real, distinct players. Anything that fails gets a plain-language
 * reason so a person can fix or decline it in one step.
 */
export function rosterVerdict(
  payload: { season_year?: unknown; players?: unknown },
  sourceUrl?: string | null,
  now: Date = new Date(),
): RosterVerdict {
  const players = Array.isArray(payload?.players) ? (payload.players as any[]) : [];
  if (players.length < 18) {
    return { auto: false, reason: `only ${players.length} players read from the page` };
  }
  if (players.length > 70) {
    return { auto: false, reason: `${players.length} players is more than a real roster` };
  }

  const season = plausibleSeasonYear(payload?.season_year);
  if (!season || !acceptableSeasonYears(now).includes(season)) {
    return {
      auto: false,
      reason: season ? `roster is labelled ${season}` : "no season could be read",
    };
  }

  const names = players
    .map((player) => normalizeText(player?.name))
    .filter((name) => name.length > 2);
  const distinct = new Set(names).size;
  if (distinct < Math.ceil(players.length * 0.9)) {
    return { auto: false, reason: "blank or repeated player names" };
  }

  const positions = players.filter((player) => normalizePosition(player?.position)).length;
  if (positions < Math.ceil(players.length * 0.3)) {
    return { auto: false, reason: "most positions could not be read" };
  }

  if (!/roster/i.test(String(sourceUrl ?? ""))) {
    return { auto: false, reason: "not read from a roster page" };
  }

  return { auto: true, reason: null };
}
