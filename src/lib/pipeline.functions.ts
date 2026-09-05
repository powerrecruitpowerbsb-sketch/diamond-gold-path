import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((row: { role: string }) => row.role === "superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Coverage dashboard: how much of the country is collected, stage by stage. */
export const getPipelineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { queueCoverage } = await import("@/lib/ingest-queue.server");
    const { usingDemoKey } = await import("@/lib/federal-data.server");

    // Counts come from the database rather than from fetched rows: a full-table
    // read caps at 1,000 rows, which would understate a national universe.
    const count = (table: string, apply: (q: any) => any = (q) => q) =>
      apply((context.supabase as any).from(table).select("id", { count: "exact", head: true })).then(
        ({ count: value, error }: any) => {
          if (error) throw new Error(error.message);
          return value ?? 0;
        },
      );

    const [
      coverage,
      schoolsTotal,
      federalConfirmed,
      federalNeedsHelp,
      withCost,
      programsTotal,
      baseball,
      softball,
      withRosterUrl,
      withCoach,
    ] = await Promise.all([
      queueCoverage(context.supabase),
      count("universities"),
      count("universities", (q) => q.eq("federal_match_status", "confirmed")),
      // Only schools we actually looked up count as needing a decision — an
      // untouched school is simply not collected yet.
      count("universities", (q) =>
        q.not("federal_synced_at", "is", null).in("federal_match_status", ["ambiguous", "unmatched"]),
      ),
      count("universities", (q) => q.not("tuition_in_state", "is", null)),
      count("programs"),
      count("programs", (q) => q.eq("sport", "baseball")),
      count("programs", (q) => q.eq("sport", "softball")),
      count("programs", (q) => q.not("roster_url", "is", null)),
      count("programs", (q) => q.not("head_coach_name", "is", null)),
    ]);

    return clean({
      usingDemoKey: usingDemoKey(),
      coverage,
      schools: { total: schoolsTotal, federalConfirmed, federalNeedsHelp, withCost },
      programs: { total: programsTotal, baseball, softball, withRosterUrl, withCoach },
    });

  });

/** Add queue rows for anything new, so a fresh import joins the pipeline. */
export const rebuildQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { enqueueMissingWork } = await import("@/lib/ingest-queue.server");
    return clean(await enqueueMissingWork(context.supabase));
  });

/** Pull one division + sport slice of the NCAA's own membership directory. */
export const importNcaaSlice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { division: string; sport: string; offset?: number; limit?: number }) => ({
    division: String(input?.division ?? "I"),
    sport: String(input?.sport ?? "baseball"),
    offset: Math.max(Number(input?.offset ?? 0) || 0, 0),
    limit: Math.min(Math.max(Number(input?.limit ?? 60) || 60, 1), 120),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { fetchNcaaDirectory, importDirectoryRows, NCAA_DIVISIONS } = await import(
      "@/lib/directory-import.server"
    );
    const { enqueueMissingWork } = await import("@/lib/ingest-queue.server");

    const division = (NCAA_DIVISIONS as readonly string[]).includes(data.division)
      ? (data.division as "I" | "II" | "III")
      : "I";
    const sport = data.sport === "softball" ? "softball" : "baseball";
    const label = `NCAA D${division === "I" ? 1 : division === "II" ? 2 : 3} ${sport}`;

    const all = await fetchNcaaDirectory(division, sport);
    // Chunked so a 400-school slice never runs past the request budget: the
    // caller keeps asking for the next window until `done` comes back true.
    const rows = all.slice(data.offset, data.offset + data.limit);
    const result = await importDirectoryRows(context.supabase, rows, label);
    const nextOffset = data.offset + rows.length;
    const done = nextOffset >= all.length;
    const queued = done ? await enqueueMissingWork(context.supabase) : {};

    return clean({ ...result, total: all.length, nextOffset, done, queued });
  });

/**
 * Pull one non-NCAA membership slice (NAIA, NJCAA D1-D3, CCCAA, NWAC). Those
 * bodies block automated access to their own sites, so the member tables come
 * from Wikipedia's maintained lists over the free MediaWiki API.
 */
export const importWikiSlice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slice: string; offset?: number; limit?: number }) => ({
    slice: String(input?.slice ?? ""),
    offset: Math.max(Number(input?.offset ?? 0) || 0, 0),
    limit: Math.min(Math.max(Number(input?.limit ?? 60) || 60, 1), 120),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { importDirectoryRows } = await import("@/lib/directory-import.server");
    const { fetchWikiDirectory, WIKI_SLICES } = await import("@/lib/wiki-directory.server");
    const { enqueueMissingWork } = await import("@/lib/ingest-queue.server");

    const slice = WIKI_SLICES.find((candidate) => candidate.key === data.slice);
    if (!slice) throw new Error("Unknown membership list");

    const all = await fetchWikiDirectory(slice.key);
    const rows = all.slice(data.offset, data.offset + data.limit);
    const result = await importDirectoryRows(context.supabase, rows, slice.label);
    const nextOffset = data.offset + rows.length;
    const done = nextOffset >= all.length;
    const queued = done ? await enqueueMissingWork(context.supabase) : {};

    return clean({ ...result, total: all.length, nextOffset, done, queued });
  });




/**
 * Work the federal-data stage: claim a batch of schools, match each to its
 * federal record and write the facts. Gap-fills land live; overwrites queue for
 * review; anything the matcher can't settle is parked for a human.
 */
export const runFederalBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 10) || 10, 1), 50),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { leaseQueueItems, completeQueueItem, failQueueItem } = await import(
      "@/lib/ingest-queue.server"
    );
    const { syncUniversityFromFederal } = await import("@/lib/federal-data.server");

    const items = await leaseQueueItems(context.supabase, "federal_data", data.limit);
    const results: any[] = [];
    let rateLimitHit: string | null = null;


    for (const item of items) {
      if (!item.university_id) {
        await failQueueItem(context.supabase, item.id, "Queue item has no school", true);
        continue;
      }
      try {
        const outcome = await syncUniversityFromFederal(
          context.supabase,
          context.userId,
          item.university_id,
        );
        if (outcome.status === "confirmed") {
          await completeQueueItem(context.supabase, item.id);
        } else {
          await failQueueItem(
            context.supabase,
            item.id,
            outcome.status === "unmatched"
              ? "No federal record found for this school name"
              : "More than one federal record could be this school",
            true,
          );
        }
        results.push(outcome);
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : "Federal sync failed";
        const rateLimited = /rate limit/i.test(message);
        if (rateLimited) {
          // Not this school's fault — hand the job straight back and stop the run.
          await context.supabase
            .from("ingest_queue")
            .update({ status: "pending", attempts: Math.max(item.attempts - 1, 0), leased_at: null })
            .eq("id", item.id);
          rateLimitHit = message;
          break;
        }
        await failQueueItem(context.supabase, item.id, message);
        results.push({
          universityId: item.university_id,
          schoolName: "",
          status: "unmatched",
          errorMessage: message,
          fieldsApplied: 0,
          fieldsQueued: 0,
          candidates: [],
        });
      }
    }

    return clean({
      processed: results.length,
      confirmed: results.filter((r) => r.status === "confirmed").length,
      needsHelp: results.filter((r) => r.status !== "confirmed").length,
      fieldsApplied: results.reduce((sum, r) => sum + (r.fieldsApplied ?? 0), 0),
      fieldsQueued: results.reduce((sum, r) => sum + (r.fieldsQueued ?? 0), 0),
      rateLimitHit,
      results,
    });
  });

/** Schools whose federal match a human has to settle. */
export const listFederalBlocked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select("id, name, state, city, federal_match_status")
      .in("federal_match_status", ["ambiguous", "unmatched"])
      .not("federal_synced_at", "is", null)
      .order("name")
      .limit(200);
    if (error) throw new Error(error.message);
    return clean(data ?? []);
  });

/** Candidate federal records for one school, for the human to choose from. */
export const listFederalCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string; query?: string }) => ({
    universityId: String(input?.universityId ?? ""),
    query: String(input?.query ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { searchScorecard, findFederalRecord } = await import("@/lib/federal-data.server");

    const { data: school, error } = await context.supabase
      .from("universities")
      .select("id, name, state")
      .eq("id", data.universityId)
      .single();
    if (error) throw new Error(error.message);

    // No search term: run the same multi-form lookup the automatic matcher uses,
    // so the shortlist here is as good as the one that couldn't quite decide.
    if (!data.query) {
      const match = await findFederalRecord(
        String((school as any).name ?? ""),
        (school as any).state ?? null,
      );
      return clean(match.candidates.map((candidate) => ({ ...candidate, enrollment: null })));
    }

    const rows = await searchScorecard(data.query, null);
    return clean(
      rows.map((row) => ({
        unitid: Number(row["id"]),
        name: String(row["school.name"] ?? ""),
        city: (row["school.city"] as string) ?? null,
        state: (row["school.state"] as string) ?? null,
        enrollment: (row["latest.student.size"] as number) ?? null,
      })),
    );
  });

/**
 * Hand the unresolved school-fact jobs back to the queue so the improved
 * matcher can have another go at them. Only schools that actually failed are
 * reset — confirmed ones are left alone.
 */
/**
 * Match the leftover schools against the entire federal directory at once.
 * Preview mode reports what it would do without writing anything.
 */
export const runDirectorySweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apply?: boolean; limit?: number }) => ({
    apply: Boolean(input?.apply),
    limit: Number(input?.limit) || 200,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { sweepUnresolvedSchools } = await import("@/lib/federal-directory.server");
    const outcome = await sweepUnresolvedSchools(context.supabase, context.userId, {
      apply: data.apply,
      limit: data.limit,
    });
    return clean(outcome);
  });

/**
 * The whole decision list with likely federal records already attached, so a
 * person can settle each school in one click.
 */
export const listFederalSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => ({ limit: Number(input?.limit) || 200 }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { suggestFederalMatches } = await import("@/lib/federal-directory.server");
    const result = await suggestFederalMatches(context.supabase, { limit: data.limit });
    return clean(result);
  });

/** Refill our stored copy of the national school list. */
export const refreshNationalDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { refreshDirectoryTable } = await import("@/lib/federal-directory.server");
    return clean(await refreshDirectoryTable());
  });

/** Read the schools' own websites for the ones with no national record. */
export const runSchoolWebFill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; includeParked?: boolean }) => ({
    limit: Number(input?.limit) || 10,
    includeParked: Boolean(input?.includeParked),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { webFillBatch } = await import("@/lib/school-web-fill.server");
    const outcome = await webFillBatch(context.supabase, context.userId, {
      limit: data.limit,
      includeParked: data.includeParked,
    });
    return clean(outcome);
  });



export const retryFederalUnresolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);

    const { data: schools, error } = await context.supabase
      .from("universities")
      .select("id")
      .in("federal_match_status", ["ambiguous", "unmatched"])
      .not("federal_synced_at", "is", null);
    if (error) throw new Error(error.message);

    const ids = ((schools ?? []) as { id: string }[]).map((row) => row.id);
    let reset = 0;
    // Chunked: a single `in` list of thousands of ids overflows the request URL.
    for (let index = 0; index < ids.length; index += 100) {
      const slice = ids.slice(index, index + 100);
      const { data: updated, error: resetError } = await context.supabase
        .from("ingest_queue")
        .update({
          status: "pending",
          attempts: 0,
          last_error: null,
          leased_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("stage", "federal_data")
        .in("university_id", slice)
        .select("id");
      if (resetError) throw new Error(resetError.message);
      reset += (updated ?? []).length;
    }

    return clean({ schools: ids.length, reset });
  });

/** Record that a school genuinely has no federal record, so it stops retrying. */
export const markNotInFederal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string }) => ({
    universityId: String(input?.universityId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.universityId) throw new Error("Pick a school first");

    const { error } = await context.supabase
      .from("universities")
      .update({
        federal_match_status: "not_in_federal",
        federal_synced_at: new Date().toISOString(),
      })
      .eq("id", data.universityId);
    if (error) throw new Error(error.message);

    await context.supabase
      .from("ingest_queue")
      .update({
        status: "done",
        last_error: "Not in the federal directory",
        updated_at: new Date().toISOString(),
      })
      .eq("university_id", data.universityId)
      .eq("stage", "federal_data");

    return clean({ ok: true });
  });

/** Schools a human parked as absent from the federal directory. */
export const listFederalParked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select("id, name, state, city, federal_synced_at")
      .eq("federal_match_status", "not_in_federal")
      .order("federal_synced_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return clean(data ?? []);
  });

/** Reset one school's federal-data queue row so it gets another look. */
async function requeueFederal(supabase: any, ids: string[]) {
  let reset = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { error: schoolError } = await supabase
      .from("universities")
      .update({ federal_match_status: "unmatched", federal_synced_at: null })
      .in("id", slice);
    if (schoolError) throw new Error(schoolError.message);

    const { data: updated, error } = await supabase
      .from("ingest_queue")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        leased_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("stage", "federal_data")
      .in("university_id", slice)
      .select("id");
    if (error) throw new Error(error.message);
    reset += (updated ?? []).length;
  }
  return reset;
}

/** Undo one parked school. */
export const unparkFederalSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string }) => ({
    universityId: String(input?.universityId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.universityId) throw new Error("Pick a school first");
    const reset = await requeueFederal(context.supabase, [data.universityId]);
    return clean({ ok: true, reset });
  });

/** Undo every parked school at once. */
export const unparkAllFederalSchools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data: schools, error } = await context.supabase
      .from("universities")
      .select("id")
      .eq("federal_match_status", "not_in_federal");
    if (error) throw new Error(error.message);
    const ids = ((schools ?? []) as { id: string }[]).map((row) => row.id);
    const reset = await requeueFederal(context.supabase, ids);
    return clean({ ok: true, schools: ids.length, reset });
  });




/** Pin a school to the federal record a human picked and pull its facts. */
export const resolveFederalMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string; unitid: number }) => ({
    universityId: String(input?.universityId ?? ""),
    unitid: Number(input?.unitid ?? 0),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.unitid) throw new Error("Pick a federal record first");
    const { confirmFederalMatch } = await import("@/lib/federal-data.server");
    const outcome = await confirmFederalMatch(
      context.supabase,
      context.userId,
      data.universityId,
      data.unitid,
    );

    // The parked queue item can run again now that the match is settled.
    await context.supabase
      .from("ingest_queue")
      .update({ status: "done", last_error: null, attempts: 0, updated_at: new Date().toISOString() })
      .eq("university_id", data.universityId)
      .eq("stage", "federal_data");

    return clean(outcome);
  });
