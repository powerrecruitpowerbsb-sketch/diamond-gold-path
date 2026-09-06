/**
 * One vocabulary for "which season is this?".
 *
 * College seasons follow the school year, not the calendar: 2026-27 is a single
 * season even though schools update their pages at different times through the
 * year. We store one number per season — the school year's ENDING year, so
 * 2026-27 is stored as 2027 — and keep the page's own wording separately for
 * reference. Everything a person reads is rendered as "2026-27".
 */

/** The season we are currently recruiting for, as its ending year. */
export function currentSeasonYear(now: Date = new Date()): number {
  // A new school year starts in July, so from July 2026 the current season is 2026-27.
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** The current season and the one just finished — both are believable on a live page. */
export function acceptableSeasonYears(now: Date = new Date()): number[] {
  const current = currentSeasonYear(now);
  return [current, current - 1];
}

/** 2027 → "2026-27". */
export function seasonLabel(seasonYear: number | null | undefined): string {
  if (seasonYear === null || seasonYear === undefined) return "—";
  const year = Number(seasonYear);
  if (!Number.isFinite(year) || year <= 0) return "—";
  const start = Math.trunc(year) - 1;
  return `${start}-${String(Math.trunc(year)).slice(2)}`;
}

/** Is this the season we are actively recruiting for? */
export function isCurrentSeason(seasonYear: number | null | undefined, now: Date = new Date()): boolean {
  return Number(seasonYear) === currentSeasonYear(now);
}

/**
 * Turn whatever a roster page says into the canonical ending year.
 * "2026-27", "2026-2027", "2027" and "2026" all resolve to a single season, and
 * anything outside the live window (jersey numbers, stats, archive years) is
 * rejected as "not a season".
 */
export function canonicalSeasonYear(value: unknown, now: Date = new Date()): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // "2026-27" / "2026-2027" → the later year.
  const span = raw.match(/(20\d{2})\s*[-–/]\s*(\d{2,4})/);
  if (span) {
    const start = Number(span[1]);
    const tailRaw = span[2] ?? "";
    const tail = tailRaw.length === 2 ? Number(String(start).slice(0, 2) + tailRaw) : Number(tailRaw);
    return withinWindow(tail > start ? tail : start + 1, now);
  }

  const single = raw.match(/20\d{2}/);
  if (!single) return null;
  return withinWindow(Number(single[0]), now);
}

function withinWindow(year: number, now: Date): number | null {
  if (!Number.isFinite(year)) return null;
  const current = currentSeasonYear(now);
  // One season back and one forward: a page published early can legitimately
  // name next season, but a 2019 archive page cannot be current.
  if (year < current - 2 || year > current + 1) return null;
  return Math.trunc(year);
}
