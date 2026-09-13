/**
 * Value states for the program profile.
 *
 * A blank tells a family nothing, and a zero where we simply do not know is a
 * lie. Every value on the profile therefore resolves to one of a few explicit
 * states, and each state has its own wording.
 */

export type FieldState =
  | { kind: "value"; text: string }
  | { kind: "not-published" }
  | { kind: "not-available" }
  | { kind: "not-reported" }
  | { kind: "open-admission" }
  | { kind: "blocked" };

export const NOT_PUBLISHED = "Not published by the school";
export const NOT_AVAILABLE = "Not available";
export const NOT_REPORTED = "Not reported";
export const OPEN_ADMISSION = "Open admission";
export const BLOCKED = "This school's site blocks automated reading";

export function stateLabel(state: FieldState): string {
  switch (state.kind) {
    case "value":
      return state.text;
    case "not-published":
      return NOT_PUBLISHED;
    case "not-available":
      return NOT_AVAILABLE;
    case "not-reported":
      return NOT_REPORTED;
    case "open-admission":
      return OPEN_ADMISSION;
    case "blocked":
      return BLOCKED;
  }
}

const empty = (value: unknown) => value === null || value === undefined || value === "";

/** A plain stored value, or "not published by the school". */
export function published(value: unknown, format?: (v: any) => string): FieldState {
  if (empty(value)) return { kind: "not-published" };
  return { kind: "value", text: format ? format(value) : String(value) };
}

/** A figure the institution reports; missing means the school did not report it. */
export function reported(value: unknown, format?: (v: any) => string): FieldState {
  if (empty(value)) return { kind: "not-reported" };
  return { kind: "value", text: format ? format(value) : String(value) };
}

export const money = (value: unknown) =>
  `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const pct = (value: unknown) => {
  const n = Number(value);
  return `${Math.round(n <= 1 ? n * 100 : n)}%`;
};

export const count = (value: unknown) => Number(value).toLocaleString("en-US");

/**
 * Admission selectivity. An open-admission school is not "missing" an
 * acceptance rate — it admits everyone, and that is the fact to show.
 */
export function admissionState(acceptanceRate: unknown): FieldState {
  if (empty(acceptanceRate)) return { kind: "not-reported" };
  const rate = Number(acceptanceRate);
  const share = rate <= 1 ? rate : rate / 100;
  if (share >= 0.995) return { kind: "open-admission" };
  return { kind: "value", text: pct(acceptanceRate) };
}

/**
 * Test scores. A test-optional school that publishes nothing is "not reported",
 * which is different from a school that has no testing programme at all.
 */
export function testScoreState(value: unknown): FieldState {
  if (empty(value)) return { kind: "not-reported" };
  return { kind: "value", text: String(value) };
}

/** There is no source for a school-wide average GPA. Permanently unavailable. */
export function gpaState(): FieldState {
  return { kind: "not-available" };
}

export function dateLabel(value: unknown): string | null {
  if (empty(value)) return null;
  return new Date(String(value)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function hostOf(url: unknown): string | null {
  if (empty(url)) return null;
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type LinkHealthRow = {
  field: string;
  url: string | null;
  link_status: string | null;
  last_failure_category: string | null;
  last_verified_ok_at: string | null;
};

/** Is the stored address for this field on a host that refuses automated reads? */
export function isBlocked(rows: LinkHealthRow[], field: string): boolean {
  return rows.some(
    (row) =>
      row.field === field &&
      (row.last_failure_category === "blocked_by_host" ||
        row.last_failure_category === "connection_blocked"),
  );
}
