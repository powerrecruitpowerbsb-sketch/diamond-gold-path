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
  | "infield"
  | "outfield"
  | "utility";

/** Stored player_position values, in one place. */
export const STORED_POSITIONS = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "IF",
  "MIF",
  "CIF",
  "OF",
  "UTIL",
  "P",
  "RHP",
  "LHP",
  "TWO_WAY",
] as const;

const GROUPS: Record<string, PositionGroup> = {
  P: "pitcher",
  RHP: "pitcher",
  LHP: "pitcher",
  C: "catcher",
  "2B": "middle_infield",
  SS: "middle_infield",
  MIF: "middle_infield",
  "1B": "corner_infield",
  "3B": "corner_infield",
  CIF: "corner_infield",
  IF: "infield",
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

/**
 * Does this player pitch? "TWO_WAY" is only ever stored for a cell that named a
 * pitching role alongside a fielding one, so it counts.
 */
export function isPitcher(position: unknown, twoWay?: boolean | null): boolean {
  const key = String(position ?? "").trim().toUpperCase();
  return key === "P" || key === "RHP" || key === "LHP" || key === "TWO_WAY" || twoWay === true;
}

/**
 * Which hand does this pitcher throw with?
 *
 * The stored position stays faithful to the page: a page printing only "P" is
 * stored as "P". But RHP and LHP describe a throwing hand, and most pages that
 * print "P" publish the hand in their own throws column — so the counts combine
 * the two. A pitcher with no throws value published stays hand-not-stated.
 */
export function pitcherHand(
  position: unknown,
  throwsValue: unknown,
): "R" | "L" | null {
  const key = String(position ?? "").trim().toUpperCase();
  if (key === "RHP") return "R";
  if (key === "LHP") return "L";
  const hand = String(throwsValue ?? "").trim().toUpperCase();
  if (hand === "R" || hand === "L") return hand;
  return null;
}


export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  pitcher: "Pitcher",
  catcher: "Catcher",
  middle_infield: "Middle infield",
  corner_infield: "Corner infield",
  infield: "Infield (spot not stated)",
  outfield: "Outfield",
  utility: "Utility",
};


/** Which stored values belong to a group — used by group filters. */
export function positionsInGroup(group: PositionGroup): string[] {
  return STORED_POSITIONS.filter((position) => GROUPS[position] === group);
}
