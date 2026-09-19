/**
 * One definition of done, and a queue that fills itself from it.
 *
 * A team is finished when all five of these are true:
 *   1. sponsorship is confirmed (the school really plays this sport)
 *   2. we hold its roster page
 *   3. we hold its staff page
 *   4. we hold a roster for the current or previous season
 *   5. we hold a head coach with a recorded source page
 *
 * Everything else is unfinished work. The queue is built from those gaps rather
 * than from what happened in the past, so no team is worked twice and no team is
 * quietly skipped because a run once touched it.
 */

import { fetchAllRows } from "@/lib/paginate";
import { acceptableSeasonYears, currentSeasonYear } from "@/lib/season";
import { pageOwnership, registrableDomain, resolveSharedDomain } from "@/lib/program-ownership";
import { hostOf } from "@/lib/link-quality";

export type ProgramGap = {
  programId: string;
  universityId: string;
  schoolName: string | null;
  sport: string | null;
  needsLinks: boolean;
  needsRoster: boolean;
  needsCoach: boolean;
};

export type CompletionBoard = {
  seasonYear: number;
  sponsored: number;
  done: number;
  withRosterPage: number;
  withStaffPage: number;
  withCurrentRoster: number;
  withCoach: number;
  needsLinks: number;
  needsRoster: number;
  needsCoach: number;
  unverifiedSponsorship: number;
  queue: { pending: number; running: number; failed: number; blocked: number; exhausted: number };
  lastBeatAt: string | null;
  isRunning: boolean;
  lastMessage: string | null;
  stalled: boolean;
};

type ProgramRow = {
  id: string;
  university_id: string;
  sport: string | null;
  offering_status: string;
  roster_url: string | null;
  coaching_staff_url: string | null;
  athletic_website: string | null;
  head_coach_name: string | null;
  universities: { name: string | null; website_url: string | null; state: string | null } | null;
};

async function loadPrograms(supabase: any): Promise<ProgramRow[]> {
  return (await fetchAllRows<ProgramRow>((from, to) =>
    supabase
      .from("programs")
      .select(
        "id, university_id, sport, offering_status, roster_url, coaching_staff_url, athletic_website, head_coach_name, universities(name, website_url, state)",
      )
      .order("id", { ascending: true })
      .range(from, to),
  )) as ProgramRow[];
}

/* Roster and coach-source counting now happens in the database (see
 * public.completion_counts and public.program_gaps); reading those tables row by
 * row here was what timed the progress screens out. */


/**
 * Every unfinished sponsored team, with what it still needs.
 *
 * The counting happens in the database. Reading every program, every roster row
 * and every source row page by page took tens of thousands of rows per visit and
 * the database cancelled the query, so the progress screens failed to load.
 */
export async function programGaps(supabase: any): Promise<ProgramGap[]> {
  const { data, error } = await supabase.rpc("program_gaps", {
    _years: acceptableSeasonYears(),
    _limit: 20000,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    programId: row.program_id,
    universityId: row.university_id,
    schoolName: row.school_name ?? null,
    sport: row.sport ?? null,
    needsLinks: Boolean(row.needs_links),
    needsRoster: Boolean(row.needs_roster),
    needsCoach: Boolean(row.needs_coach),
  }));
}

/** The progress board: how close the database is to finished, plus queue health. */
export async function completionBoard(supabase: any): Promise<CompletionBoard> {
  const [counts, queueCounts, state] = await Promise.all([
    supabase.rpc("completion_counts", { _years: acceptableSeasonYears() }),
    supabase.rpc("collection_queue_counts"),
    supabase
      .from("collection_state")
      .select("is_running, last_beat_at, last_message")
      .eq("id", "singleton")
      .maybeSingle(),
  ]);
  if (counts.error) throw new Error(counts.error.message);
  if (queueCounts.error) throw new Error(queueCounts.error.message);

  const c = (Array.isArray(counts.data) ? counts.data[0] : counts.data) ?? {};
  const q = (Array.isArray(queueCounts.data) ? queueCounts.data[0] : queueCounts.data) ?? {};
  const num = (value: unknown) => Number(value ?? 0);

  const lastBeatAt = state.data?.last_beat_at ?? null;
  const quietMinutes = lastBeatAt ? (Date.now() - new Date(lastBeatAt).getTime()) / 60000 : Infinity;

  return {
    seasonYear: currentSeasonYear(),
    sponsored: num(c.sponsored),
    done: num(c.done),
    withRosterPage: num(c.with_roster_page),
    withStaffPage: num(c.with_staff_page),
    withCurrentRoster: num(c.with_current_roster),
    withCoach: num(c.with_coach),
    needsLinks: num(c.needs_links),
    needsRoster: num(c.needs_roster),
    needsCoach: num(c.needs_coach),
    unverifiedSponsorship: num(c.unverified_sponsorship),
    queue: {
      pending: num(q.pending),
      running: num(q.running),
      failed: num(q.failed),
      blocked: num(q.blocked),
      exhausted: num(q.exhausted),
    },
    lastBeatAt,
    isRunning: Boolean(state.data?.is_running),
    lastMessage: state.data?.last_message ?? null,
    stalled: Boolean(state.data?.is_running) && quietMinutes > 10,
  };
}

/**
 * Fill the queue from the gaps. Existing rows for the same team and stage are
 * reset to waiting instead of duplicated, so this is safe to run any time.
 */
export async function enqueueGapWork(
  supabase: any,
  options: { limit?: number } = {},
): Promise<{ discovery: number; scrape: number; remaining: number }> {
  const gaps = await programGaps(supabase);
  const limit = Math.max(options.limit ?? gaps.length, 0);
  const slice = gaps.slice(0, limit);

  const discovery = slice.filter((gap) => gap.needsLinks);
  const scrape = slice.filter((gap) => !gap.needsLinks && (gap.needsRoster || gap.needsCoach));

  const write = async (rows: ProgramGap[], stage: "url_discovery" | "program_scrape") => {
    for (let index = 0; index < rows.length; index += 300) {
      const chunk = rows.slice(index, index + 300).map((gap) => ({
        university_id: gap.universityId,
        program_id: gap.programId,
        stage,
        status: "pending",
        attempts: 0,
        leased_at: null,
        last_error: null,
      }));
      const { error } = await supabase
        .from("ingest_queue")
        .upsert(chunk, { onConflict: "program_id,stage" });
      if (error) throw new Error(error.message);
    }
  };

  await write(discovery, "url_discovery");
  await write(scrape, "program_scrape");

  return { discovery: discovery.length, scrape: scrape.length, remaining: gaps.length - slice.length };
}

export type OwnershipProblem = {
  programId: string;
  schoolName: string | null;
  sport: string | null;
  domain: string;
  keptBy: string | null;
  fields: string[];
};

export type OwnershipStandoff = {
  domain: string;
  schools: string[];
};

/**
 * Two schools can't share one athletics domain. Find the teams holding another
 * school's pages (College of Central Florida holding ucfknights.com) and, when
 * asked, clear those links and requeue the team for a fresh search.
 *
 * When neither school's name is anywhere in the address — mutigers.com,
 * gamecocksonline.com, duhawks.com — nothing here can tell them apart, so both
 * are reported as a standoff for a person and nothing is cleared. Guessing was
 * worse than doing nothing: the wrong school's own web address had already been
 * overwritten with the contested site, which made the impostor look like the
 * owner. That is why a school's own website is ignored when it IS the address
 * under dispute.
 */
export async function auditPageOwnership(
  supabase: any,
  options: { apply?: boolean } = {},
): Promise<{
  checked: number;
  problems: OwnershipProblem[];
  standoffs: OwnershipStandoff[];
  withheld: number;
  /** Archive run id every withholding is recorded under. */
  runId: string;
}> {
  const programs = await loadPrograms(supabase);

  type Claim = {
    schoolId: string;
    schoolName: string | null;
    verdict: ReturnType<typeof pageOwnership>;
  };
  const byDomain = new Map<string, Map<string, Claim>>();

  const domainsFor = (program: ProgramRow) =>
    [program.athletic_website, program.roster_url, program.coaching_staff_url]
      .filter(Boolean)
      .map((url) => registrableDomain(hostOf(url)))
      .filter(Boolean);

  for (const program of programs) {
    for (const domain of new Set(domainsFor(program))) {
      const claims = byDomain.get(domain) ?? new Map<string, Claim>();
      if (!claims.has(program.university_id)) {
        const schoolSite = program.universities?.website_url ?? null;
        // A school "website" that is the contested address itself proves nothing.
        const trustedSite =
          schoolSite && registrableDomain(hostOf(schoolSite)) === domain ? null : schoolSite;
        claims.set(program.university_id, {
          schoolId: program.university_id,
          schoolName: program.universities?.name ?? null,
          verdict: pageOwnership({
            url: `https://${domain}`,
            schoolName: program.universities?.name ?? null,
            schoolWebsite: trustedSite,
          }),
        });
      }
      byDomain.set(domain, claims);
    }
  }

  const losingSchools = new Map<string, { domain: string; keptBy: string | null }>();
  const standoffs: OwnershipStandoff[] = [];
  for (const [domain, claims] of byDomain) {
    if (claims.size < 2) continue;
    const { winner, losers } = resolveSharedDomain([...claims.values()]);
    if (!winner) {
      standoffs.push({
        domain,
        schools: [...claims.values()].map((claim) => claim.schoolName ?? "Unnamed school"),
      });
      continue;
    }
    for (const loser of losers) {
      losingSchools.set(`${loser.schoolId}:${domain}`, {
        domain,
        keptBy: winner.schoolName ?? null,
      });
    }
  }

  const problems: OwnershipProblem[] = [];
  const runId = crypto.randomUUID();
  const { withholdLink } = await import("@/lib/link-repair.server");
  let withheld = 0;

  for (const program of programs) {
    const fields: ("athletic_website" | "roster_url" | "coaching_staff_url")[] = [];
    let domain = "";
    let keptBy: string | null = null;

    for (const field of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
      const url = program[field];
      if (!url) continue;
      const linkDomain = registrableDomain(hostOf(url));
      const loss = losingSchools.get(`${program.university_id}:${linkDomain}`);
      if (!loss) continue;
      fields.push(field);
      domain = linkDomain;
      keptBy = loss.keptBy;
    }

    if (!fields.length) continue;
    problems.push({
      programId: program.id,
      schoolName: program.universities?.name ?? null,
      sport: program.sport,
      domain,
      keptBy,
      fields,
    });

    if (!options.apply) continue;

    // Withhold, never blank. The losing claim is logged and archived under a run
    // id; the address stays on the record so a wrong verdict costs nothing. The
    // school's own website is never touched here — that field comes from the
    // federal record and nothing in the athletics pipeline may write or clear it.
    for (const field of fields) {
      await withholdLink(supabase, {
        runId,
        programId: program.id,
        universityId: program.university_id,
        field,
        url: program[field]!,
        reason: keptBy
          ? `${domain} is held by ${keptBy}; this address is withheld pending review`
          : `${domain} is claimed by another school; this address is withheld pending review`,
      });
      withheld += 1;
    }
  }

  return { checked: programs.length, problems, standoffs, withheld, runId };
}
