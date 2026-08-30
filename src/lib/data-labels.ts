/**
 * One place that turns internal table/field/enum names into language a person
 * can read. Nothing client-facing should ever print a raw table or column name.
 */

import { PROGRAM_SECTIONS, UNIVERSITY_SECTIONS } from "@/lib/admin-schemas";

const SCHEMA_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...UNIVERSITY_SECTIONS, ...PROGRAM_SECTIONS].flatMap((section) =>
    section.fields.map((field) => [field.name, field.label] as const),
  ),
);

const EXTRA_FIELD_LABELS: Record<string, string> = {
  university_id: "School",
  sport: "Sport",
  last_verified_at: "Last verified",
  last_roster_pull_at: "Last roster pull",
  season_year: "Season",
  players: "Players",
};

/** "Campus setting", "Student:faculty ratio" — never "campus_setting". */
export function dataFieldLabel(field: string): string {
  return (
    SCHEMA_FIELD_LABELS[field] ??
    EXTRA_FIELD_LABELS[field] ??
    field
      .replace(/_/g, " ")
      .replace(/\burl\b/gi, "URL")
      .replace(/^./, (c) => c.toUpperCase())
  );
}

const RECORD_KIND_LABELS: Record<string, string> = {
  universities: "School details",
  programs: "Program details",
  roster_players: "Roster",
};

/** "School details", "Roster" — never "roster_players". */
export function recordKindLabel(table: string): string {
  return RECORD_KIND_LABELS[table] ?? dataFieldLabel(table);
}

const VALUE_LABELS: Record<string, string> = {
  urban: "Urban",
  suburban: "Suburban",
  rural: "Rural",
  public: "Public",
  private: "Private",
  official: "Official source",
  aggregator: "Third-party source",
  manual: "Entered by staff",
};

export function dataValueLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const text = String(value);
  return VALUE_LABELS[text] ?? text;
}

export function sourceTypeLabel(sourceType: string): string {
  return VALUE_LABELS[sourceType] ?? sourceType;
}
