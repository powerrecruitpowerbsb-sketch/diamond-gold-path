/**
 * Where a coaching-staff page usually lives when the stored address is dead.
 *
 * Just over a third of the coaching addresses on file answer with 404: school
 * sites are rebuilt, ".aspx" paths retire, and a sport's slug changes ("sb" to
 * "softball"). A dead address is not evidence the school hides its staff, so
 * when the stored page cannot be read we try the small set of addresses these
 * platforms actually use, on the school's OWN athletics host only.
 *
 * Two rules keep this honest:
 *  - candidates are built from the school's own athletics address, never from a
 *    guess about which school a host belongs to;
 *  - nothing here rewrites the stored address. It only offers pages to read, so
 *    a wrong guess costs a request and never corrupts a record.
 */

/** Sport slugs these platforms use, most common first. */
const SPORT_SLUGS: Record<string, string[]> = {
  baseball: ["baseball", "bsb", "mens-baseball", "baseball-m"],
  softball: ["softball", "sball", "womens-softball", "softball-w"],
};

/** Page names that hold a staff list, most common first. */
const PAGE_NAMES = ["coaches", "staff", "coaching-staff", "staff-directory"];

/** The athletics origin, or null when there is no usable address. */
export function athleticsOrigin(athleticWebsite: unknown): string | null {
  const value = typeof athleticWebsite === "string" ? athleticWebsite.trim() : "";
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

const same = (a: string, b: string) =>
  a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();

/**
 * Addresses worth trying for this program's staff list, in order.
 * `exclude` drops anything already attempted (normally the stored address).
 */
export function coachPathCandidates(
  athleticWebsite: unknown,
  sport: unknown,
  options: { exclude?: (string | null | undefined)[]; limit?: number } = {},
): string[] {
  const origin = athleticsOrigin(athleticWebsite);
  if (!origin) return [];

  const key = String(sport ?? "").trim().toLowerCase();
  const slugs = SPORT_SLUGS[key];
  // An unknown sport gets nothing: a staff page for the wrong sport is worse
  // than no page at all.
  if (!slugs) return [];

  const skip = (options.exclude ?? []).filter(Boolean).map(String);
  const limit = Math.max(1, Math.min(options.limit ?? 4, 12));

  const candidates: string[] = [];
  for (const page of PAGE_NAMES) {
    for (const slug of slugs) {
      const url = `${origin}/sports/${slug}/${page}`;
      if (skip.some((existing) => same(existing, url))) continue;
      if (candidates.some((existing) => same(existing, url))) continue;
      candidates.push(url);
      if (candidates.length >= limit) return candidates;
    }
  }
  return candidates;
}
