/**
 * The intelligence field catalogue — one definition shared by the workstation,
 * the approval queue and the program profile.
 *
 * `audience` decides who may ever see the field: "family" fields are the
 * conclusion a family pays for, "org" fields are the evidence that produced it
 * and stay inside the organization unless a coach shares that record on purpose.
 *
 * Most recruiting answers are pick-lists so a whole program can be logged in
 * under a minute. `multi: true` means several answers can be true at once; the
 * chosen values are stored comma-joined in `structured_value`, which keeps every
 * previously saved single answer readable exactly as before.
 */

export type IntelGroup = "recruiting" | "relationship" | "notes";
export type IntelKind = "text" | "choice" | "positions" | "grad_needs";

export type IntelFieldDef = {
  key: string;
  label: string;
  group: IntelGroup;
  kind: IntelKind;
  audience: "family" | "org";
  /** Several answers may be true at once. */
  multi?: boolean;
  help?: string;
  choices?: { value: string; label: string }[];
};

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

/** One-tap position groups above the individual position chips. */
export const POSITION_GROUP_PRESETS: { label: string; positions: string[] }[] = [
  { label: "Up the middle", positions: ["C", "SS", "2B", "MIF", "OF"] },
  { label: "Pitching staff", positions: ["RHP", "LHP", "P"] },
  { label: "Corner power", positions: ["1B", "3B", "CIF", "OF"] },
  { label: "All positions", positions: [...INTEL_POSITIONS] },
];

const CHOICES = {
  style: [
    { value: "speed_smallball", label: "Speed, small-ball & pressure" },
    { value: "power_slugging", label: "Power & slugging" },
    { value: "pitching_defense", label: "Pitching & run prevention" },
    { value: "contact_situational", label: "High-contact & situational execution" },
    { value: "analytics_balanced", label: "Modern balanced & analytics-driven" },
  ],
  philosophy: [
    { value: "high_ceiling", label: "High-ceiling projection" },
    { value: "proven_performers", label: "Proven performers / game winners" },
    { value: "in_state_identity", label: "In-state & local identity" },
    { value: "national_showcase", label: "National showcase circuit" },
    { value: "high_academic", label: "High-academic first" },
    { value: "late_bloomers", label: "Value & late-bloomer hunting" },
  ],
  pitcher: [
    { value: "command_pitchability", label: "Command & pitchability first" },
    { value: "power_swing_miss", label: "Power & swing-and-miss stuff" },
    { value: "sinker_groundball", label: "Heavy sinker / groundball inducer" },
    { value: "spin_metrics", label: "Spin & metric outliers" },
    { value: "frame_projection", label: "Tall frame & projection" },
    { value: "relief_leverage", label: "Relief / high-leverage bulldogs" },
    { value: "rise_movement", label: "Rise-ball & movement specialist" },
  ],
  positionPlayer: [
    { value: "power_bats", label: "Middle-of-the-order power bats" },
    { value: "multi_sport_athletes", label: "Plus multi-sport athletes & high motors" },
    { value: "up_the_middle", label: "Premium up-the-middle defenders" },
    { value: "obp_contact", label: "High-OBP & contact hitters" },
    { value: "speed_slappers", label: "Triple-threat speed & slappers" },
    { value: "versatility_two_way", label: "Position versatility & two-way capable" },
  ],
  traits: [
    { value: "frame_projection", label: "Tall & long frame projection" },
    { value: "arm_strength", label: "Explosive arm strength" },
    { value: "exit_velo", label: "Elite exit velocity & hand speed" },
    { value: "foot_speed", label: "Plus foot speed & agility" },
    { value: "compact_durable", label: "Compact, strong & durable build" },
    { value: "spin_profile", label: "Metrics & spin profile" },
  ],
  lean: [
    { value: "all_hs", label: "100% high school (develop from within)" },
    { value: "mostly_hs", label: "High school heavy (70%+ HS)" },
    { value: "balanced", label: "Balanced 50/50 mix" },
    { value: "mostly_transfer", label: "Transfer & JUCO heavy (70%+)" },
    { value: "portal_first", label: "Portal-first roster" },
  ],
  portal: [
    { value: "aggressive", label: "Aggressive / starting lineup builder" },
    { value: "targeted", label: "Targeted impact needs" },
    { value: "depth_only", label: "Depth & relief pieces only" },
    { value: "down_transfers", label: "Selective down-transfers" },
    { value: "minimal", label: "Minimal / does not use" },
  ],
  juco: [
    { value: "core_pipeline", label: "Annual core pipeline (4+ per class)" },
    { value: "targeted", label: "Targeted (2–3 per class)" },
    { value: "need_based", label: "Occasional / need-based" },
    { value: "academic_reset", label: "Academic reset / bounce-back only" },
    { value: "rarely", label: "Rarely / never" },
  ],
  timeline: [
    { value: "very_early", label: "Very early (sophomore / early junior)" },
    { value: "on_cycle", label: "Standard on-cycle (junior summer & fall)" },
    { value: "senior_fall", label: "Senior fall signing window" },
    { value: "late", label: "Late / senior spring & post-season" },
    { value: "rolling", label: "Rolling / year-round" },
  ],
  freshman: [
    { value: "open_competition", label: "Immediate open competition" },
    { value: "midweek_first", label: "Earn midweek / spot role first" },
    { value: "development_year", label: "Development & learn the culture" },
    { value: "redshirt_culture", label: "Heavy redshirting culture" },
    { value: "transfer_blocked", label: "Transfer blocked" },
  ],
  transferUse: [
    { value: "weekend_starters", label: "Immediate weekend starters" },
    { value: "bullpen_depth", label: "High-leverage bullpen & pitching depth" },
    { value: "defensive_anchors", label: "Up-the-middle defensive anchors" },
    { value: "bounce_backs", label: "D1 bounce-backs seeking reps" },
    { value: "attrition_fill", label: "Fill sudden roster attrition" },
  ],
  geography: [
    { value: "in_state", label: "In-state radius only" },
    { value: "regional", label: "Contiguous regional footprint" },
    { value: "southeast_sunbelt", label: "Southeast & Sun Belt pipeline" },
    { value: "midwest", label: "Midwest & Great Lakes footprint" },
    { value: "northeast", label: "Northeast & Mid-Atlantic footprint" },
    { value: "west", label: "West Coast & Pacific Northwest" },
    { value: "national", label: "True national footprint" },
    { value: "international", label: "International pipeline" },
  ],
  rosterBuild: [
    { value: "large_roster", label: "Large developmental roster (40+)" },
    { value: "disciplined_roster", label: "Disciplined roster (32–36)" },
    { value: "pitcher_heavy", label: "Pitcher-heavy staff (18+ arms)" },
    { value: "utility_depth", label: "Position depth & utility driven" },
    { value: "two_way_friendly", label: "Two-way friendly" },
  ],
  development: [
    { value: "tech_data", label: "Tech & data-driven" },
    { value: "pro_model", label: "Pro draft model" },
    { value: "traditional", label: "Traditional repetition & fundamentals" },
    { value: "strength_nutrition", label: "Physical transformation (strength & nutrition)" },
    { value: "mental_culture", label: "Mental performance & team culture" },
  ],
} as const;

export const INTEL_FIELDS: IntelFieldDef[] = [
  // ---- Recruiting: the conclusion families are paying for -----------------
  {
    key: "style_of_play",
    label: "Style of play",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.style],
  },
  {
    key: "recruiting_philosophy",
    label: "Recruiting philosophy",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.philosophy],
  },
  {
    key: "preferred_pitcher_profile",
    label: "Preferred pitcher profile",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.pitcher],
  },
  {
    key: "preferred_position_player_profile",
    label: "Preferred position player profile",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.positionPlayer],
  },
  {
    key: "physical_traits_valued",
    label: "Physical traits valued",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.traits],
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
    multi: true,
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
    multi: true,
    choices: [...CHOICES.timeline],
  },
  {
    key: "freshman_tendencies",
    label: "Freshman tendencies",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.freshman],
  },
  {
    key: "transfer_juco_tendencies",
    label: "Transfer & JUCO tendencies",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.transferUse],
  },
  {
    key: "geographic_tendencies",
    label: "Geographic tendencies",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.geography],
  },
  {
    key: "roster_construction_tendencies",
    label: "Roster construction tendencies",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.rosterBuild],
  },
  {
    key: "development_philosophy",
    label: "Development philosophy",
    group: "recruiting",
    kind: "choice",
    audience: "family",
    multi: true,
    choices: [...CHOICES.development],
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

/** Retired field keys still held on older records, so they keep a real name. */
export const LEGACY_FIELD_LABELS: Record<string, string> = {
  preferred_player_profile: "Preferred player profile",
};

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

/** How many fields a program can hold — the denominator in "6 / 22". */
export const INTEL_FIELD_COUNT = INTEL_FIELDS.length;

export function fieldLabel(key: string): string {
  return INTEL_FIELD_MAP[key]?.label ?? LEGACY_FIELD_LABELS[key] ?? key;
}

/** Split a stored answer into its values — one, or several. */
export function structuredValues(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The stored structured answer as human labels. */
export function structuredLabel(key: string, value: string | null | undefined): string | null {
  const values = structuredValues(value);
  if (values.length === 0) return null;
  const choices = INTEL_FIELD_MAP[key]?.choices ?? [];
  const labels = values.map((v) => choices.find((c) => c.value === v)?.label ?? v);
  return labels.join(" · ");
}
