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

    const [coverage, schools, programs] = await Promise.all([
      queueCoverage(context.supabase),
      context.supabase
        .from("universities")
        .select("id, federal_match_status, federal_synced_at, tuition_in_state"),
      context.supabase.from("programs").select("id, sport, roster_url, head_coach_name, offering_status"),
    ]);
    if (schools.error) throw new Error(schools.error.message);
    if (programs.error) throw new Error(programs.error.message);

    const schoolRows = (schools.data ?? []) as any[];
    const programRows = (programs.data ?? []) as any[];

    return clean({
      usingDemoKey: usingDemoKey(),
      coverage,
      schools: {
        total: schoolRows.length,
        federalConfirmed: schoolRows.filter((r) => r.federal_match_status === "confirmed").length,
        // Only schools we actually looked up count as needing a decision — an
        // untouched school is simply not collected yet.
        federalNeedsHelp: schoolRows.filter(
          (r) =>
            r.federal_synced_at &&
            (r.federal_match_status === "ambiguous" || r.federal_match_status === "unmatched"),
        ).length,
        withCost: schoolRows.filter((r) => r.tuition_in_state !== null).length,
      },
      programs: {
        total: programRows.length,
        baseball: programRows.filter((r) => r.sport === "baseball").length,
        softball: programRows.filter((r) => r.sport === "softball").length,
        withRosterUrl: programRows.filter((r) => Boolean(r.roster_url)).length,
        withCoach: programRows.filter((r) => Boolean(r.head_coach_name)).length,
      },
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
  .inputValidator((input: { division: string; sport: string }) => ({
    division: String(input?.division ?? "I"),
    sport: String(input?.sport ?? "baseball"),
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

    const rows = await fetchNcaaDirectory(division, sport);
    const result = await importDirectoryRows(context.supabase, rows, label);
    const queued = await enqueueMissingWork(context.supabase);

    return clean({ ...result, queued });
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
    const { searchScorecard } = await import("@/lib/federal-data.server");

    const { data: school, error } = await context.supabase
      .from("universities")
      .select("id, name, state")
      .eq("id", data.universityId)
      .single();
    if (error) throw new Error(error.message);

    const name = data.query || String((school as any).name ?? "");
    const rows = await searchScorecard(name, data.query ? null : ((school as any).state ?? null));
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
