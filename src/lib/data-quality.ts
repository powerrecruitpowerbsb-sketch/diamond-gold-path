/**
 * One shared place for "is this proposed value actually different?" and for
 * canonicalising the values our sources phrase inconsistently.
 *
 * Both the scraping pipeline and the federal sync use these helpers, so a
 * trailing slash, a "SEC" vs "South East Conference" wording difference, or a
 * default-value fill never reaches the review queue as if it were real news.
 */

import {
  acceptableSeasonYears as seasonWindow,
  canonicalSeasonYear,
} from "@/lib/season";


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
    .replace(/[.,'’"()]/g, "")
    .replace(/[-–—/]/g, " ")
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
/**
 * Abbreviation to full name. Keys are already in normalized form (lower case,
 * no punctuation, hyphens as spaces) because that's how they're looked up.
 */
const CONFERENCE_ALIASES: Record<string, string> = {
  nwac: "northwest athletic",
  sec: "southeastern",
  "south east": "southeastern",
  "big 10": "big ten",
  b1g: "big ten",
  acc: "atlantic coast",
  "pac 12": "pac 12",
  "big 12": "big 12",
  cusa: "usa",
  aac: "american athletic",
  mac: "mid american",
  mwc: "mountain west",
  wcc: "west coast",
  wac: "western athletic",
  caa: "coastal athletic",
  socon: "southern",
  gac: "great american",
  pcac: "pacific coast athletic",
  scc: "south coast",
  siac: "southern intercollegiate athletic",
  rmac: "rocky mountain athletic",
  wiac: "wisconsin intercollegiate athletic",
  sciac: "southern california intercollegiate athletic",
  scac: "southern collegiate athletic",
  pacwest: "pacific west",
  "pac west": "pacific west",
  odac: "old dominion athletic",
  asun: "atlantic sun",
  ovc: "ohio valley",
  maac: "metro atlantic athletic",
  meac: "mid eastern athletic",
  swac: "southwestern athletic",
  nec: "northeast",
  aec: "america east",
  psac: "pennsylvania state athletic",
  gnac: "great northwest athletic",
  glvc: "great lakes valley",
  giac: "gulf south",
  gsc: "gulf south",
  sac: "south atlantic",
  ccaa: "california collegiate athletic",
  lsc: "lone star",
  miaa: "mid america intercollegiate athletics",
  nsic: "northern sun intercollegiate",
  ecc: "east coast",
  cciw: "college conference of illinois and wisconsin",
  nescac: "new england small college athletic",
  liberty: "liberty league",
  "the summit league": "summit",
  summit: "summit",
  "horizon league": "horizon",
  "ivy league": "ivy",
  "patriot league": "patriot",
  cvc: "california valley",
};

/** Wording that adds nothing: every conference is an "athletic conference". */
const CONFERENCE_NOISE =
  /\b(conference|conf|athletics|association|league|the)\b/g;

export function canonicalConference(value: unknown): string {
  let key = normalizeText(value);
  if (!key) return "";
  key = CONFERENCE_ALIASES[key] ?? key;
  const trimmed = key.replace(CONFERENCE_NOISE, " ").replace(/\s+/g, " ").trim();
  const expanded = CONFERENCE_ALIASES[trimmed] ?? trimmed;
  return expanded.replace(CONFERENCE_NOISE, " ").replace(/\s+/g, " ").trim();
}

/** True for a conference string we don't recognise — worth a human glance. */
export function isUnknownConference(value: unknown): boolean {
  const key = canonicalConference(value);
  return Boolean(key) && !Object.values(CONFERENCE_ALIASES).includes(key);
}


/**
 * Roster pages carry jersey numbers, career stats and archive years that a model
 * happily mistakes for the season. Anything outside the live recruiting window
 * is not a season.
 */
export function plausibleSeasonYear(value: unknown): number | null {
  // Seasons follow the school year, so all season reasoning lives in one place.
  return canonicalSeasonYear(value);
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
 * The seasons a freshly scraped roster may legitimately carry: the school year
 * we're recruiting for, plus the one just finished.
 */
export function acceptableSeasonYears(now: Date = new Date()): number[] {
  return seasonWindow(now);
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
  // Squad size is NOT a quality signal. NAIA and junior-college rosters run
  // 60-80, fall squads are bigger than spring, and a D1 fall squad exceeds the
  // spring 40-man limit. Row shape below is what decides.


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

/**
 * A weaker roster verdict: is the pull good enough to keep even though the page
 * was clearly only partly read? Short rosters are still real players, so they
 * are saved and the program goes back in line for a fuller pull.
 */
export function rosterKeepable(
  payload: { season_year?: unknown; players?: unknown },
  now: Date = new Date(),
): { keep: boolean; partial: boolean; reason: string | null } {
  const players = Array.isArray(payload?.players) ? (payload.players as any[]) : [];
  const named = players.filter((player) => normalizeText(player?.name).length > 2);
  if (!named.length) return { keep: false, partial: false, reason: "no player names were read" };
  // No size ceiling: a large roster is legitimate. Repeated names below are the
  // real signal that two seasons were merged.


  const season = plausibleSeasonYear(payload?.season_year);
  if (!season || !acceptableSeasonYears(now).includes(season)) {
    return {
      keep: false,
      partial: false,
      reason: season ? `roster is labelled ${season}` : "no season could be read",
    };
  }
  const distinct = new Set(named.map((player) => normalizeText(player.name))).size;
  if (distinct < Math.ceil(named.length * 0.9)) {
    return { keep: false, partial: false, reason: "blank or repeated player names" };
  }
  return { keep: true, partial: named.length < 18, reason: null };
}

/**
 * Is this value even possible for the column? Guards the automatic path so an
 * obviously wrong reading (a 4-digit enrollment for a 200,000-student number, a
 * 480% graduation rate) still stops for a person.
 */
const NUMERIC_RANGES: Record<string, [number, number]> = {
  undergrad_enrollment: [20, 200_000],
  graduation_rate: [0, 100],
  acceptance_rate: [0, 100],
  avg_gpa: [1, 5],
  avg_sat: [400, 1600],
  avg_act: [1, 36],
  tuition_in_state: [0, 120_000],
  tuition_out_state: [0, 120_000],
  room_board: [0, 60_000],
  est_cost_of_attendance: [0, 200_000],
  est_net_price: [0, 200_000],
};

export function fieldValueSane(field: string, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;

  const range = NUMERIC_RANGES[field];
  if (range) {
    const num = Number(value);
    if (!Number.isFinite(num)) return false;
    return num >= range[0] && num <= range[1];
  }

  if (field === "campus_setting") {
    return ["urban", "suburban", "rural"].includes(normalizeText(value));
  }
  if (field === "public_private") {
    return ["public", "private"].includes(normalizeText(value));
  }
  if (STATE_FIELDS.has(field)) return /^[A-Z]{2}$/.test(normalizeStateValue(value));
  if (field === "student_faculty_ratio") return /\d/.test(String(value)) && String(value).length < 12;
  if (field === "conference" || field === "division") return String(value).trim().length < 60;
  if (field === "city") return /^[a-z .'-]{2,60}$/i.test(String(value).trim());
  if (field === "head_coach_name") return /^[a-z .'-]{4,60}$/i.test(String(value).trim());
  if (field === "governing_body") {
    return ["NCAA", "NAIA", "NJCAA", "CCCAA", "NWAC"].includes(String(value).toUpperCase().trim());
  }
  return true;
}


/** Columns the database stores as whole numbers — a scraped "19.4" must round. */
const INTEGER_FIELDS = new Set([
  "avg_sat",
  "avg_act",
  "undergrad_enrollment",
  "season_year",
  "distance_to_airport_miles_int",
]);

/** Shape a value so the column will accept it (whole numbers stay whole). */
export function coerceForColumn(field: string, value: unknown): unknown {
  if (INTEGER_FIELDS.has(field) && value !== null && value !== "" && value !== undefined) {
    const num = Number(value);
    if (Number.isFinite(num)) return Math.round(num);
  }
  return value;
}
