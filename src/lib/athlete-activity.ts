/**
 * The athlete's own recruiting trail with one school.
 *
 * The stage on the college list answers "how far along is this school?".
 * These chips answer "what has actually happened?" — what the player sent,
 * how the coach answered, visits, and anything on the table.
 *
 * Both the family and the club staff see and set the same chips, so nobody
 * has to ask where things stand.
 */

export type ActivityChip = { id: string; label: string };
export type ActivityGroup = { id: string; title: string; hint: string; chips: ActivityChip[] };

export const ACTIVITY_GROUPS: ActivityGroup[] = [
  {
    id: "outreach",
    title: "Our outreach",
    hint: "What the player or family sent to this program.",
    chips: [
      { id: "intro_email", label: "Intro email sent" },
      { id: "questionnaire", label: "Questionnaire completed" },
      { id: "video_sent", label: "Video / highlights sent" },
      { id: "schedule_sent", label: "Schedule sent" },
      { id: "social_dm", label: "DM on X / Instagram" },
      { id: "transcript_sent", label: "Transcript / test scores sent" },
    ],
  },
  {
    id: "response",
    title: "Coach response",
    hint: "What came back from their staff.",
    chips: [
      { id: "email_opened", label: "Coach opened email" },
      { id: "coach_replied", label: "Coach replied" },
      { id: "phone_call", label: "Phone call held" },
      { id: "watched_live", label: "Coach watched me play" },
      { id: "camp_invite", label: "Camp invite received" },
      { id: "no_response", label: "No response yet" },
    ],
  },
  {
    id: "visits",
    title: "Camps & visits",
    hint: "Time spent on campus or in front of their staff.",
    chips: [
      { id: "camp_attended", label: "Camp attended" },
      { id: "unofficial_visit", label: "Unofficial visit" },
      { id: "official_visit", label: "Official visit" },
      { id: "game_attended", label: "Watched one of their games" },
      { id: "visit_scheduled", label: "Visit scheduled" },
    ],
  },
  {
    id: "opportunity",
    title: "On the table",
    hint: "Anything the program has actually put forward.",
    chips: [
      { id: "roster_spot", label: "Roster spot offered" },
      { id: "scholarship", label: "Scholarship offered" },
      { id: "academic_offer", label: "Academic money offered" },
      { id: "committed", label: "Committed here" },
      { id: "passed", label: "Not a fit / passed" },
    ],
  },
];

export const ACTIVITY_CHIP_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITY_GROUPS.flatMap((group) => group.chips.map((chip) => [chip.id, chip.label])),
);

export const ACTIVITY_CHIP_IDS = Object.keys(ACTIVITY_CHIP_LABEL);

/** The few markers worth showing on a crowded list row. */
export const HIGH_SIGNAL_CHIPS = [
  "committed",
  "scholarship",
  "roster_spot",
  "official_visit",
  "coach_replied",
];

export function activityChipLabel(id: string): string {
  return ACTIVITY_CHIP_LABEL[id] ?? id;
}

/** Highest-signal first, so a row shows "Scholarship offered" before "Coach replied". */
export function highlightChips(chips: string[], limit = 2): string[] {
  return HIGH_SIGNAL_CHIPS.filter((id) => chips.includes(id)).slice(0, limit);
}

/** Red tone is reserved for our own intelligence, so these stay neutral/green. */
export function chipTone(id: string): string {
  if (id === "committed" || id === "scholarship" || id === "roster_spot" || id === "academic_offer")
    return "border-diamond-green/30 bg-diamond-green-tint text-diamond-green";
  if (id === "passed" || id === "no_response") return "border-border bg-muted text-steel";
  return "border-org-primary/25 bg-org-primary/10 text-org-primary";
}
