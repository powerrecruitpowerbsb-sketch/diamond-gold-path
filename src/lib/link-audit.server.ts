/**
 * Check every stored roster and staff page against the page itself.
 *
 * A hand audit of 536 stored links found 40+ programs holding a look-alike
 * school's pages — Florida State with Florida State College at Jacksonville,
 * Portland State with Penn State, Chaminade University with a New York high
 * school's JV team. No address test can catch that, because athletics sites use
 * mascot domains. So we fetch each page once and read the school name off it.
 *
 * Wrong-school and non-varsity pages are cleared, remembered as declined, and
 * the program is sent back to search inside its correct athletics domain. Nobody
 * is asked to approve any of that: the page either proves whose team it is or it
 * doesn't. Only pages that name nobody recognisable are listed for a person.
 */

import { scrape } from "@/lib/ingest.server";
import { clearWrongLink, type LinkField } from "@/lib/link-repair.server";
import { verifyPageIdentity, type IdentityVerdict } from "@/lib/page-identity";

export { clearWrongLink };
export type { LinkField };

export type AuditRow = {
  key: string;
  programId: string;
  school: string;
  sport: string;
  field: LinkField;
  url: string;
  verdict: IdentityVerdict | "failed";
  reason: string;
  cleared: boolean;
};

export type AuditResult = {
  applied: boolean;
  checked: number;
  confirmed: number;
  cleared: number;
  unclear: number;
  failed: number;
  rows: AuditRow[];
  /** Pass this back to carry on where this pass stopped. */
  nextCursor: string | null;
  moreWaiting: boolean;
};

type ProgramRow = {
  id: string;
  university_id: string;
  sport: string;
  athletic_website: string | null;
  roster_url: string | null;
  coaching_staff_url: string | null;
  universities: { name: string | null; website_url: string | null } | null;
};

/**
 * Walk stored links in a stable order, a bounded slice at a time, so the sweep
 * can cover the whole database across repeated passes.
 */
export async function auditStoredLinks(
  supabase: any,
  options: {
    apply: boolean;
    limit?: number;
    budgetMs?: number;
    /** Program id the previous pass stopped after. */
    cursor?: string | null;
    actorId?: string | null;
  },
): Promise<AuditResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 200);
  const budgetMs = options.budgetMs ?? 25_000;
  const startedAt = Date.now();

  let query = supabase
    .from("programs")
    .select(
      "id, university_id, sport, athletic_website, roster_url, coaching_staff_url, universities(name, website_url)",
    )
    .eq("offering_status", "verified")
    .or("roster_url.not.is.null,coaching_staff_url.not.is.null")
    .order("id", { ascending: true })
    .limit(limit);
  if (options.cursor) query = query.gt("id", options.cursor);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const programs = (data ?? []) as ProgramRow[];

  const result: AuditResult = {
    applied: options.apply,
    checked: 0,
    confirmed: 0,
    cleared: 0,
    unclear: 0,
    failed: 0,
    rows: [],
    nextCursor: options.cursor ?? null,
    moreWaiting: programs.length === limit,
  };

  // One fetch per page, cached within the pass so two programs sharing a staff
  // page (a combined baseball/softball directory) are not fetched twice.
  const pages = new Map<string, string | Error>();
  const read = async (url: string) => {
    if (!pages.has(url)) {
      try {
        pages.set(url, await scrape(url));
      } catch (failure) {
        pages.set(url, failure as Error);
      }
    }
    return pages.get(url)!;
  };

  // Fetch pages side by side, a group of programs at a time, so a batch is not
  // spent waiting on one slow site. Verdict rules below are unchanged.
  const groups: ProgramRow[][] = [];
  for (let i = 0; i < programs.length; i += 10) groups.push(programs.slice(i, i + 10));

  for (const group of groups) {
    if (Date.now() - startedAt > budgetMs) {
      result.moreWaiting = true;
      break;
    }
    await Promise.all(
      group.flatMap((program) =>
        (["roster_url", "coaching_staff_url"] as LinkField[])
          .map((field) => (program[field] ?? "").trim())
          .filter(Boolean)
          .map((url) => read(url)),
      ),
    );

    for (const program of group) {
    result.nextCursor = program.id;
    const school = program.universities?.name ?? "Unknown school";

    for (const field of ["roster_url", "coaching_staff_url"] as LinkField[]) {
      const url = (program[field] ?? "").trim();
      if (!url) continue;

      const base = { key: `${program.id}:${field}`, programId: program.id, school, sport: program.sport, field, url };
      const page = await read(url);
      if (page instanceof Error) {
        result.failed += 1;
        result.rows.push({ ...base, verdict: "failed", reason: page.message, cleared: false });
        continue;
      }

      result.checked += 1;
      const identity = verifyPageIdentity({
        text: page,
        url,
        schoolName: school,
        schoolWebsite: program.universities?.website_url ?? null,
        athleticsSite: program.athletic_website,
      });

      if (identity.verdict === "confirmed") {
        result.confirmed += 1;
        result.rows.push({ ...base, verdict: identity.verdict, reason: identity.reason, cleared: false });
        continue;
      }

      if (identity.verdict === "unclear") {
        result.unclear += 1;
        result.rows.push({ ...base, verdict: identity.verdict, reason: identity.reason, cleared: false });
        continue;
      }

      result.cleared += 1;
      if (options.apply) {
        await clearWrongLink(supabase, {
          programId: program.id,
          universityId: program.university_id,
          field,
          url,
          reason: identity.reason,
          actorId: options.actorId ?? null,
        });
      }
      result.rows.push({
        ...base,
        verdict: identity.verdict,
        reason: identity.reason,
        cleared: options.apply,
      });
    }
  }

  return result;
}
