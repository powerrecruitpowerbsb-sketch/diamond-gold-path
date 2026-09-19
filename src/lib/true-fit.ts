/**
 * True fit: how an athlete lines up with a college program on three honest
 * measures — academics, the depth in front of them at their own position, and
 * whether the program already recruits from where they live.
 *
 * Nothing here is allowed to punish a school for data we do not have. A missing
 * roster or missing published test scores lowers CONFIDENCE and says so in
 * words; it never lowers a rank and never hides a school.
 */

import { positionGroup, POSITION_GROUP_LABELS, type PositionGroup } from "./position-group";

export type Tier = "safety" | "target" | "reach" | "unknown";

export const TIER_LABELS: Record<Tier, string> = {
  safety: "Safety",
  target: "Target",
  reach: "Reach",
  unknown: "Not enough published data",
};

/** How much of the picture we actually have. Shown, never hidden. */
export type Confidence = "high" | "partial" | "none";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Based on published data",
  partial: "Based on part of the picture",
  none: "No published data yet",
};

export type AcademicNumbers = {
  avgGpa: number | null;
  satTotal25: number | null;
  satTotal75: number | null;
  act25: number | null;
  act75: number | null;
  acceptanceRate: number | null;
  testOptional: boolean | null;
};

export type AthleteAcademics = {
  gpa: number | null;
  sat: number | null;
  act: number | null;
};

export type AcademicFit = {
  tier: Tier;
  confidence: Confidence;
  /** One line per comparison we could actually make. */
  reasons: string[];
  /** What we would need the school to publish to say more. */
  missing: string[];
};

/** Score one number against a published 25th–75th percentile band. */
function bandVerdict(value: number, p25: number, p75: number): Tier {
  if (value >= p75) return "safety";
  if (value >= p25) return "target";
  return "reach";
}

const ORDER: Record<Exclude<Tier, "unknown">, number> = { safety: 2, target: 1, reach: 0 };

export function academicFit(
  school: AcademicNumbers,
  athlete: AthleteAcademics,
): AcademicFit {
  const verdicts: Tier[] = [];
  const reasons: string[] = [];
  const missing: string[] = [];

  if (athlete.sat != null && school.satTotal25 != null && school.satTotal75 != null) {
    const verdict = bandVerdict(athlete.sat, school.satTotal25, school.satTotal75);
    verdicts.push(verdict);
    reasons.push(
      `SAT ${athlete.sat} against a published middle range of ${school.satTotal25}–${school.satTotal75}.`,
    );
  } else if (athlete.sat != null) {
    missing.push("the school has not published an SAT range");
  }

  if (athlete.act != null && school.act25 != null && school.act75 != null) {
    const verdict = bandVerdict(athlete.act, school.act25, school.act75);
    verdicts.push(verdict);
    reasons.push(
      `ACT ${athlete.act} against a published middle range of ${school.act25}–${school.act75}.`,
    );
  } else if (athlete.act != null) {
    missing.push("the school has not published an ACT range");
  }

  if (athlete.gpa != null && school.avgGpa != null) {
    const gap = athlete.gpa - Number(school.avgGpa);
    const verdict: Tier = gap >= 0.2 ? "safety" : gap >= -0.25 ? "target" : "reach";
    verdicts.push(verdict);
    reasons.push(
      `GPA ${athlete.gpa.toFixed(2)} against an average admitted GPA of ${Number(school.avgGpa).toFixed(2)}.`,
    );
  } else if (athlete.gpa != null) {
    missing.push("the school has not published an average GPA");
  }

  if (school.acceptanceRate != null) {
    const pct = Math.round(Number(school.acceptanceRate) * (Number(school.acceptanceRate) <= 1 ? 100 : 1));
    reasons.push(`Admits about ${pct}% of applicants.`);
  }

  if (athlete.gpa == null && athlete.sat == null && athlete.act == null) {
    return {
      tier: "unknown",
      confidence: "none",
      reasons: [],
      missing: ["add the athlete's GPA and test scores to compare academics"],
    };
  }

  if (verdicts.length === 0) {
    return {
      tier: "unknown",
      confidence: "none",
      reasons,
      missing: missing.length ? missing : ["this school has not published admissions numbers"],
    };
  }

  // The tier is the most cautious of the comparisons we could make, so we never
  // call a school a Safety on one number while another says Reach.
  let tier: Exclude<Tier, "unknown"> = "safety";
  for (const verdict of verdicts) {
    if (verdict === "unknown") continue;
    if (ORDER[verdict as Exclude<Tier, "unknown">] < ORDER[tier]) {
      tier = verdict as Exclude<Tier, "unknown">;
    }
  }

  return {
    tier,
    confidence: verdicts.length >= 2 && missing.length === 0 ? "high" : "partial",
    reasons,
    missing,
  };
}

export type DepthPlayer = {
  position: string | null;
  classYear: string | null;
  homeState: string | null;
  twoWay?: boolean | null;
};

export type DepthFit = {
  group: PositionGroup | null;
  groupLabel: string | null;
  /** Players on the most recent roster in the athlete's position group. */
  inGroup: number;
  /** Of those, how many are seniors — the spots that open up. */
  seniorsInGroup: number;
  rosterSize: number;
  seasonYear: number | null;
  confidence: Confidence;
  headline: string;
  detail: string;
};

export function depthFit(
  players: DepthPlayer[],
  athletePosition: string | null,
  seasonYear: number | null,
): DepthFit {
  const group = positionGroup(athletePosition);
  const groupLabel = group ? POSITION_GROUP_LABELS[group] : null;

  if (players.length === 0) {
    return {
      group,
      groupLabel,
      inGroup: 0,
      seniorsInGroup: 0,
      rosterSize: 0,
      seasonYear,
      confidence: "none",
      headline: "Roster data pending",
      detail:
        "We do not have this program's roster yet, so we cannot say how deep they are at this position. This does not count against the school.",
    };
  }

  if (!group) {
    return {
      group,
      groupLabel,
      inGroup: 0,
      seniorsInGroup: 0,
      rosterSize: players.length,
      seasonYear,
      confidence: "partial",
      headline: `${players.length} players on the roster`,
      detail: "Set the athlete's position to see how deep this program is in front of them.",
    };
  }

  const inGroupPlayers = players.filter((player) => positionGroup(player.position) === group);
  const inGroup = inGroupPlayers.length;
  const seniors = inGroupPlayers.filter((player) => player.classYear === "SR").length;
  const statedPositions = players.filter((player) => positionGroup(player.position) !== null).length;
  const share = statedPositions > 0 ? inGroup / statedPositions : 0;

  let headline: string;
  if (inGroup === 0) {
    headline = `No ${groupLabel!.toLowerCase()} listed`;
  } else if (seniors >= Math.max(2, Math.ceil(inGroup / 2))) {
    headline = "Opening up";
  } else if (share > 0.3) {
    headline = "Crowded";
  } else {
    headline = "Steady";
  }

  const detail = [
    `${inGroup} of ${statedPositions} players with a stated position are ${groupLabel!.toLowerCase()}.`,
    seniors > 0
      ? `${seniors} of them are seniors, so those spots come open.`
      : "None of them are seniors, so little turns over at this spot.",
    statedPositions < players.length
      ? `${players.length - statedPositions} players on the roster do not publish a position.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    group,
    groupLabel,
    inGroup,
    seniorsInGroup: seniors,
    rosterSize: players.length,
    seasonYear,
    confidence: statedPositions >= 10 ? "high" : "partial",
    headline,
    detail,
  };
}

export type FootprintFit = {
  confidence: Confidence;
  /** Players from the athlete's home state. */
  fromHomeState: number;
  homeState: string | null;
  statedStates: number;
  /** Most common states on the roster, biggest first. */
  topStates: { state: string; count: number }[];
  headline: string;
  detail: string;
};

export function footprintFit(
  players: DepthPlayer[],
  homeState: string | null,
): FootprintFit {
  const state = homeState ? homeState.trim().toUpperCase() : null;
  const counts = new Map<string, number>();
  for (const player of players) {
    const value = player.homeState ? player.homeState.trim().toUpperCase() : "";
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const topStates = [...counts.entries()]
    .map(([stateCode, count]) => ({ state: stateCode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const statedStates = [...counts.values()].reduce((sum, value) => sum + value, 0);

  if (statedStates < 5) {
    return {
      confidence: "none",
      fromHomeState: 0,
      homeState: state,
      statedStates,
      topStates,
      headline: "Recruiting footprint pending",
      detail:
        "This program's roster does not publish enough hometowns yet to say where they recruit from. This does not count against the school.",
    };
  }

  const fromHomeState = state ? (counts.get(state) ?? 0) : 0;

  let headline: string;
  let detail: string;
  if (!state) {
    headline = "Add a home state";
    detail = `They list players from ${counts.size} states. Add the athlete's home state to see whether it is one of them.`;
  } else if (fromHomeState === 0) {
    headline = `No ${state} players listed`;
    detail = `Their current roster lists no one from ${state}. That is worth knowing, not a no — plenty of programs sign their first player from a state every year.`;
  } else {
    headline = `${fromHomeState} from ${state}`;
    detail = `They already carry ${fromHomeState} player${fromHomeState === 1 ? "" : "s"} from ${state}, across ${counts.size} states in all.`;
  }

  return {
    confidence: statedStates >= 15 ? "high" : "partial",
    fromHomeState,
    homeState: state,
    statedStates,
    topStates,
    headline,
    detail,
  };
}
