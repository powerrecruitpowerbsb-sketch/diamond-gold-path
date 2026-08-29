import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

export const UNIVERSITY_COLS =
  "id, name, city, state, region, campus_setting, school_size_bucket, public_private, religious_affiliation, religious_tradition, undergrad_enrollment, avg_gpa, avg_sat, avg_act, acceptance_rate, graduation_rate, student_faculty_ratio, test_optional, tuition_in_state, tuition_out_state, room_board, est_cost_of_attendance, est_net_price, tuition_source_url, admissions_url, website_url, financial_aid_url, updated_at";

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
  state: fallback(z.string(), "").default(""),
  governingBody: fallback(z.string(), "").default(""),
  division: fallback(z.string(), "").default(""),
  region: fallback(z.string(), "").default(""),
  conference: fallback(z.string(), "").default(""),
  publicPrivate: fallback(z.string(), "").default(""),
  schoolSize: fallback(z.string(), "").default(""),
  campusSetting: fallback(z.string(), "").default(""),
  academicBucket: fallback(z.string(), "").default(""),
  majorId: fallback(z.string(), "").default(""),
  religious: fallback(z.string(), "").default(""),
  scholarships: fallback(z.string(), "").default(""),
  tuitionMin: fallback(z.number(), 0).default(0),
  tuitionMax: fallback(z.number(), 0).default(0),
  gpaMin: fallback(z.number(), 0).default(0),
  gpaMax: fallback(z.number(), 0).default(0),
  satMin: fallback(z.number(), 0).default(0),
  satMax: fallback(z.number(), 0).default(0),
  actMin: fallback(z.number(), 0).default(0),
  actMax: fallback(z.number(), 0).default(0),
  acceptanceMin: fallback(z.number(), 0).default(0),
  acceptanceMax: fallback(z.number(), 0).default(0),
  rosterMin: fallback(z.number(), 0).default(0),
  rosterMax: fallback(z.number(), 0).default(0),
  more: fallback(z.boolean(), false).default(false),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export type SearchFilters = {
  sport: string;
  q: string;
  state: string;
  governingBody: string;
  division: string;
  region: string;
  conference: string;
  publicPrivate: string;
  schoolSize: string;
  campusSetting: string;
  academicBucket: string;
  majorId: string;
  religious: boolean | null;
  scholarships: boolean | null;
  tuitionMin: number | null;
  tuitionMax: number | null;
  gpaMin: number | null;
  gpaMax: number | null;
  satMin: number | null;
  satMax: number | null;
  actMin: number | null;
  actMax: number | null;
  acceptanceMin: number | null;
  acceptanceMax: number | null;
  rosterMin: number | null;
  rosterMax: number | null;
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
  return {
    sport: str(at("sport")) === "softball" ? "softball" : "baseball",
    q: str(at("q")).slice(0, 100),
    state: str(at("state")),
    governingBody: str(at("governingBody")),
    division: str(at("division")),
    region: str(at("region")),
    conference: str(at("conference")),
    publicPrivate: str(at("publicPrivate")),
    schoolSize: str(at("schoolSize")),
    campusSetting: str(at("campusSetting")),
    academicBucket: str(at("academicBucket")),
    majorId: str(at("majorId")),
    religious: bool(at("religious")),
    scholarships: bool(at("scholarships")),
    tuitionMin: num(at("tuitionMin"), 0, 200000),
    tuitionMax: num(at("tuitionMax"), 0, 200000),
    gpaMin: num(at("gpaMin"), 0, 5),
    gpaMax: num(at("gpaMax"), 0, 5),
    satMin: num(at("satMin"), 400, 1600),
    satMax: num(at("satMax"), 400, 1600),
    actMin: num(at("actMin"), 1, 36),
    actMax: num(at("actMax"), 1, 36),
    acceptanceMin: num(at("acceptanceMin"), 0, 100),
    acceptanceMax: num(at("acceptanceMax"), 0, 100),
    rosterMin: num(at("rosterMin"), 0, 200),
    rosterMax: num(at("rosterMax"), 0, 200),
  };
}

/** Count of applied (non-default) secondary filters, for the "More filters" badge. */
export function activeSecondaryCount(params: SearchParams): number {
  const keys: (keyof SearchParams)[] = [
    "region",
    "conference",
    "publicPrivate",
    "schoolSize",
    "campusSetting",
    "academicBucket",
    "majorId",
    "religious",
    "scholarships",
    "tuitionMin",
    "tuitionMax",
    "gpaMin",
    "gpaMax",
    "satMin",
    "satMax",
    "actMin",
    "actMax",
    "acceptanceMin",
    "acceptanceMax",
    "rosterMin",
    "rosterMax",
  ];
  return keys.filter((key) => {
    const value = params[key];
    return typeof value === "number" ? value > 0 : Boolean(value);
  }).length;
}
