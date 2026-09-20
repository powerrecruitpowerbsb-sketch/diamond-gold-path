/**
 * Measurables for an athlete.
 *
 * Every number lives as its own row (metric key + value + unit + date + where it
 * came from) rather than as a column on the athlete. That is deliberate: outside
 * testing services (Curve Testing, HandledReports, Perfect Game, Prep Baseball
 * Report) can feed numbers in later without a schema change, and a family can
 * keep a history instead of overwriting last spring's figure.
 */

import { type Sport } from "@/lib/sport";

/** How the picker groups numbers so a family finds theirs quickly. */
export type MetricGroup = "Body" | "Hitting" | "Pitching" | "Fielding" | "Speed & agility";

export type MetricDef = {
  key: string;
  label: string;
  unit: string;
  sports: Sport[];
  group: MetricGroup;
  /** Lower is better (times) vs higher is better (velocities, jumps). */
  lowerIsBetter?: boolean;
  step?: number;
};

const BOTH: Sport[] = ["baseball", "softball"];

export const METRIC_DEFS: MetricDef[] = [
  // Body
  { key: "height", label: "Height", unit: "in", sports: BOTH, group: "Body" },
  { key: "weight", label: "Weight", unit: "lb", sports: BOTH, group: "Body" },

  // Hitting
  { key: "exit_velo", label: "Exit velocity", unit: "mph", sports: BOTH, group: "Hitting" },
  { key: "max_exit_velo", label: "Max exit velocity", unit: "mph", sports: BOTH, group: "Hitting" },
  { key: "bat_speed", label: "Bat speed", unit: "mph", sports: BOTH, group: "Hitting" },

  // Pitching — baseball
  { key: "fastball_velo", label: "Fastball", unit: "mph", sports: ["baseball"], group: "Pitching" },
  { key: "curveball_velo", label: "Curveball", unit: "mph", sports: ["baseball"], group: "Pitching" },
  { key: "changeup_velo", label: "Changeup", unit: "mph", sports: ["baseball"], group: "Pitching" },
  { key: "sliders_velo", label: "Slider", unit: "mph", sports: ["baseball"], group: "Pitching" },

  // Pitching — softball (fastpitch repertoire)
  { key: "pitch_velo", label: "Pitching speed", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_fastball_velo", label: "Fastball", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_riseball_velo", label: "Rise ball", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_dropball_velo", label: "Drop ball", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_curveball_velo", label: "Curveball", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_changeup_velo", label: "Changeup", unit: "mph", sports: ["softball"], group: "Pitching" },
  { key: "sb_screwball_velo", label: "Screwball", unit: "mph", sports: ["softball"], group: "Pitching" },

  // Fielding
  { key: "of_velo", label: "Outfield velocity", unit: "mph", sports: BOTH, group: "Fielding" },
  { key: "if_velo", label: "Infield velocity", unit: "mph", sports: BOTH, group: "Fielding" },
  { key: "catcher_velo", label: "Catcher velocity", unit: "mph", sports: BOTH, group: "Fielding" },
  { key: "overhand_velo", label: "Overhand throwing velocity", unit: "mph", sports: ["softball"], group: "Fielding" },
  { key: "pop_time", label: "Pop time", unit: "sec", sports: BOTH, group: "Fielding", lowerIsBetter: true, step: 0.01 },

  // Speed & agility
  { key: "sixty_yard", label: "60-yard dash", unit: "sec", sports: ["baseball"], group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "twenty_yard", label: "20-yard dash", unit: "sec", sports: ["softball"], group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "home_to_home", label: "Home to home", unit: "sec", sports: ["softball"], group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "pro_agility", label: "Pro agility (5-10-5)", unit: "sec", sports: BOTH, group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "home_to_first", label: "Home to first", unit: "sec", sports: BOTH, group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "ten_yard", label: "10-yard split", unit: "sec", sports: BOTH, group: "Speed & agility", lowerIsBetter: true, step: 0.01 },
  { key: "vertical_jump", label: "Vertical jump", unit: "in", sports: BOTH, group: "Speed & agility", step: 0.1 },
  { key: "broad_jump", label: "Broad jump", unit: "in", sports: BOTH, group: "Speed & agility", step: 0.1 },
];

export const METRIC_KEYS = METRIC_DEFS.map((m) => m.key);

/** Only the numbers that belong to this athlete's game. */
export function metricsForSport(sport: Sport): MetricDef[] {
  return METRIC_DEFS.filter((m) => m.sports.includes(sport));
}

export const METRIC_GROUP_ORDER: MetricGroup[] = [
  "Pitching",
  "Hitting",
  "Fielding",
  "Speed & agility",
  "Body",
];

/** The sport's numbers, grouped in the order a coach reads them. */
export function metricGroupsForSport(sport: Sport): { group: MetricGroup; metrics: MetricDef[] }[] {
  const all = metricsForSport(sport);
  return METRIC_GROUP_ORDER.map((group) => ({
    group,
    metrics: all.filter((m) => m.group === group),
  })).filter((entry) => entry.metrics.length > 0);
}


export function metricDef(key: string): MetricDef | null {
  return METRIC_DEFS.find((m) => m.key === key) ?? null;
}

export function metricLabel(key: string): string {
  return metricDef(key)?.label ?? key.replace(/_/g, " ");
}

/** Where a number came from. Only "manual" is typed in by a person today. */
export const METRIC_SOURCES = [
  "manual",
  "curve_testing",
  "handled_reports",
  "perfect_game",
  "prep_baseball_report",
  "other",
] as const;

export type MetricSource = (typeof METRIC_SOURCES)[number];

export const METRIC_SOURCE_LABEL: Record<MetricSource, string> = {
  manual: "Entered by hand",
  curve_testing: "Curve Testing",
  handled_reports: "HandledReports",
  perfect_game: "Perfect Game",
  prep_baseball_report: "Prep Baseball Report",
  other: "Another service",
};

export function metricSourceLabel(source: unknown): string {
  const key = String(source ?? "manual") as MetricSource;
  return METRIC_SOURCE_LABEL[key] ?? String(source);
}

export function formatMetric(value: unknown, key: string): string {
  const def = metricDef(key);
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (key === "height") return formatHeight(n);
  const decimals = def?.step && def.step < 1 ? 2 : n % 1 === 0 ? 0 : 1;
  return `${n.toFixed(decimals)} ${def?.unit ?? ""}`.trim();
}

/** The unit a number is recorded in: mph, sec, in, lb. */
export function metricUnit(key: string): string {
  return metricDef(key)?.unit ?? "";
}

/** How finely the number is typed: hundredths for times, tenths for speeds. */
export function metricStep(key: string): number {
  const def = metricDef(key);
  if (def?.step) return def.step;
  if (def?.unit === "sec") return 0.01;
  if (def?.unit === "mph") return 0.1;
  return 1;
}

/** 74 -> { feet: 6, inches: 2 } */
export function splitHeight(totalInches: unknown): { feet: number | ""; inches: number | "" } {
  const n = Number(totalInches);
  if (!Number.isFinite(n) || n <= 0) return { feet: "", inches: "" };
  return { feet: Math.floor(n / 12), inches: Math.round(n % 12) };
}

/** Accepts 6'2", 6-2, 6 2 or plain inches and returns total inches. */
export function parseHeightInput(text: unknown): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const pair = raw.match(/^(\d{1,2})\s*(?:'|ft|-|\s)\s*(\d{1,2})?\s*(?:"|in)?$/i);
  if (pair) {
    const feet = Number(pair[1]);
    const inches = Number(pair[2] ?? 0);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    return feet * 12 + inches;
  }
  const plain = Number(raw.replace(/["in\s]/gi, ""));
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : null;
}

/** 74 -> 6'2" */
export function formatHeight(inches: unknown): string {
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${Math.floor(n / 12)}'${Math.round(n % 12)}"`;
}


/** Keeps the newest row per metric key. */
export function latestByMetric<T extends { metric_key: string; recorded_on?: string | null; created_at?: string }>(
  rows: T[],
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.metric_key);
    const when = (row.recorded_on ?? row.created_at ?? "") as string;
    const currentWhen = (current?.recorded_on ?? current?.created_at ?? "") as string;
    if (!current || when > currentWhen) best.set(row.metric_key, row);
  }
  return METRIC_KEYS.map((key) => best.get(key)).filter(Boolean) as T[];
}
