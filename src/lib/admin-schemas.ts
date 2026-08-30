/** Client-safe field metadata + option lists shared by every admin form. */

export const SPORTS = ["baseball", "softball"] as const;
export const GOVERNING_BODIES = ["NCAA", "NAIA", "NJCAA", "CCCAA", "NWAC"] as const;
export const PUBLIC_PRIVATE = ["public", "private"] as const;
export const CAMPUS_SETTINGS = ["urban", "suburban", "rural"] as const;
export const SCHOOL_SIZE_BUCKETS = ["small", "medium", "large"] as const;
export const SOURCE_TYPES = ["official", "aggregator", "manual"] as const;

export const ACADEMIC_BUCKETS = ["Academic+", "Academic", "Standard Admission"] as const;

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
] as const;

export type FieldKind = "text" | "textarea" | "number" | "money" | "percent" | "select" | "boolean" | "url";

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  hint?: string;
  /** Fields worth citing a source for. */
  sourced?: boolean;
  step?: string;
};

export type SectionDef = { title: string; blurb?: string; fields: FieldDef[] };

export const UNIVERSITY_SECTIONS: SectionDef[] = [
  {
    title: "School Profile",
    blurb: "Identity and character of the institution.",
    fields: [
      { name: "name", label: "School name", kind: "text" },
      { name: "public_private", label: "Public / private", kind: "select", options: PUBLIC_PRIVATE },
      { name: "undergrad_enrollment", label: "Undergrad enrollment", kind: "number", sourced: true },
      { name: "school_size_bucket", label: "Size bucket", kind: "select", options: SCHOOL_SIZE_BUCKETS },
      { name: "campus_setting", label: "Campus setting", kind: "select", options: CAMPUS_SETTINGS },
      { name: "religious_affiliation", label: "Religiously affiliated", kind: "boolean" },
      { name: "religious_tradition", label: "Religious tradition", kind: "text" },
      { name: "website_url", label: "Website", kind: "url" },
      { name: "admissions_url", label: "Admissions page", kind: "url" },
    ],
  },
  {
    title: "Academics & Admissions",
    blurb: "Admissions profile used for academic bucketing.",
    fields: [
      { name: "avg_gpa", label: "Average GPA", kind: "number", step: "0.01", sourced: true },
      { name: "avg_sat", label: "Average SAT", kind: "number", sourced: true },
      { name: "avg_act", label: "Average ACT", kind: "number", sourced: true },
      { name: "acceptance_rate", label: "Acceptance rate (%)", kind: "percent", sourced: true },
      { name: "test_optional", label: "Test optional", kind: "boolean" },
      { name: "graduation_rate", label: "Graduation rate (%)", kind: "percent", sourced: true },
      { name: "student_faculty_ratio", label: "Student:faculty ratio", kind: "text", hint: "e.g. 12:1" },
    ],
  },
  {
    title: "Tuition & Cost",
    blurb: "Every cost figure should carry a source.",
    fields: [
      { name: "tuition_in_state", label: "Tuition (in state)", kind: "money", sourced: true },
      { name: "tuition_out_state", label: "Tuition (out of state)", kind: "money", sourced: true },
      { name: "room_board", label: "Room & board", kind: "money", sourced: true },
      { name: "est_cost_of_attendance", label: "Est. cost of attendance", kind: "money", sourced: true },
      { name: "est_net_price", label: "Est. net price", kind: "money", sourced: true },
      { name: "tuition_source_url", label: "Tuition source URL", kind: "url" },
      { name: "financial_aid_url", label: "Financial aid page", kind: "url" },
    ],
  },
  {
    title: "Location & Travel",
    blurb: "Where the school sits and how families get there.",
    fields: [
      { name: "city", label: "City", kind: "text" },
      { name: "state", label: "State", kind: "select", options: US_STATES },
      { name: "region", label: "Region", kind: "text" },
      { name: "address", label: "Address", kind: "text" },
      { name: "nearest_airport", label: "Nearest airport", kind: "text" },
      { name: "distance_to_airport_miles", label: "Miles to airport", kind: "number", step: "0.1" },
    ],
  },
];

export const PROGRAM_SECTIONS: SectionDef[] = [
  {
    title: "Program Identity",
    fields: [
      {
        name: "offering_status",
        label: "Sport offered?",
        kind: "select",
        options: ["unverified", "verified", "not_offered"],
        hint: "Verified = the school sponsors this sport. Not offered = confirmed it doesn't.",
      },
      { name: "governing_body", label: "Governing body", kind: "select", options: GOVERNING_BODIES },
      { name: "division", label: "Division", kind: "text", hint: "e.g. D1, D2, D3, NAIA" },
      { name: "conference", label: "Conference", kind: "text" },
    ],
  },
  {
    title: "Coaching Staff",
    fields: [
      { name: "head_coach_name", label: "Head coach", kind: "text" },
      { name: "recruiting_coordinator_name", label: "Recruiting coordinator", kind: "text" },
      { name: "coaching_staff_url", label: "Coaching staff page", kind: "url" },
      { name: "athletic_website", label: "Athletics site", kind: "url" },
      { name: "roster_url", label: "Roster page", kind: "url" },
      { name: "facility_url", label: "Facility page", kind: "url" },
    ],
  },
  {
    title: "Scholarships",
    fields: [
      { name: "scholarships_available", label: "Scholarships available", kind: "boolean" },
      { name: "scholarship_details", label: "Scholarship details", kind: "textarea" },
    ],
  },
];

export const UNIVERSITY_FIELD_NAMES = UNIVERSITY_SECTIONS.flatMap((s) => s.fields.map((f) => f.name));
export const PROGRAM_FIELD_NAMES = PROGRAM_SECTIONS.flatMap((s) => s.fields.map((f) => f.name));
export const SOURCED_UNIVERSITY_FIELDS = UNIVERSITY_SECTIONS.flatMap((s) =>
  s.fields.filter((f) => f.sourced).map((f) => f.name),
);

export const NUMERIC_UNIVERSITY_FIELDS = UNIVERSITY_SECTIONS.flatMap((s) =>
  s.fields.filter((f) => f.kind === "number" || f.kind === "money" || f.kind === "percent").map((f) => f.name),
);
export const BOOLEAN_UNIVERSITY_FIELDS = UNIVERSITY_SECTIONS.flatMap((s) =>
  s.fields.filter((f) => f.kind === "boolean").map((f) => f.name),
);

export type SourceEntry = {
  source_url: string;
  source_type: (typeof SOURCE_TYPES)[number];
  last_verified_at: string;
};

export const CLASSIFICATION_FIELDS = [
  {
    type: "academic_bucket" as const,
    label: "Academic bucket",
    options: ACADEMIC_BUCKETS,
    requiresEvidence: false,
  },
  {
    type: "campus_culture" as const,
    label: "Campus culture",
    options: null,
    requiresEvidence: true,
  },
  {
    type: "school_size" as const,
    label: "School size",
    options: SCHOOL_SIZE_BUCKETS,
    requiresEvidence: false,
  },
  {
    type: "campus_setting" as const,
    label: "Campus setting",
    options: CAMPUS_SETTINGS,
    requiresEvidence: false,
  },
];

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
