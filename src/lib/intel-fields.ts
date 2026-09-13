/**
 * The intelligence field catalogue — one definition shared by the workstation,
 * the approval queue and the program profile.
 *
 * `audience` decides who may ever see the field: "family" fields are the
 * conclusion a family pays for, "org" fields are the evidence that produced it
 * and stay inside the organization unless a coach shares that record on purpose.
 */

export type IntelGroup = "recruiting" | "relationship" | "notes";
export type IntelKind = "text" | "choice" | "positions" | "grad_needs";

export type IntelFieldDef = {
  key: string;
  label: string;
  group: IntelGroup;
  kind: IntelKind;
  audience: "family" | "org";
  help?: string;
  choices?: { value: string; label: string }[];
};

const CHOICES = {
  portal: [
    { value: "heavy", label: "Heavy" },
    { value: "moderate", label: "Moderate" },
    { value: "rarely", label: "Rarely" },
  ],
  juco: [
    { value: "heavy", label: "Heavy" },
    { value: "some", label: "Some" },
    { value: "rarely", label: "Rarely" },
  ],
  lean: [
    { value: "mostly_hs", label: "Mostly high school" },
    { value: "balanced", label: "Balanced" },
    { value: "mostly_transfer", label: "Mostly transfer" },
  ],
  timeline: [
    { value: "early", label: "Early" },
    { value: "typical", label: "Typical" },
    { value: "late", label: "Late" },
  ],
} as const;

/** Positions a coach can prioritise — our own stored position values. */
export const INTEL_POSITIONS = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MIF",
  "CIF",
  "IF",
  "OF",
  "RHP",
  "LHP",
  "P",
  "UTIL",
  "TWO_WAY",
] as const;

export const POSITION_LABELS: Record<string, string> = {
  C: "Catcher",
  "1B": "First base",
  "2B": "Second base",
  "3B": "Third base",
  SS: "Shortstop",
  MIF: "Middle infield",
  CIF: "Corner infield",
  IF: "Infield",
  OF: "Outfield",
  RHP: "RH pitcher",
  LHP: "LH pitcher",
  P: "Pitcher",
  UTIL: "Utility",
  TWO_WAY: "Two-way",
};

export const INTEL_FIELDS: IntelFieldDef[] = [
  // ---- Recruiting: the conclusion families are paying for -----------------
  { key: "style_of_play", label: "Style of play", group: "recruiting", kind: "text", audience: "family" },
  {
    key: "recruiting_philosophy",
    label: "Recruiting philosophy",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "preferred_player_profile",
    label: "Preferred player profile",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "physical_traits_valued",
    label: "Physical traits valued",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "positions_prioritized",
    label: "Positions prioritized",
    group: "recruiting",
    kind: "positions",
    audience: "family",
    help: "Pick the positions, then add the specific observation.",
  },
  {
    key: "hs_vs_transfer_lean",
    label: "High school vs transfer lean",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    choices: [...CHOICES.lean],
  },
  {
    key: "portal_usage",
    label: "Transfer portal usage",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    choices: [...CHOICES.portal],
  },
  {
    key: "juco_recruiting",
    label: "JUCO recruiting",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    choices: [...CHOICES.juco],
  },
  {
    key: "recruiting_timeline",
    label: "Recruiting timeline",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    choices: [...CHOICES.timeline],
  },
  {
    key: "freshman_tendencies",
    label: "Freshman tendencies",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "transfer_juco_tendencies",
    label: "Transfer & JUCO tendencies",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "geographic_tendencies",
    label: "Geographic tendencies",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "roster_construction_tendencies",
    label: "Roster construction tendencies",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },
  {
    key: "development_philosophy",
    label: "Development philosophy",
    group: "recruiting",
    kind: "text",
    audience: "family",
  },

  // ---- Notes: the evidence, staff only unless shared on purpose -----------
  {
    key: "coaching_staff_reputation",
    label: "Coaching staff reputation",
    group: "notes",
    kind: "text",
    audience: "org",
  },
  { key: "program_stability", label: "Program stability", group: "notes", kind: "text", audience: "org" },
  { key: "roster_needs", label: "Roster needs", group: "notes", kind: "text", audience: "org" },
  { key: "current_priorities", label: "Current priorities", group: "notes", kind: "text", audience: "org" },
  {
    key: "graduation_needs",
    label: "Graduation needs by position",
    group: "notes",
    kind: "grad_needs",
    audience: "org",
    help: "Positions graduating, and the year.",
  },
  {
    key: "players_previously_recruited",
    label: "Players previously recruited or committed",
    group: "notes",
    kind: "text",
    audience: "org",
  },
  { key: "staff_notes", label: "Staff notes", group: "notes", kind: "text", audience: "org" },
];

export const INTEL_FIELD_MAP: Record<string, IntelFieldDef> = Object.fromEntries(
  INTEL_FIELDS.map((field) => [field.key, field]),
);

export const FAMILY_VISIBLE_FIELDS = INTEL_FIELDS.filter((f) => f.audience === "family").map(
  (f) => f.key,
);

export const STRENGTH_CHOICES = [
  { value: "strong", label: "Strong" },
  { value: "developing", label: "Developing" },
  { value: "minimal", label: "Minimal" },
  { value: "none", label: "None" },
];

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Sent back",
};

/** How many fields a program can hold — the denominator in "6 / 21". */
export const INTEL_FIELD_COUNT = INTEL_FIELDS.length;

export function fieldLabel(key: string): string {
  return INTEL_FIELD_MAP[key]?.label ?? key;
}

/** The stored structured answer as a human label. */
export function structuredLabel(key: string, value: string | null | undefined): string | null {
  if (!value) return null;
  const choices = INTEL_FIELD_MAP[key]?.choices ?? [];
  return choices.find((c) => c.value === value)?.label ?? value;
}
