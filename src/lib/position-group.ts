/**
 * Derived position groups.
 *
 * The group is computed from the STORED position value, never from the page's
 * own wording. A page printing "MIF", one printing "Middle Infield" and one
 * printing "SS" are all normalised to a stored value first, so all three land in
 * the same group. Outfield is ONE bucket: left, centre and right field are all
 * stored as OF and grouped as outfield — never split.
 */

export type PositionGroup =
  | "pitcher"
  | "catcher"
  | "middle_infield"
  | "corner_infield"
  | "outfield"
  | "utility";

/** Stored player_position values, in one place. */
export const STORED_POSITIONS = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MIF",
  "CIF",
  "OF",
  "UTIL",
  "RHP",
  "LHP",
  "TWO_WAY",
] as const;

const GROUPS: Record<string, PositionGroup> = {
  RHP: "pitcher",
  LHP: "pitcher",
  C: "catcher",
  "2B": "middle_infield",
  SS: "middle_infield",
  MIF: "middle_infield",
  "1B": "corner_infield",
  "3B": "corner_infield",
  CIF: "corner_infield",
  OF: "outfield",
  UTIL: "utility",
  TWO_WAY: "utility",
};

/** The group for a stored position value, or null when there is no position. */
export function positionGroup(stored: unknown): PositionGroup | null {
  const key = String(stored ?? "").trim().toUpperCase();
  if (!key) return null;
  return GROUPS[key] ?? null;
}

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  pitcher: "Pitcher",
  catcher: "Catcher",
  middle_infield: "Middle infield",
  corner_infield: "Corner infield",
  outfield: "Outfield",
  utility: "Utility",
};

/** Which stored values belong to a group — used by group filters. */
export function positionsInGroup(group: PositionGroup): string[] {
  return STORED_POSITIONS.filter((position) => GROUPS[position] === group);
}
