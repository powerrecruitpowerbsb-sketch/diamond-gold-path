/**
 * Sport is a first-class property of an athlete, and of every college program.
 * One vocabulary for both, so a player's sport and a program's sport compare
 * directly — a softball player never ends up with a baseball program saved.
 */
export const SPORTS = ["baseball", "softball"] as const;

export type Sport = (typeof SPORTS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  baseball: "Baseball",
  softball: "Softball",
};

export function isSport(value: unknown): value is Sport {
  return (SPORTS as readonly string[]).includes(String(value ?? "").trim().toLowerCase());
}

/** Anything unrecognised reads as the fallback rather than blocking a write. */
export function normalizeSport(value: unknown, fallback: Sport = "baseball"): Sport {
  const candidate = String(value ?? "").trim().toLowerCase();
  return isSport(candidate) ? (candidate as Sport) : fallback;
}
