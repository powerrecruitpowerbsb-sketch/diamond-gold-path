/**
 * The one definition of region.
 *
 * A region is a grouping of states, not a fact about a school. `universities.region`
 * is stored for 6 of 1,882 schools, so nothing reads it to decide a region — every
 * screen that filters, sorts or displays a region derives it from the school's state
 * through this file, so "Southeast" means the same thing everywhere.
 */

export const REGIONS = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West",
  "Pacific",
] as const;

export type Region = (typeof REGIONS)[number];

const STATE_REGION: Record<string, Region> = {
  // Northeast
  CT: "Northeast",
  DC: "Northeast",
  DE: "Northeast",
  MA: "Northeast",
  MD: "Northeast",
  ME: "Northeast",
  NH: "Northeast",
  NJ: "Northeast",
  NY: "Northeast",
  PA: "Northeast",
  RI: "Northeast",
  VT: "Northeast",
  // Southeast
  AL: "Southeast",
  AR: "Southeast",
  FL: "Southeast",
  GA: "Southeast",
  KY: "Southeast",
  LA: "Southeast",
  MS: "Southeast",
  NC: "Southeast",
  SC: "Southeast",
  TN: "Southeast",
  VA: "Southeast",
  WV: "Southeast",
  // Midwest
  IA: "Midwest",
  IL: "Midwest",
  IN: "Midwest",
  KS: "Midwest",
  MI: "Midwest",
  MN: "Midwest",
  MO: "Midwest",
  ND: "Midwest",
  NE: "Midwest",
  OH: "Midwest",
  SD: "Midwest",
  WI: "Midwest",
  // Southwest
  AZ: "Southwest",
  NM: "Southwest",
  OK: "Southwest",
  TX: "Southwest",
  // West
  CO: "West",
  CA: "West",
  ID: "West",
  MT: "West",
  NV: "West",
  OR: "West",
  UT: "West",
  WA: "West",
  WY: "West",
  // Pacific and territories
  AK: "Pacific",
  HI: "Pacific",
  AS: "Pacific",
  GU: "Pacific",
  MP: "Pacific",
  PR: "Pacific",
  VI: "Pacific",
};

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", AS: "American Samoa", VI: "Virgin Islands", MP: "Northern Mariana Islands",
};
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]),
);

/** Two-letter code for a stored state value (code or full name), or null when there is none. */
export function stateCode(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const code = raw.toUpperCase();
  if (code.length === 2 && STATE_REGION[code]) return code;
  return NAME_TO_CODE[raw.toLowerCase()] ?? null;
}

/** Every spelling a state may be stored under, so a stray full name never hides a school. */
export function stateSpellings(codes: string[]): string[] {
  return codes.flatMap((c) => (STATE_NAMES[c] ? [c, STATE_NAMES[c]] : [c]));
}

/** The region a state belongs to, or null when the state is missing or unknown. */
export function regionOfState(value: unknown): Region | null {
  const code = stateCode(value);
  return code ? (STATE_REGION[code] ?? null) : null;
}

/** Every state in a region. Empty for a value that is not a region. */
export function statesInRegion(region: unknown): string[] {
  const name = String(region ?? "").trim();
  if (!REGIONS.includes(name as Region)) return [];
  return Object.keys(STATE_REGION)
    .filter((code) => STATE_REGION[code] === name)
    .sort();
}

/** Every state code we recognise, alphabetical. */
export function allStates(): string[] {
  return Object.keys(STATE_REGION).sort();
}

export function isRegion(value: unknown): value is Region {
  return REGIONS.includes(String(value ?? "").trim() as Region);
}
