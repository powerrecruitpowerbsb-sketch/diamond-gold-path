/** Shared display naming so a program always reads as school + sport + division. */

export const SPORT_LABEL: Record<string, string> = {
  baseball: "Baseball",
  softball: "Softball",
};

export const OFFERING_STATUS_LABEL: Record<string, string> = {
  verified: "Verified program",
  unverified: "Unverified",
  not_offered: "Not offered",
};

export function sportLabel(sport?: string | null) {
  if (!sport) return "";
  return SPORT_LABEL[sport] ?? sport;
}

export function divisionLabel(program: {
  governing_body?: string | null;
  division?: string | null;
}) {
  const parts = [program.governing_body ?? "", program.division ?? ""].filter(Boolean);
  return parts.join(" ").trim();
}

/** "Vanderbilt — Baseball (NCAA D1)" */
export function programLabel(
  program: {
    sport?: string | null;
    governing_body?: string | null;
    division?: string | null;
    universities?: { name?: string | null } | null;
    university_name?: string | null;
  } | null,
): string {
  if (!program) return "Program";
  const school = program.universities?.name ?? program.university_name ?? "";
  const sport = sportLabel(program.sport);
  const div = divisionLabel(program);
  const head = [school, sport].filter(Boolean).join(" — ");
  return div ? `${head} (${div})` : head || "Program";
}

/** "Baseball (NCAA D1)" — when the school name is already on screen. */
export function programSportLabel(program: {
  sport?: string | null;
  governing_body?: string | null;
  division?: string | null;
}) {
  const sport = sportLabel(program.sport);
  const div = divisionLabel(program);
  return div ? `${sport} (${div})` : sport;
}
