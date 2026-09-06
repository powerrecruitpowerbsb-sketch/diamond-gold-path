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

/** Programs holding a current-or-previous-season roster. */
async function programsWithCurrentRoster(supabase: any): Promise<Set<string>> {
  const years = acceptableSeasonYears();
  const rows = await fetchAllRows<{ program_id: string }>(
    (from, to) =>
      supabase
        .from("roster_players")
        .select("program_id")
        .in("season_year", years)
        .order("program_id", { ascending: true })
        .range(from, to),
    120000,
  );
  return new Set(rows.map((row) => row.program_id));
}

/** Programs whose coach name has a recorded source page. */
async function programsWithSourcedCoach(supabase: any): Promise<Set<string>> {
  const rows = await fetchAllRows<{ record_id: string }>((from, to) =>
    supabase
      .from("data_field_sources")
      .select("record_id")
      .eq("table_name", "programs")
      .eq("field_name", "head_coach_name")
      .order("record_id", { ascending: true })
      .range(from, to),
  );
  return new Set(rows.map((row) => row.record_id));
}

/** Every unfinished sponsored team, with what it still needs. */
export async function programGaps(supabase: any): Promise<ProgramGap[]> {
  const [programs, rostered, sourced] = await Promise.all([
    loadPrograms(supabase),
    programsWithCurrentRoster(supabase),
    programsWithSourcedCoach(supabase),
  ]);

  const gaps: ProgramGap[] = [];
  for (const program of programs) {
    if (program.offering_status !== "verified") continue;
    const needsLinks = !program.roster_url || !program.coaching_staff_url;
    const needsRoster = !rostered.has(program.id);
    const needsCoach = !program.head_coach_name || !sourced.has(program.id);
    if (!needsLinks && !needsRoster && !needsCoach) continue;
    gaps.push({
      programId: program.id,
      universityId: program.university_id,
      schoolName: program.universities?.name ?? null,
      sport: program.sport,
      needsLinks,
      needsRoster,
      needsCoach,
    });
  }
  return gaps;
}

/** The progress board: how close the database is to finished, plus queue health. */
export async function completionBoard(supabase: any): Promise<CompletionBoard> {
  const [programs, rostered, sourced] = await Promise.all([
    loadPrograms(supabase),
    programsWithCurrentRoster(supabase),
    programsWithSourcedCoach(supabase),
  ]);

  const sponsored = programs.filter((row) => row.offering_status === "verified");
  const board = {
    seasonYear: currentSeasonYear(),
    sponsored: sponsored.length,
    done: 0,
    withRosterPage: 0,
    withStaffPage: 0,
    withCurrentRoster: 0,
    withCoach: 0,
    needsLinks: 0,
    needsRoster: 0,
    needsCoach: 0,
    unverifiedSponsorship: programs.filter((row) => row.offering_status === "unverified").length,
  };

  for (const program of sponsored) {
    const hasRosterPage = Boolean(program.roster_url);
    const hasStaffPage = Boolean(program.coaching_staff_url);
    const hasRoster = rostered.has(program.id);
    const hasCoach = Boolean(program.head_coach_name) && sourced.has(program.id);
    if (hasRosterPage) board.withRosterPage += 1;
    if (hasStaffPage) board.withStaffPage += 1;
    if (hasRoster) board.withCurrentRoster += 1;
    if (hasCoach) board.withCoach += 1;
    if (!hasRosterPage || !hasStaffPage) board.needsLinks += 1;
    if (!hasRoster) board.needsRoster += 1;
    if (!hasCoach) board.needsCoach += 1;
    if (hasRosterPage && hasStaffPage && hasRoster && hasCoach) board.done += 1;
  }

  const queueRows = await fetchAllRows<{ status: string; attempts: number }>((from, to) =>
    supabase
      .from("ingest_queue")
      .select("status, attempts")
      .in("stage", ["url_discovery", "program_scrape"])
      .neq("status", "done")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const queue = { pending: 0, running: 0, failed: 0, blocked: 0, exhausted: 0 };
  for (const row of queueRows) {
    if ((row.attempts ?? 0) >= 3 && row.status !== "running") {
      queue.exhausted += 1;
      continue;
    }
    if (row.status in queue) (queue as any)[row.status] += 1;
  }

  const { data: state } = await supabase
    .from("collection_state")
    .select("is_running, last_beat_at, last_message")
    .eq("id", "singleton")
    .maybeSingle();

  const lastBeatAt = state?.last_beat_at ?? null;
  const quietMinutes = lastBeatAt ? (Date.now() - new Date(lastBeatAt).getTime()) / 60000 : Infinity;

  return {
    ...board,
    queue,
    lastBeatAt,
    isRunning: Boolean(state?.is_running),
    lastMessage: state?.last_message ?? null,
    stalled: Boolean(state?.is_running) && quietMinutes > 10,
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

/**
 * Two schools can't share one athletics domain. Find the teams holding another
 * school's pages (College of Central Florida holding ucfknights.com) and, when
 * asked, clear those links and requeue the team for a fresh search.
 */
export async function auditPageOwnership(
  supabase: any,
  options: { apply?: boolean } = {},
): Promise<{ checked: number; problems: OwnershipProblem[]; cleared: number }> {
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
        claims.set(program.university_id, {
          schoolId: program.university_id,
          schoolName: program.universities?.name ?? null,
          verdict: pageOwnership({
            url: `https://${domain}`,
            schoolName: program.universities?.name ?? null,
            schoolWebsite: program.universities?.website_url ?? null,
          }),
        });
      }
      byDomain.set(domain, claims);
    }
  }

  const losingSchools = new Map<string, { domain: string; keptBy: string | null }>();
  for (const [domain, claims] of byDomain) {
    if (claims.size < 2) continue;
    const { winner, losers } = resolveSharedDomain([...claims.values()]);
    for (const loser of losers) {
      losingSchools.set(`${loser.schoolId}:${domain}`, {
        domain,
        keptBy: winner?.schoolName ?? null,
      });
    }
  }

  const problems: OwnershipProblem[] = [];
  let cleared = 0;

  for (const program of programs) {
    const fields: string[] = [];
    const patch: Record<string, null> = {};
    let domain = "";
    let keptBy: string | null = null;

    for (const field of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
      const url = program[field];
      if (!url) continue;
      const linkDomain = registrableDomain(hostOf(url));
      const loss = losingSchools.get(`${program.university_id}:${linkDomain}`);
      if (!loss) continue;
      fields.push(field);
      patch[field] = null;
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
    const { error } = await supabase.from("programs").update(patch).eq("id", program.id);
    if (error) throw new Error(error.message);
    cleared += fields.length;

    // The school's own web address was sometimes overwritten with the other
    // school's athletics domain too (Cincinnati State pointing at gobearcats.com).
    // Clear that as well, or the next search inherits the same wrong site.
    const schoolSite = program.universities?.website_url ?? null;
    if (schoolSite && registrableDomain(hostOf(schoolSite)) === domain) {
      const { error: schoolError } = await supabase
        .from("universities")
        .update({ website_url: null })
        .eq("id", program.university_id);
      if (schoolError) throw new Error(schoolError.message);
      cleared += 1;
    }

    await supabase.from("ingest_queue").upsert(
      {
        university_id: program.university_id,
        program_id: program.id,
        stage: "url_discovery",
        status: "pending",
        attempts: 0,
        leased_at: null,
        last_error: null,
      },
      { onConflict: "program_id,stage" },
    );
  }

  return { checked: programs.length, problems, cleared };
}
