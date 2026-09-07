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

    const soon = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const [rostersDueNow, rostersDueSoon, factsDueNow, factsDueSoon] = await Promise.all([
      count("programs", (q) => q.lte("roster_refresh_due_at", nowIso).not("roster_url", "is", null)),
      count("programs", (q) =>
        q.gt("roster_refresh_due_at", nowIso).lte("roster_refresh_due_at", soon).not("roster_url", "is", null),
      ),
      count("universities", (q) =>
        q.lte("facts_refresh_due_at", nowIso).in("federal_match_status", ["confirmed", "manual"]),
      ),
      count("universities", (q) =>
        q
          .gt("facts_refresh_due_at", nowIso)
          .lte("facts_refresh_due_at", soon)
          .in("federal_match_status", ["confirmed", "manual"]),
      ),
    ]);

    const { sponsorshipCoverage } = await import("@/lib/sport-sponsorship.server");
    const sponsorship = await sponsorshipCoverage(context.supabase);

    return clean({
      usingDemoKey: usingDemoKey(),
      coverage,
      schools: { total: schoolsTotal, federalConfirmed, federalNeedsHelp, withCost },
      programs: { total: programsTotal, baseball, softball, withRosterUrl, withCoach },
      refresh: { rostersDueNow, rostersDueSoon, factsDueNow, factsDueSoon },
      sponsorship,
    });

  });

/** Send everything that is due for its scheduled re-check back into the queue now. */
export const runDueRefreshes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("enqueue_due_refreshes" as any, {
      _program_limit: 500,
      _school_limit: 500,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { programs_queued: number; schools_queued: number }
      | null;
    return clean({
      programsQueued: row?.programs_queued ?? 0,
      schoolsQueued: row?.schools_queued ?? 0,
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

/**
 * Anything in the school list that reads like a directory or index page rather
 * than a real school. Wikipedia imports occasionally sweep these up.
 */
const NON_SCHOOL_PATTERN = "^(list of|index of|outline of|comparison of|timeline of|category:|template:|portal:)";

export const listNonSchoolEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select("id, name, state, federal_match_status")
      .ilike("name", "%")
      .or(
        [
          "name.ilike.list of%",
          "name.ilike.index of%",
          "name.ilike.outline of%",
          "name.ilike.comparison of%",
          "name.ilike.timeline of%",
          "name.ilike.category:%",
          "name.ilike.template:%",
          "name.ilike.portal:%",
        ].join(","),
      )
      .order("name")
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    if (!rows.length) return clean({ entries: [] });

    // Show how much is hanging off each one so a removal is never a surprise.
    const ids = rows.map((row) => row.id);
    const { data: programs } = await context.supabase
      .from("programs")
      .select("id, university_id")
      .in("university_id", ids);

    const programCount = new Map<string, number>();
    for (const program of (programs ?? []) as any[]) {
      const key = String(program.university_id);
      programCount.set(key, (programCount.get(key) ?? 0) + 1);
    }

    return clean({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        state: row.state ?? null,
        programs: programCount.get(String(row.id)) ?? 0,
      })),
    });
  });

/** Remove one entry that isn't a school, plus everything attached to it. */
export const removeNonSchoolEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string }) => ({
    universityId: String(input?.universityId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.universityId) throw new Error("Nothing was selected to remove");

    const { data: school, error } = await context.supabase
      .from("universities")
      .select("id, name")
      .eq("id", data.universityId)
      .single();
    if (error) throw new Error(error.message);

    // Only entries that match the index-page shape can be removed here, so a
    // real school can never be deleted by this tool.
    if (!new RegExp(NON_SCHOOL_PATTERN, "i").test(String(school.name ?? ""))) {
      throw new Error("That looks like a real school — remove it from the school list instead");
    }

    // Order matters: dependent rows first, then the programs, then the school.
    // Deletions are captured in the audit log by the database triggers.
    const { error: ingestError } = await context.supabase
      .from("ingest_queue")
      .delete()
      .eq("university_id", data.universityId);
    if (ingestError) throw new Error(ingestError.message);

    const { error: discoveryError } = await context.supabase
      .from("url_discovery_queue")
      .delete()
      .eq("university_id", data.universityId);
    if (discoveryError) throw new Error(discoveryError.message);
    const { error: pendingError } = await context.supabase
      .from("pending_data_changes")
      .delete()
      .eq("table_name", "universities")
      .eq("record_id", data.universityId);
    if (pendingError) throw new Error(pendingError.message);

    const { error: programError } = await context.supabase
      .from("programs")
      .delete()
      .eq("university_id", data.universityId);
    if (programError) throw new Error(programError.message);

    const { error: schoolError } = await context.supabase
      .from("universities")
      .delete()
      .eq("id", data.universityId);
    if (schoolError) throw new Error(schoolError.message);

    return clean({ removed: String(school.name ?? "") });
  });

/** What a combine would move, so a person can see it before confirming. */
export const previewSchoolMerge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { duplicateId: string; keeperId: string }) => ({
    duplicateId: String(input?.duplicateId ?? ""),
    keeperId: String(input?.keeperId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { previewMerge } = await import("@/lib/school-merge.server");
    return clean(await previewMerge(context.supabase, data.duplicateId, data.keeperId));
  });

/** Same school twice: fold the duplicate into the one that holds the record. */
export const mergeDuplicateSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { duplicateId: string; keeperId: string }) => ({
    duplicateId: String(input?.duplicateId ?? ""),
    keeperId: String(input?.keeperId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.duplicateId || !data.keeperId) throw new Error("Pick both schools first");
    const { mergeSchools } = await import("@/lib/school-merge.server");
    return clean(await mergeSchools(context.supabase, context.userId, data.duplicateId, data.keeperId));
  });

/** Different campus: copy the parent's facts without claiming its record. */
export const linkSharedRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { universityId: string; unitid: number }) => ({
    universityId: String(input?.universityId ?? ""),
    unitid: Number(input?.unitid ?? 0),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.universityId || !data.unitid) throw new Error("Pick a national record first");
    const { linkSharedFederalRecord } = await import("@/lib/school-merge.server");
    return clean(
      await linkSharedFederalRecord(context.supabase, context.userId, data.universityId, data.unitid),
    );
  });

/**
 * One-time catch-up: everything a person already declined goes back in line for
 * a fresh look, so the backlog gets picked up by the background collector.
 */
export const requeueRejected = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { requeueSchoolForDiscovery } = await import("@/lib/discovery.server");

    const { data: rejectedLinks, error: linkError } = await context.supabase
      .from("url_discovery_queue")
      .select("university_id, discovery_type")
      .eq("status", "rejected");
    if (linkError) throw new Error(linkError.message);

    const seen = new Set<string>();
    let schoolsQueued = 0;
    let cappedSchools = 0;
    for (const row of (rejectedLinks ?? []) as {
      university_id: string;
      discovery_type: any;
    }[]) {
      const key = `${row.university_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const outcome = await requeueSchoolForDiscovery(
        context.supabase,
        String(row.university_id),
        row.discovery_type,
      );
      if (outcome.requeued) schoolsQueued += 1;
      else cappedSchools += 1;
    }

    // Programs whose proposed values were declined get read again too.
    const { data: rejectedChanges, error: changeError } = await context.supabase
      .from("pending_data_changes")
      .select("table_name, record_id, proposed_value")
      .eq("status", "rejected");
    if (changeError) throw new Error(changeError.message);

    const programIds = new Set<string>();
    for (const row of (rejectedChanges ?? []) as any[]) {
      const candidate =
        row.table_name === "programs"
          ? row.record_id
          : row.table_name === "roster_players"
            ? (row.proposed_value?.program_id ?? row.record_id)
            : null;
      if (candidate) programIds.add(String(candidate));
    }

    let programsQueued = 0;
    const ids = [...programIds];
    for (let index = 0; index < ids.length; index += 100) {
      const batch = ids.slice(index, index + 100);
      const { data: updated, error: queueError } = await context.supabase
        .from("ingest_queue")
        .update({ status: "pending", attempts: 0, last_error: null, leased_at: null })
        .in("program_id", batch)
        .eq("stage", "program_scrape")
        .select("id");
      if (!queueError) programsQueued += (updated ?? []).length;
    }

    return clean({ schoolsQueued, cappedSchools, programsQueued });
  });

/**
 * Check baseball/softball sponsorship against the federal athletics filing, so
 * sports a school doesn't field stop generating links and review items.
 */
export const runSponsorshipCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; recheck?: boolean }) => ({
    limit: Number(input?.limit) || 60,
    recheck: Boolean(input?.recheck),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { syncSponsorshipBatch } = await import("@/lib/sport-sponsorship.server");
    return clean(
      await syncSponsorshipBatch(context.supabase, { limit: data.limit, recheck: data.recheck }),
    );
  });

/** Sport slots still waiting on a decision, for the short hand-decide list. */
export const listUndecidedSports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("programs")
      .select(
        "id, sport, offering_source, roster_url, sponsorship_checked_at, universities!inner(name, state, ipeds_unitid)",
      )
      .eq("offering_status", "unverified")
      .not("sponsorship_checked_at", "is", null)
      .order("sport")
      .limit(60);
    if (error) throw new Error(error.message);

    return clean(
      ((data ?? []) as any[]).map((row) => ({
        id: row.id as string,
        sport: row.sport as string,
        schoolName: String(row.universities?.name ?? ""),
        state: (row.universities?.state ?? null) as string | null,
        hasFederalId: row.universities?.ipeds_unitid != null,
        hasRosterUrl: Boolean(row.roster_url),
        conflict: row.offering_source === "conflict_needs_review",
      })),
    );
  });

/** Staff decision on a single sport slot. */
export const setSportOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string; offered: boolean }) => ({
    programId: String(input?.programId ?? ""),
    offered: Boolean(input?.offered),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.programId) throw new Error("Pick a sport first");
    const stamp = new Date().toISOString();

    const { error } = await context.supabase
      .from("programs")
      .update({
        offering_status: data.offered ? "verified" : "not_offered",
        offering_source: "staff_decision",
        offering_verified_at: stamp,
        sponsorship_checked_at: stamp,
      })
      .eq("id", data.programId);
    if (error) throw new Error(error.message);

    if (!data.offered) {
      const { retireProgram } = await import("@/lib/sport-sponsorship.server");
      await retireProgram(context.supabase, data.programId, "Staff confirmed this sport isn't offered.");
    }

    return clean({ ok: true });
  });

/** Take a small sample of stored coaches and re-check each against its source. */
export const runAccuracySample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 12) || 12, 1), 40),
  }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const { sampleCoachAccuracy, accuracySummary } = await import("@/lib/accuracy.server");
    const sample = await sampleCoachAccuracy(context.supabase, data.limit);
    return clean({ sample, summary: await accuracySummary(context.supabase) });
  });

/** The rolling accuracy picture for the admin screen. */
export const getAccuracySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { accuracySummary } = await import("@/lib/accuracy.server");
    return clean(await accuracySummary(context.supabase));
  });

/** The progress board: how close every sponsored team is to finished. */
export const getCompletionBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { completionBoard } = await import("@/lib/completion.server");
    return clean(await completionBoard(context.supabase));
  });

/** Queue up every team that still needs links, a roster or a coach. */
export const queueRemainingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 4000) || 4000, 1), 8000),
  }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const { enqueueGapWork } = await import("@/lib/completion.server");
    return clean(await enqueueGapWork(context.supabase, { limit: data.limit }));
  });

/** Find (and optionally clear) teams holding another school's pages. */
export const auditPageOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean }) => ({ apply: Boolean(input?.apply) }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const { auditPageOwnership: audit } = await import("@/lib/completion.server");
    const result = await audit(context.supabase, { apply: data.apply });
    return clean({
      ...result,
      problems: result.problems.slice(0, 200),
      standoffs: result.standoffs.slice(0, 200),
      total: result.problems.length,
    });
  });

/** Work through the waiting review items and discovered links in one pass. */
export const clearBacklog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean }) => ({ apply: Boolean(input?.apply) }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const { sweepPendingUntilDone } = await import("@/lib/review.server");
    const { sweepLinksUntilDone, retireEmptyDiscoveryRows } = await import(
      "@/lib/link-sweep.server"
    );
    const facts = await sweepPendingUntilDone(context.supabase, context.userId, data.apply, {
      budgetMs: 25_000,
    });
    // Rows with no address at all are empty searches, not decisions: retire them
    // and put those teams back in line before judging the real links.
    const emptyLinks = await retireEmptyDiscoveryRows(context.supabase, context.userId, {
      apply: data.apply,
    });
    const links = await sweepLinksUntilDone(context.supabase, context.userId, {
      apply: data.apply,
      budgetMs: 25_000,
    });
    return clean({ facts, links, emptyLinks });
  });

/**
 * Type in a coach we know by hand. A name entered by a person is recorded as
 * coming from a person, and the pipeline will never quietly overwrite it —
 * a page that disagrees comes back as something to confirm.
 */
export const setCoachManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string; name: string; sourceUrl?: string | null }) => ({
    programId: String(input.programId),
    name: String(input.name ?? "").trim().slice(0, 120),
    sourceUrl: input.sourceUrl ? String(input.sourceUrl).trim() : null,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    if (!data.name) throw new Error("Enter the coach's name");

    const { data: before, error: readError } = await context.supabase
      .from("programs")
      .select("head_coach_name")
      .eq("id", data.programId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const { error } = await context.supabase
      .from("programs")
      .update({ head_coach_name: data.name, last_verified_at: new Date().toISOString() })
      .eq("id", data.programId);
    if (error) throw new Error(error.message);

    const { error: sourceError } = await context.supabase.from("data_field_sources").upsert(
      [
        {
          table_name: "programs",
          record_id: data.programId,
          field_name: "head_coach_name",
          source_url: data.sourceUrl,
          source_type: "manual",
          last_verified_at: new Date().toISOString(),
          verified_by: context.userId,
        },
      ],
      { onConflict: "table_name,record_id,field_name" },
    );
    if (sourceError) throw new Error(sourceError.message);

    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      table_name: "programs",
      record_id: data.programId,
      field_name: "head_coach_name",
      old_value: before?.head_coach_name ?? null,
      new_value: data.name,
      action: "override",
    });

    return clean({ ok: true, name: data.name });
  });

/**
 * Re-read stored rosters against their own page and keep only players the page
 * actually lists. Bounded per call so it can be run repeatedly.
 */
export const recheckRosters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean; min?: number; max?: number; limit?: number }) => ({
    apply: Boolean(input?.apply),
    min: Number.isFinite(input?.min) ? Number(input?.min) : 50,
    max: Number.isFinite(input?.max) ? Number(input?.max) : 1000,
    limit: Number.isFinite(input?.limit) ? Number(input?.limit) : 12,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as any);
    const { recheckRosterSizes } = await import("@/lib/roster-recheck.server");
    const result = await recheckRosterSizes(context.supabase, {
      apply: data.apply,
      min: data.min,
      max: data.max,
      limit: data.limit,
      budgetMs: 25_000,
    });
    return clean(result);
  });

/**
 * Put every confirmed team with no official roster or staff page back in line to
 * have those pages found. Nothing else can be filled in without them.
 */
export const requeueMissingLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { requeueMissingLinkWork } = await import("@/lib/ingest-queue.server");
    return clean(await requeueMissingLinkWork(context.supabase));
  });

