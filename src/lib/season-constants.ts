/**
 * Shared season/roster vocabulary. Lives outside `*.functions.ts` so both the
 * client screens and the server functions can import it safely.
 */
export const ATHLETE_STATUSES = ["active", "graduated", "departed"] as const;
export type AthleteStatus = (typeof ATHLETE_STATUSES)[number];

export const ATHLETE_STATUS_LABEL: Record<AthleteStatus, string> = {
  active: "Active",
  graduated: "Graduated",
  departed: "Departed",
};
