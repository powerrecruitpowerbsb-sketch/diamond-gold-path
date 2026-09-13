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

import { scrapePage } from "@/lib/ingest.server";
import { clearWrongLink, type LinkField } from "@/lib/link-repair.server";
import { verifyPageIdentity, type IdentityVerdict } from "@/lib/page-identity";
import type { FailureCategory, FetchMethod, SafeFetchResult } from "@/lib/safe-fetch.server";

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
  failureCategory?: FailureCategory | null;
  fetchMethod?: FetchMethod | null;
};

export type AuditResult = {
  applied: boolean;
  checked: number;
  confirmed: number;
  cleared: number;
  unclear: number;
  /** Pages skipped or refused because the site blocks automated reading. */
  blocked: number;
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

/** En dashes, em dashes and stray spacing all become one plain hyphen. */
export function normalizeSchoolName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Turn a list of school names into ids, matching with dashes normalised first. */
export async function schoolIdsForNames(supabase: any, names: string[]): Promise<{ ids: string[]; missing: string[] }> {
  const wanted = new Map<string, string>();
  for (const name of names) wanted.set(normalizeSchoolName(name), name);

  const ids: string[] = [];
  const found = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("universities")
      .select("id, name")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; name: string | null }[];
    for (const row of rows) {
      const key = normalizeSchoolName(row.name ?? "");
      if (wanted.has(key) && !found.has(key)) {
        found.add(key);
        ids.push(row.id);
      }
    }
    if (rows.length < pageSize) break;
  }

  const missing = [...wanted.entries()].filter(([key]) => !found.has(key)).map(([, original]) => original);
  return { ids, missing };
}

export type AuditOptions = {
  apply: boolean;
  /** Required target. There is no default that means "the whole database". */
  schoolIds?: string[] | null;
  schoolNames?: string[] | null;
  /** Only re-read pages currently sitting in the couldn't-be-read log. */
  onlyPreviouslyFailed?: boolean;
  limit?: number;
  budgetMs?: number;
  /** Program id the previous pass stopped after. */
  cursor?: string | null;
  actorId?: string | null;
  /** Check exactly these pages and nothing else. Used by the resumable sweep. */
  targets?: { programId: string; field: LinkField }[] | null;
};

/**
 * Walk stored links for an explicitly named set of schools, a bounded slice at a
 * time. A missing or empty target throws before any network call — a run that
 * covers everything by accident is exactly what we are guarding against.
 */
export async function auditStoredLinks(supabase: any, options: AuditOptions): Promise<AuditResult> {
  let schoolIds = (options.schoolIds ?? []).filter(Boolean);
  if (!schoolIds.length && options.schoolNames?.length) {
    const resolved = await schoolIdsForNames(supabase, options.schoolNames);
    schoolIds = resolved.ids;
  }
  if (!schoolIds.length) {
    throw new Error(
      "The page check needs a list of schools to look at. There is no setting that means every school.",
    );
  }

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 200);
  const budgetMs = options.budgetMs ?? 25_000;
  const startedAt = Date.now();

  // When re-reading only past failures, the target narrows to the exact pages in
  // the couldn't-be-read log rather than everything those schools hold.
  let failedOnly: Set<string> | null = null;
  if (options.onlyPreviouslyFailed) {
    failedOnly = new Set<string>();
    const { data, error } = await supabase
      .from("unreadable_pages")
      .select("program_id, field")
      .is("resolved_at", null)
      .in("university_id", schoolIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { program_id: string; field: string }[]) {
      failedOnly.add(`${row.program_id}:${row.field}`);
    }
  }

  // An explicit target list wins over everything else: the resumable sweep hands
  // over the exact pages it still owes, host by host.
  if (options.targets?.length) {
    failedOnly = new Set(options.targets.map((target) => `${target.programId}:${target.field}`));
  }

  let query = supabase
    .from("programs")
    .select(
      "id, university_id, sport, athletic_website, roster_url, coaching_staff_url, universities(name, website_url)",
    )
    .in("university_id", schoolIds)
    .eq("offering_status", "verified")
    .or("roster_url.not.is.null,coaching_staff_url.not.is.null")
    .order("id", { ascending: true })
    .limit(limit);
  if (options.targets?.length) {
    query = query.in("id", [...new Set(options.targets.map((target) => target.programId))]);
  }
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
    blocked: 0,
    failed: 0,
    rows: [],
    nextCursor: options.cursor ?? null,
    moreWaiting: programs.length === limit,
  };

  // One read per page, cached within the pass so two programs sharing a staff
  // page (a combined baseball/softball directory) are not read twice. Pacing,
  // retries and the rendering fallback all live in safeFetch, so nothing here
  // fires two requests at one host — that is what caused the false timeouts.
  const pages = new Map<string, SafeFetchResult>();
  const read = async (url: string) => {
    const cached = pages.get(url);
    if (cached) return cached;
    const fetched = await scrapePage(url);
    pages.set(url, fetched);
    return fetched;
  };

  /** One running health record per program and page, updated in place. */
  const recordHealth = async (
    program: ProgramRow,
    field: LinkField,
    url: string,
    page: SafeFetchResult,
  ) => {
    if (!options.apply) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("link_health")
      .select("id, consecutive_failures, failure_dates, not_found_runs")
      .eq("program_id", program.id)
      .eq("field", field)
      .maybeSingle();
    const previous = existing as
      | { id: string; consecutive_failures: number; failure_dates: string[] | null; not_found_runs: number }
      | null;

    if (page.ok) {
      await supabase.from("link_health").upsert(
        {
          program_id: program.id,
          field,
          url,
          link_status: "verified",
          last_verified_ok_at: new Date().toISOString(),
          fetch_method: page.fetch_method,
          consecutive_failures: 0,
          failure_dates: [],
          not_found_runs: 0,
          last_failure_category: null,
          last_error: null,
        },
        { onConflict: "program_id,field" },
      );
      return;
    }

    // A page on a site that refuses machines is recorded as exactly that, and
    // nothing else moves: no failure tally, no status change, no address touched.
    // It is not the link's fault and must never look like a bad link.
    if (page.failure_category === "blocked_by_host") {
      await supabase.from("link_health").upsert(
        {
          program_id: program.id,
          field,
          url,
          last_failure_category: "blocked_by_host",
          last_error: (page.error ?? "").slice(0, 500),
        },
        { onConflict: "program_id,field" },
      );
      return;
    }

    const days = new Set(previous?.failure_dates ?? []);
    days.add(today);
    const notFound = page.failure_category === "not_found";
    const notFoundRuns = (previous?.not_found_runs ?? 0) + (notFound ? 1 : 0);
    const failures = (previous?.consecutive_failures ?? 0) + 1;

    // A slow or blocked site never demotes a good link: only a missing page, or
    // failures on three separate days, changes the status.
    let status: "verified" | "unverified" | "dead" | null = null;
    if (notFoundRuns >= 2) status = "dead";
    else if (notFound || days.size >= 3) status = "unverified";

    await supabase.from("link_health").upsert(
      {
        program_id: program.id,
        field,
        url,
        ...(status ? { link_status: status } : {}),
        consecutive_failures: failures,
        failure_dates: [...days].sort(),
        not_found_runs: notFoundRuns,
        last_failure_category: page.failure_category,
        last_error: (page.error ?? "").slice(0, 500),
      },
      { onConflict: "program_id,field" },
    );
  };

  /**
   * A page that can't be opened used to be counted and forgotten, so nobody
   * could see which ones they were. Every failure is written down now, with the
   * reason it failed, and a page that opens on a later pass is marked resolved.
   */
  const recordUnreadable = async (
    program: ProgramRow,
    field: LinkField,
    url: string,
    error: string,
    category: FailureCategory | null,
  ) => {
    if (!options.apply) return;
    const now = new Date().toISOString();
    const existing = await supabase
      .from("unreadable_pages")
      .select("id, attempts")
      .eq("program_id", program.id)
      .eq("field", field)
      .eq("url", url)
      .maybeSingle();
    if (existing.data?.id) {
      await supabase
        .from("unreadable_pages")
        .update({
          error: error.slice(0, 500),
          failure_category: category,
          attempts: (existing.data.attempts ?? 1) + 1,
          last_seen_at: now,
          resolved_at: null,
        })
        .eq("id", existing.data.id);
      return;
    }
    await supabase.from("unreadable_pages").insert({
      program_id: program.id,
      university_id: program.university_id,
      field,
      url,
      error: error.slice(0, 500),
      failure_category: category,
      first_seen_at: now,
      last_seen_at: now,
    });
  };

  const clearUnreadable = async (program: ProgramRow, field: LinkField, url: string) => {
    if (!options.apply) return;
    await supabase
      .from("unreadable_pages")
      .update({ resolved_at: new Date().toISOString() })
      .eq("program_id", program.id)
      .eq("field", field)
      .eq("url", url)
      .is("resolved_at", null);
  };

  // Start every page in the slice at once. safeFetch keeps one request at a time
  // per website with a pause between them, so this is fast across DIFFERENT
  // sites without ever double-hitting the same one.
  const wanted = programs.flatMap((program) =>
    (["roster_url", "coaching_staff_url"] as LinkField[])
      .filter((field) => !failedOnly || failedOnly.has(`${program.id}:${field}`))
      .map((field) => (program[field] ?? "").trim())
      .filter(Boolean),
  );
  await Promise.allSettled([...new Set(wanted)].map((url) => read(url)));

  for (const program of programs) {
    if (Date.now() - startedAt > budgetMs) {
      result.moreWaiting = true;
      break;
    }
    result.nextCursor = program.id;
    const school = program.universities?.name ?? "Unknown school";

    for (const field of ["roster_url", "coaching_staff_url"] as LinkField[]) {
      const url = (program[field] ?? "").trim();
      if (!url) continue;
      if (failedOnly && !failedOnly.has(`${program.id}:${field}`)) continue;

      const base = { key: `${program.id}:${field}`, programId: program.id, school, sport: program.sport, field, url };
      const page = await read(url);
      await recordHealth(program, field, url, page);

      if (!page.ok || !page.markdown) {
        const reason = page.error ?? "the page could not be read";
        const blocked = page.failure_category === "blocked_by_host";
        if (blocked) result.blocked += 1;
        else result.failed += 1;
        // Blocked-by-the-site is not "unreadable": it says nothing about the page
        // and belongs in its own state, so it stays out of that log.
        if (!blocked) await recordUnreadable(program, field, url, reason, page.failure_category);
        result.rows.push({
          ...base,
          verdict: "failed",
          reason,
          cleared: false,
          failureCategory: page.failure_category,
          fetchMethod: null,
        });
        continue;
      }

      result.checked += 1;
      await clearUnreadable(program, field, url);
      const identity = verifyPageIdentity({
        text: page.markdown,
        url,
        schoolName: school,
        schoolWebsite: program.universities?.website_url ?? null,
        athleticsSite: program.athletic_website,
        ownDomains: [program.roster_url ?? null, program.coaching_staff_url ?? null],
      });


      if (identity.verdict === "confirmed") {
        result.confirmed += 1;
        result.rows.push({
          ...base,
          verdict: identity.verdict,
          reason: identity.reason,
          cleared: false,
          fetchMethod: page.fetch_method,
        });
        continue;
      }

      if (identity.verdict === "unclear") {
        result.unclear += 1;
        result.rows.push({
          ...base,
          verdict: identity.verdict,
          reason: identity.reason,
          cleared: false,
          fetchMethod: page.fetch_method,
        });
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
        fetchMethod: page.fetch_method,
      });
    }
  }

  return result;
}
