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

/** Two-letter code for a stored state value, or null when there is none. */
export function stateCode(value: unknown): string | null {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  return code.length === 2 && STATE_REGION[code] ? code : null;
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
