/**
 * Split a printed hometown into town, state and country.
 *
 * Rosters print a hometown as one string: "Tampa, FL", "Tampa, Fla.",
 * "Tampa, Florida", "Toronto, Ontario", "Toronto, ON, Canada", "Tokyo, Japan",
 * or a bare "Tampa". Search filters on state, so the state has to be a field of
 * its own rather than buried in text.
 *
 * The rule is never to guess. A tail we do not recognise stays part of the town
 * text and both state and country are left empty, so a blank is always either
 * "the page didn't say" or "we couldn't read it" — never an invention.
 */

export type HometownParts = {
  /** Town text as printed, minus a recognised state/country tail. */
  town: string | null;
  /** Two-letter US state, US territory or Canadian province. */
  state: string | null;
  /** Two-letter country code. US territories count as US. */
  country: string | null;
};

/** Newspaper-style and full-name US state spellings. */
const US_STATES: Record<string, string> = {
  al: "AL", ala: "AL", alabama: "AL",
  ak: "AK", alaska: "AK",
  az: "AZ", ariz: "AZ", arizona: "AZ",
  ar: "AR", ark: "AR", arkansas: "AR",
  ca: "CA", cal: "CA", cali: "CA", calif: "CA", california: "CA",
  co: "CO", colo: "CO", colorado: "CO",
  ct: "CT", conn: "CT", connecticut: "CT",
  de: "DE", del: "DE", delaware: "DE",
  dc: "DC", "washington dc": "DC", "district of columbia": "DC",
  fl: "FL", fla: "FL", florida: "FL",
  ga: "GA", georgia: "GA",
  hi: "HI", hawaii: "HI",
  id: "ID", idaho: "ID",
  il: "IL", ill: "IL", illinois: "IL",
  in: "IN", ind: "IN", indiana: "IN",
  ia: "IA", iowa: "IA",
  ks: "KS", kan: "KS", kans: "KS", kansas: "KS",
  ky: "KY", kentucky: "KY",
  la: "LA", louisiana: "LA",
  me: "ME", maine: "ME",
  md: "MD", maryland: "MD",
  ma: "MA", mass: "MA", massachusetts: "MA",
  mi: "MI", mich: "MI", michigan: "MI",
  mn: "MN", minn: "MN", minnesota: "MN",
  ms: "MS", miss: "MS", mississippi: "MS",
  mo: "MO", missouri: "MO",
  mt: "MT", mont: "MT", montana: "MT",
  ne: "NE", neb: "NE", nebr: "NE", nebraska: "NE",
  nv: "NV", nev: "NV", nevada: "NV",
  nh: "NH", "new hampshire": "NH",
  nj: "NJ", "new jersey": "NJ",
  nm: "NM", "new mexico": "NM",
  ny: "NY", "new york": "NY",
  nc: "NC", "north carolina": "NC",
  nd: "ND", "north dakota": "ND",
  oh: "OH", ohio: "OH",
  ok: "OK", okla: "OK", oklahoma: "OK",
  or: "OR", ore: "OR", oregon: "OR",
  pa: "PA", penn: "PA", pennsylvania: "PA",
  ri: "RI", "rhode island": "RI",
  sc: "SC", "south carolina": "SC",
  sd: "SD", "south dakota": "SD",
  tn: "TN", tenn: "TN", tennessee: "TN",
  tx: "TX", tex: "TX", texas: "TX",
  ut: "UT", utah: "UT",
  vt: "VT", vermont: "VT",
  va: "VA", virginia: "VA",
  wa: "WA", wash: "WA", washington: "WA",
  wv: "WV", "w va": "WV", "west virginia": "WV",
  wi: "WI", wis: "WI", wisc: "WI", wisconsin: "WI",
  wy: "WY", wyo: "WY", wyoming: "WY",
};

/** US territories: a state code of their own, but the country is still US. */
const US_TERRITORIES: Record<string, string> = {
  pr: "PR", "puerto rico": "PR",
  vi: "VI", "virgin islands": "VI", "u s virgin islands": "VI",
  gu: "GU", guam: "GU",
  as: "AS", "american samoa": "AS",
  mp: "MP", "northern mariana islands": "MP",
};

const CA_PROVINCES: Record<string, string> = {
  ab: "AB", alberta: "AB",
  bc: "BC", "british columbia": "BC",
  mb: "MB", manitoba: "MB",
  nb: "NB", "new brunswick": "NB",
  nl: "NL", newfoundland: "NL", "newfoundland and labrador": "NL",
  ns: "NS", "nova scotia": "NS",
  on: "ON", ont: "ON", ontario: "ON",
  pe: "PE", "prince edward island": "PE",
  qc: "QC", que: "QC", quebec: "QC",
  sk: "SK", sask: "SK", saskatchewan: "SK",
  yt: "YT", yukon: "YT",
  nt: "NT", "northwest territories": "NT",
  nu: "NU", nunavut: "NU",
};

const COUNTRIES: Record<string, string> = {
  usa: "US", "u s a": "US", "united states": "US", us: "US",
  canada: "CA", can: "CA",
  mexico: "MX", "puerto rico": "US",
  "dominican republic": "DO", dr: "DO",
  venezuela: "VE", cuba: "CU", panama: "PA", colombia: "CO", nicaragua: "NI",
  curacao: "CW", "curaçao": "CW", aruba: "AW", bahamas: "BS", "the bahamas": "BS",
  brazil: "BR", honduras: "HN", "costa rica": "CR", guatemala: "GT",
  "el salvador": "SV", ecuador: "EC", peru: "PE", chile: "CL", argentina: "AR",
  japan: "JP", taiwan: "TW", "chinese taipei": "TW", china: "CN",
  korea: "KR", "south korea": "KR", philippines: "PH",
  australia: "AU", "new zealand": "NZ",
  germany: "DE", netherlands: "NL", holland: "NL", england: "GB",
  scotland: "GB", wales: "GB", "united kingdom": "GB", uk: "GB", ireland: "IE",
  france: "FR", spain: "ES", italy: "IT", portugal: "PT", sweden: "SE",
  norway: "NO", denmark: "DK", "czech republic": "CZ", czechia: "CZ",
  poland: "PL", austria: "AT", switzerland: "CH", israel: "IL",
  "south africa": "ZA", nigeria: "NG", india: "IN", singapore: "SG",
};

function normalizeTail(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A period-separated abbreviation is one word, not several.
 *
 * "N.C." became "n c" once the periods were turned into spaces, which matched no
 * table entry, so every player from a state a page abbreviates that way — N.C.,
 * N.J., S.D., R.I., W.Va. — lost their home state. The spaced form is tried
 * first, then the same text with the gaps closed up, so "n c" also answers to
 * "nc" while "new york" keeps working.
 */
function compactKey(value: string): string {
  return normalizeTail(value).replace(/\s+/g, "");
}

function compact<T>(table: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(table)) {
    const short = key.replace(/\s+/g, "");
    if (!(short in out)) out[short] = value;
  }
  return out;
}

const US_STATES_COMPACT = compact(US_STATES);
const US_TERRITORIES_COMPACT = compact(US_TERRITORIES);
const CA_PROVINCES_COMPACT = compact(CA_PROVINCES);
const COUNTRIES_COMPACT = compact(COUNTRIES);

function lookupState(tail: string): { state: string; country: string } | null {
  const key = normalizeTail(tail);
  if (!key) return null;
  if (US_STATES[key]) return { state: US_STATES[key]!, country: "US" };
  if (US_TERRITORIES[key]) return { state: US_TERRITORIES[key]!, country: "US" };
  if (CA_PROVINCES[key]) return { state: CA_PROVINCES[key]!, country: "CA" };
  const short = compactKey(tail);
  if (US_STATES_COMPACT[short]) return { state: US_STATES_COMPACT[short]!, country: "US" };
  if (US_TERRITORIES_COMPACT[short]) return { state: US_TERRITORIES_COMPACT[short]!, country: "US" };
  if (CA_PROVINCES_COMPACT[short]) return { state: CA_PROVINCES_COMPACT[short]!, country: "CA" };
  return null;
}

function lookupCountry(tail: string): string | null {
  const key = normalizeTail(tail);
  if (!key) return null;
  return COUNTRIES[key] ?? COUNTRIES_COMPACT[compactKey(tail)] ?? null;
}


/**
 * Split a hometown string. The whole original text is always preserved in `town`
 * when nothing is recognised, so no information is lost by parsing.
 */
export function splitHometown(value: unknown): HometownParts {
  const whole = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!whole) return { town: null, state: null, country: null };

  // "Tampa, FL / Jesuit HS" — the school after a slash is not part of the town.
  const head = whole.split("/")[0]!.trim();
  const parts = head.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    // A bare town, or a bare country ("Japan") standing alone.
    const country = lookupCountry(parts[0]!);
    const state = lookupState(parts[0]!);
    if (state && compactKey(parts[0]!).length <= 2) {
      return { town: null, state: state.state, country: state.country };
    }
    if (country) return { town: null, state: null, country };
    return { town: parts[0]!, state: null, country: null };
  }

  // "Toronto, ON, Canada" / "Tampa, FL, USA": the last part may be the country.
  if (parts.length >= 3) {
    const country = lookupCountry(parts[parts.length - 1]!);
    const state = lookupState(parts[parts.length - 2]!);
    if (country && state) {
      return { town: parts.slice(0, -2).join(", "), state: state.state, country };
    }
    if (country) {
      return { town: parts.slice(0, -1).join(", "), state: null, country };
    }
  }

  const tail = parts[parts.length - 1]!;
  const state = lookupState(tail);
  if (state) {
    return { town: parts.slice(0, -1).join(", "), state: state.state, country: state.country };
  }
  const country = lookupCountry(tail);
  if (country) {
    return { town: parts.slice(0, -1).join(", "), state: null, country };
  }
  // Unrecognised tail: keep it with the town rather than guessing at a state.
  return { town: head, state: null, country: null };
}
