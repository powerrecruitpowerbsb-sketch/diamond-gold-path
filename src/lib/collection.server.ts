/**
 * Nationwide collection engine.
 *
 * One "pass" does a bounded amount of work and returns: it claims a few schools
 * needing link discovery, then a few programs needing a scrape. Leasing in
 * `ingest_queue` is the single-flight guard, so several passes (or a dead pass
 * whose lease went stale) can never work the same row twice.
 *
 * Accuracy is unchanged from the hand-run pipeline: only clearly-confident
 * links are applied automatically, anything doubtful lands on the review
 * screens, and scraped facts still go through the trust tiers in
 * `ingest.server.ts`.
 */

export type CollectionState = {
  isRunning: boolean;
  stopRequested: boolean;
  startedAt: string | null;
  lastBeatAt: string | null;
  linksFound: number;
  linksApplied: number;
  programsScraped: number;
  playersFound: number;
  failures: number;
  lastMessage: string | null;
};

export type PassResult = {
  schoolsDiscovered: number;
  linksFound: number;
  linksApplied: number;
  linksNeedReview: number;
  programsScraped: number;
  playersFound: number;
  proposals: number;
  flagged: number;
  failures: number;
  /** Nothing left to claim — the caller can stop looping. */
  idle: boolean;
  notes: string[];
};

const emptyPass = (): PassResult => ({
  schoolsDiscovered: 0,
  linksFound: 0,
  linksApplied: 0,
  linksNeedReview: 0,
  programsScraped: 0,
  playersFound: 0,
  proposals: 0,
  flagged: 0,
  failures: 0,
  idle: true,
  notes: [],
});

const STATE_ID = "singleton";

export async function readCollectionState(supabase: any): Promise<CollectionState> {
  const { data } = await supabase
    .from("collection_state")
    // Explicit columns: the private runner key is not readable by app users.
    .select(
      "id, is_running, stop_requested, started_at, last_beat_at, links_found, links_applied, programs_scraped, players_found, failures, last_message",
    )
    .eq("id", STATE_ID)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, any>;
  return {
    isRunning: Boolean(row["is_running"]),
    stopRequested: Boolean(row["stop_requested"]),
    startedAt: row["started_at"] ?? null,
    lastBeatAt: row["last_beat_at"] ?? null,
    linksFound: Number(row["links_found"] ?? 0),
    linksApplied: Number(row["links_applied"] ?? 0),
    programsScraped: Number(row["programs_scraped"] ?? 0),
    playersFound: Number(row["players_found"] ?? 0),
    failures: Number(row["failures"] ?? 0),
    lastMessage: row["last_message"] ?? null,
  };
}

async function writeState(supabase: any, patch: Record<string, unknown>) {
  await supabase
    .from("collection_state")
    .upsert({ id: STATE_ID, ...patch }, { onConflict: "id" });
}

/** Mark collection as started and clear the previous run's tallies. */
export async function markCollectionStarted(supabase: any) {
  await writeState(supabase, {
    is_running: true,
    stop_requested: false,
    started_at: new Date().toISOString(),
    last_beat_at: new Date().toISOString(),
    links_found: 0,
    links_applied: 0,
    programs_scraped: 0,
    players_found: 0,
    failures: 0,
    last_message: "Collection started",
  });
}

export async function requestCollectionStop(supabase: any, message = "Stop requested") {
  await writeState(supabase, { stop_requested: true, last_message: message });
}

export async function markCollectionFinished(supabase: any, message: string) {
  await writeState(supabase, {
    is_running: false,
    stop_requested: false,
    last_beat_at: new Date().toISOString(),
    last_message: message,
  });
}

/** Fold one pass's tallies into the run totals so progress is visible live. */
async function recordBeat(supabase: any, pass: PassResult) {
  const state = await readCollectionState(supabase);
  await writeState(supabase, {
    last_beat_at: new Date().toISOString(),
    links_found: state.linksFound + pass.linksFound,
    links_applied: state.linksApplied + pass.linksApplied,
    programs_scraped: state.programsScraped + pass.programsScraped,
    players_found: state.playersFound + pass.playersFound,
    failures: state.failures + pass.failures,
    last_message: pass.idle
      ? "Nothing left in the queue"
      : `Last pass: ${pass.schoolsDiscovered} school(s) searched, ${pass.programsScraped} team(s) collected`,
  });
}

/** Run tasks a few at a time so one slow page can't stall the whole pass. */
async function pool<T>(items: T[], workers: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
}

/**
 * Turn the confident links a discovery run found into live program/school
 * fields. Anything low-confidence or failed is left pending for a human.
 */
async function applyConfidentLinks(
  supabase: any,
  actorId: string,
  universityId: string,
): Promise<{ applied: number; needsReview: number; found: number }> {
  const { applyDiscoveredUrl } = await import("@/lib/discovery.server");
  const { data } = await supabase
    .from("url_discovery_queue")
    .select("id, university_id, program_id, discovery_type, discovered_url, confidence, notes")
    .eq("university_id", universityId)
    .eq("status", "pending_review");

  let applied = 0;
  let needsReview = 0;
  let found = 0;

  for (const row of ((data ?? []) as any[])) {
    if (row.discovered_url) found += 1;
    if (row.confidence !== "high" || !row.discovered_url) {
      if (row.discovered_url) needsReview += 1;
      continue;
    }
    try {
      await applyDiscoveredUrl(supabase, row);
      await supabase
        .from("url_discovery_queue")
        .update({
          status: "confirmed",
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      applied += 1;
    } catch (failure) {
      needsReview += 1;
      await supabase
        .from("url_discovery_queue")
        .update({
          notes: `${row.notes ?? ""} — could not be saved automatically: ${
            failure instanceof Error ? failure.message : "unknown error"
          }`.slice(0, 500),
        })
        .eq("id", row.id);
    }
  }

  return { applied, needsReview, found };
}

/** Finish every discovery job for a school in one go — one search covers all its teams. */
async function closeDiscoveryJobs(supabase: any, universityId: string) {
  const now = new Date().toISOString();
  await supabase
    .from("ingest_queue")
    .update({ status: "done", last_error: null, leased_at: null, last_success_at: now, updated_at: now })
    .eq("stage", "url_discovery")
    .eq("university_id", universityId)
    .in("status", ["pending", "failed", "running"]);
}

export async function runCollectionPass(
  supabase: any,
  actorId: string,
  options: { discoverySchools?: number; scrapePrograms?: number; workers?: number } = {},
): Promise<PassResult> {
  const discoverySchools = Math.min(Math.max(options.discoverySchools ?? 6, 0), 40);
  const scrapePrograms = Math.min(Math.max(options.scrapePrograms ?? 6, 0), 40);
  const workers = Math.min(Math.max(options.workers ?? 4, 1), 8);

  const { leaseQueueItems, completeQueueItem, failQueueItem } = await import(
    "@/lib/ingest-queue.server"
  );
  const result = emptyPass();

  // A round that died mid-way used to leave its work marked "in progress"
  // forever, so those schools were never collected. Free anything abandoned for
  // more than fifteen minutes before claiming new work.
  const { data: freed } = await supabase.rpc("reclaim_stale_leases", { _minutes: 15 });
  if (typeof freed === "number" && freed > 0) {
    result.notes.push(`${freed} stuck job(s) put back in the queue`);
  }

  // --- Stage 1: find each school's athletics, roster and coaching pages -------
  if (discoverySchools > 0) {
    const items = await leaseQueueItems(supabase, "url_discovery", discoverySchools * 2);
    const bySchool = new Map<string, string[]>();
    for (const item of items) {
      if (!item.university_id) {
        await failQueueItem(supabase, item.id, "Queue item has no school", true);
        continue;
      }
      const list = bySchool.get(item.university_id) ?? [];
      list.push(item.id);
      bySchool.set(item.university_id, list);
    }

    const schools = [...bySchool.keys()].slice(0, discoverySchools);
    // Anything leased beyond the cap goes straight back so the next pass takes it.
    for (const [universityId, ids] of bySchool) {
      if (schools.includes(universityId)) continue;
      for (const id of ids) {
        await supabase
          .from("ingest_queue")
          .update({ status: "pending", leased_at: null })
          .eq("id", id);
      }
    }

    if (schools.length) result.idle = false;

    await pool(schools, workers, async (universityId) => {
      const { discoverUniversityUrls } = await import("@/lib/discovery.server");
      try {
        const outcome = await discoverUniversityUrls(supabase, universityId);
        const links = await applyConfidentLinks(supabase, actorId, universityId);
        result.schoolsDiscovered += 1;
        result.linksFound += links.found;
        result.linksApplied += links.applied;
        result.linksNeedReview += links.needsReview;
        if (outcome.errorMessage) {
          result.failures += 1;
          result.notes.push(`${outcome.universityName}: ${outcome.errorMessage}`);
          for (const id of bySchool.get(universityId) ?? []) {
            await failQueueItem(supabase, id, outcome.errorMessage);
          }
          return;
        }
        await closeDiscoveryJobs(supabase, universityId);
      } catch (failure) {
        result.failures += 1;
        const message = failure instanceof Error ? failure.message : "Link search failed";
        result.notes.push(message);
        for (const id of bySchool.get(universityId) ?? []) {
          await failQueueItem(supabase, id, message);
        }
      }
    });
  }

  // --- Stage 2: collect each program's facts and roster ----------------------
  if (scrapePrograms > 0) {
    const items = await leaseQueueItems(supabase, "program_scrape", scrapePrograms);
    if (items.length) result.idle = false;

    await pool(items, workers, async (item) => {
      if (!item.program_id) {
        await failQueueItem(supabase, item.id, "Queue item has no team", true);
        return;
      }
      const { ingestProgram } = await import("@/lib/ingest.server");
      try {
        const outcome = await ingestProgram(supabase, actorId, item.program_id);
        result.programsScraped += 1;
        result.playersFound += outcome.rosterPlayers ?? 0;
        result.proposals += outcome.proposalsCreated ?? 0;
        if (outcome.rosterWarning) {
          result.flagged += 1;
          result.notes.push(`${outcome.programLabel}: ${outcome.rosterWarning}`);
        }
        if (outcome.status === "failed") {
          result.failures += 1;
          await failQueueItem(
            supabase,
            item.id,
            outcome.errorMessage ?? "Nothing could be collected from this team's pages",
          );
          return;
        }
        await completeQueueItem(supabase, item.id);
      } catch (failure) {
        result.failures += 1;
        const message = failure instanceof Error ? failure.message : "Collection failed";
        result.notes.push(`${item.program_id}: ${message}`);
        await failQueueItem(supabase, item.id, message);
      }
    });
  }

  // Settle sport sponsorship first: a sport a school doesn't field never needs a
  // link search or a scrape, so this removes work rather than adding it.
  try {
    const { syncSponsorshipBatch } = await import("@/lib/sport-sponsorship.server");
    await syncSponsorshipBatch(supabase, { limit: 40 });
  } catch (failure) {
    result.notes.push(
      `Sport check skipped this round: ${failure instanceof Error ? failure.message : "unknown error"}`,
    );
  }

  // Safety net: anything left over — written before the rules changed, or only
  // decidable once a sibling program's site was confirmed — is tidied here, so
  // no button press is needed to keep the two lists down to real decisions.
  try {
    const { sweepPendingUntilDone } = await import("@/lib/review.server");
    const { sweepLinksUntilDone } = await import("@/lib/link-sweep.server");
    await sweepPendingUntilDone(supabase, actorId, true, { maxPasses: 2, budgetMs: 20_000 });
    await sweepLinksUntilDone(supabase, actorId, { apply: true, maxPasses: 2, budgetMs: 20_000 });
  } catch (failure) {
    result.notes.push(
      `Automatic tidy-up skipped this round: ${failure instanceof Error ? failure.message : "unknown error"}`,
    );
  }

  await recordBeat(supabase, result);
  return result;
}


/** Live progress for the pipeline screen: how much of the country is collected. */
export async function collectionProgress(supabase: any) {
  const count = (table: string, apply: (q: any) => any = (q) => q) =>
    apply(supabase.from(table).select("id", { count: "exact", head: true })).then(
      ({ count: value }: any) => value ?? 0,
    );

  const [
    state,
    programsTotal,
    withRosterUrl,
    scraped,
    linksNeedReview,
    factsNeedReview,
    queueFailed,
    queueBlocked,
    discoveryPending,
    scrapePending,
  ] = await Promise.all([
    readCollectionState(supabase),
    count("programs"),
    count("programs", (q: any) => q.not("roster_url", "is", null)),
    count("programs", (q: any) => q.not("last_roster_pull_at", "is", null)),
    count("url_discovery_queue", (q: any) => q.eq("status", "pending_review")),
    count("pending_data_changes", (q: any) => q.eq("status", "pending")),
    count("ingest_queue", (q: any) => q.eq("status", "failed")),
    count("ingest_queue", (q: any) => q.eq("status", "blocked")),
    count("ingest_queue", (q: any) => q.eq("stage", "url_discovery").in("status", ["pending", "failed", "running"])),
    count("ingest_queue", (q: any) => q.eq("stage", "program_scrape").in("status", ["pending", "failed", "running"])),
  ]);

  const { count: snapshots } = await supabase
    .from("roster_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("suspect", false);

  return {
    state,
    programs: { total: programsTotal, withRosterUrl, scraped, snapshots: snapshots ?? 0 },
    remaining: { discovery: discoveryPending, scrape: scrapePending },
    review: { links: linksNeedReview, facts: factsNeedReview },
    problems: { failed: queueFailed, blocked: queueBlocked },
  };
}
