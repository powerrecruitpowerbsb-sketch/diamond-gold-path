import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

import { isRegion, stateCode, statesInRegion } from "@/lib/regions";


export const UNIVERSITY_COLS =
  "id, name, city, state, region, campus_setting, school_size_bucket, public_private, religious_affiliation, religious_tradition, undergrad_enrollment, avg_gpa, avg_sat, avg_act, sat_total_25, sat_total_75, act_25, act_75, acceptance_rate, graduation_rate, student_faculty_ratio, test_optional, tuition_in_state, tuition_out_state, room_board, est_cost_of_attendance, est_net_price, tuition_source_url, admissions_url, website_url, financial_aid_url, updated_at";

export const INTEL_FIELD_LABELS: Record<string, string> = {
  style_of_play: "Style of play",
  recruiting_philosophy: "Recruiting philosophy",
  positions_prioritized: "Positions prioritized",
  preferred_player_profile: "Preferred player profile",
  transfer_juco_tendencies: "Transfer & JUCO tendencies",
  freshman_tendencies: "Freshman tendencies",
  geographic_tendencies: "Geographic tendencies",
  recruiting_timeline: "Recruiting timeline",
  roster_construction_tendencies: "Roster construction tendencies",
};

export const DIVISIONS_BY_BODY: Record<string, string[]> = {
  NCAA: ["D1", "D2", "D3"],
  NAIA: [],
  NJCAA: ["D1", "D2", "D3"],
};

/** URL search-param schema. No bounds here — clamp in the component. */
export const searchParamsSchema = z.object({
  sport: fallback(z.string(), "baseball").default("baseball"),
  q: fallback(z.string(), "").default(""),
  /** Location is one control: a region, or one or more states within it. */
  region: fallback(z.string(), "").default(""),
  states: fallback(z.string().array(), []).default([]),
  state: fallback(z.string(), "").default(""),
  governingBody: fallback(z.string(), "").default(""),
  division: fallback(z.string(), "").default(""),
  conference: fallback(z.string(), "").default(""),
  publicPrivate: fallback(z.string(), "").default(""),
  schoolSize: fallback(z.string(), "").default(""),
  campusSetting: fallback(z.string(), "").default(""),
  academicBucket: fallback(z.string(), "").default(""),
  majorId: fallback(z.string(), "").default(""),
  religious: fallback(z.string(), "").default(""),
  scholarships: fallback(z.string(), "").default(""),
  netPriceMin: fallback(z.number(), 0).default(0),
  netPriceMax: fallback(z.number(), 0).default(0),
  tuitionMin: fallback(z.number(), 0).default(0),
  tuitionMax: fallback(z.number(), 0).default(0),
  coaMin: fallback(z.number(), 0).default(0),
  coaMax: fallback(z.number(), 0).default(0),
  satMin: fallback(z.number(), 0).default(0),
  satMax: fallback(z.number(), 0).default(0),
  actMin: fallback(z.number(), 0).default(0),
  actMax: fallback(z.number(), 0).default(0),
  acceptanceMin: fallback(z.number(), 0).default(0),
  acceptanceMax: fallback(z.number(), 0).default(0),
  rosterMin: fallback(z.number(), 0).default(0),
  rosterMax: fallback(z.number(), 0).default(0),
  /** Roster composition, read only when one of these is in use. */
  positionGroup: fallback(z.string(), "").default(""),
  positionMin: fallback(z.number(), 0).default(0),
  positionMax: fallback(z.number(), 0).default(0),
  seniorGroup: fallback(z.string(), "").default(""),
  seniorMin: fallback(z.number(), 0).default(0),
  transferPctMin: fallback(z.number(), 0).default(0),
  transferPctMax: fallback(z.number(), 0).default(0),
  /** Our own recruiting intelligence: "field:value" tokens, positions, relationship. */
  intel: fallback(z.string().array(), []).default([]),
  intelPositions: fallback(z.string().array(), []).default([]),
  relationship: fallback(z.string(), "").default(""),
  /** Off by default: matches rise to the top, unevaluated programs stay below. */
  intelOnly: fallback(z.boolean(), false).default(false),
  sort: fallback(z.string(), "name").default("name"),
  dir: fallback(z.string(), "asc").default("asc"),
  more: fallback(z.boolean(), false).default(false),
  athleteId: fallback(z.string(), "").default(""),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;


/** Default values stripped from the URL so a fresh search has a clean link. */
export const SEARCH_DEFAULTS = {
  sport: "baseball",
  q: "",
  region: "",
  state: "",
  governingBody: "",
  division: "",
  conference: "",
  publicPrivate: "",
  schoolSize: "",
  campusSetting: "",
  academicBucket: "",
  majorId: "",
  religious: "",
  scholarships: "",
  netPriceMin: 0,
  netPriceMax: 0,
  tuitionMin: 0,
  tuitionMax: 0,
  coaMin: 0,
  coaMax: 0,
  satMin: 0,
  satMax: 0,
  actMin: 0,
  actMax: 0,
  acceptanceMin: 0,
  acceptanceMax: 0,
  rosterMin: 0,
  rosterMax: 0,
  positionGroup: "",
  positionMin: 0,
  positionMax: 0,
  seniorGroup: "",
  seniorMin: 0,
  transferPctMin: 0,
  transferPctMax: 0,
  sort: "name",
  dir: "asc",
  athleteId: "",
  more: false,
} as const;

export type SearchFilters = {
  sport: string;
  q: string;
  region: string;
  /** Resolved list of states: chosen states, or every state in the chosen region. */
  states: string[];
  governingBody: string;
  division: string;
  conference: string;
  publicPrivate: string;
  schoolSize: string;
  campusSetting: string;
  academicBucket: string;
  majorId: string;
  religious: boolean | null;
  scholarships: boolean | null;
  netPriceMin: number | null;
  netPriceMax: number | null;
  tuitionMin: number | null;
  tuitionMax: number | null;
  coaMin: number | null;
  coaMax: number | null;
  satMin: number | null;
  satMax: number | null;
  actMin: number | null;
  actMax: number | null;
  acceptanceMin: number | null;
  acceptanceMax: number | null;
  rosterMin: number | null;
  rosterMax: number | null;
  positionGroup: string;
  positionMin: number | null;
  positionMax: number | null;
  seniorGroup: string;
  seniorMin: number | null;
  transferPctMin: number | null;
  transferPctMax: number | null;
};

const str = (value: unknown) => String(value ?? "").trim();
const bool = (value: unknown): boolean | null => {
  const v = str(value);
  if (v === "yes" || v === "true") return true;
  if (v === "no" || v === "false") return false;
  return null;
};
const num = (value: unknown, lo: number, hi: number): number | null => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(n, lo), hi);
};

/** Clamp + coerce raw URL params into the server-side filter shape. */
export function normalizeSearchInput(input: unknown): SearchFilters {
  const raw = (input ?? {}) as Record<string, unknown>;
  const at = (key: string) => raw[key];

  // Location is one control. States picked by hand win; otherwise the region
  // resolves to its states through the shared grouping, never a stored column.
  const region = isRegion(at("region")) ? str(at("region")) : "";
  const picked = [
    ...(Array.isArray(at("states")) ? (at("states") as unknown[]) : []),
    at("state"),
  ]
    .map((value) => stateCode(value))
    .filter((code): code is string => Boolean(code));
  const withinRegion = region ? statesInRegion(region) : [];
  const chosen = Array.from(new Set(picked));
  const states =
    chosen.length > 0
      ? region
        ? chosen.filter((code) => withinRegion.includes(code))
        : chosen
      : withinRegion;

  return {
    sport: str(at("sport")) === "softball" ? "softball" : "baseball",
    q: str(at("q")).slice(0, 100),
    region,
    states,
    governingBody: str(at("governingBody")),
    division: str(at("division")),
    conference: str(at("conference")),
    publicPrivate: str(at("publicPrivate")),
    schoolSize: str(at("schoolSize")),
    campusSetting: str(at("campusSetting")),
    academicBucket: str(at("academicBucket")),
    majorId: str(at("majorId")),
    religious: bool(at("religious")),
    scholarships: bool(at("scholarships")),
    netPriceMin: num(at("netPriceMin"), 0, 200000),
    netPriceMax: num(at("netPriceMax"), 0, 200000),
    tuitionMin: num(at("tuitionMin"), 0, 200000),
    tuitionMax: num(at("tuitionMax"), 0, 200000),
    coaMin: num(at("coaMin"), 0, 200000),
    coaMax: num(at("coaMax"), 0, 200000),
    satMin: num(at("satMin"), 400, 1600),
    satMax: num(at("satMax"), 400, 1600),
    actMin: num(at("actMin"), 1, 36),
    actMax: num(at("actMax"), 1, 36),
    acceptanceMin: num(at("acceptanceMin"), 0, 100),
    acceptanceMax: num(at("acceptanceMax"), 0, 100),
    rosterMin: num(at("rosterMin"), 0, 200),
    rosterMax: num(at("rosterMax"), 0, 200),
    positionGroup: str(at("positionGroup")),
    positionMin: num(at("positionMin"), 0, 100),
    positionMax: num(at("positionMax"), 0, 100),
    seniorGroup: str(at("seniorGroup")),
    seniorMin: num(at("seniorMin"), 0, 100),
    transferPctMin: num(at("transferPctMin"), 0, 100),
    transferPctMax: num(at("transferPctMax"), 0, 100),
  };
}

/** Is any roster-composition filter in use? Those need per-player reads. */
export function compositionActive(f: SearchFilters): boolean {
  return Boolean(
    (f.positionGroup && (f.positionMin !== null || f.positionMax !== null)) ||
      (f.seniorGroup && f.seniorMin !== null) ||
      f.transferPctMin !== null ||
      f.transferPctMax !== null ||
      f.rosterMin !== null ||
      f.rosterMax !== null,
  );
}

/** Count of applied (non-default) secondary filters, for the "More filters" badge. */
export function activeSecondaryCount(params: SearchParams): number {
  const keys: (keyof SearchParams)[] = [
    "conference",
    "publicPrivate",
    "schoolSize",
    "campusSetting",
    "academicBucket",
    "religious",
    "scholarships",
    "tuitionMin",
    "tuitionMax",
    "coaMin",
    "coaMax",
    "satMin",
    "satMax",
    "actMin",
    "actMax",
    "acceptanceMin",
    "acceptanceMax",
    "rosterMin",
    "rosterMax",
    "positionGroup",
    "seniorGroup",
    "transferPctMin",
    "transferPctMax",
  ];
  return keys.filter((key) => {
    const value = params[key];
    return typeof value === "number" ? value > 0 : Boolean(value);
  }).length;
}

