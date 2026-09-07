/**
 * The work queue that turns collection into a background process instead of a
 * button someone has to click 4,000 times.
 *
 * One row = one unit of work for one school or program at one stage:
 *   federal_data   → pull authoritative school facts (College Scorecard)
 *   url_discovery  → find the athletics site, roster page, coaching page
 *   program_scrape → scrape coaches + roster and propose changes
 *
 * Items are leased before work starts so two overlapping runs can't do the same
 * job twice, and a crashed run's lease expires instead of blocking forever.
 */

export const QUEUE_STAGES = ["federal_data", "url_discovery", "program_scrape"] as const;
export type QueueStage = (typeof QUEUE_STAGES)[number];

export const STAGE_LABELS: Record<QueueStage, string> = {
  federal_data: "School facts (federal data)",
  url_discovery: "Find athletics links",
  program_scrape: "Scrape coaches & roster",
};

/** A lease older than this is treated as abandoned and can be retried. */
const LEASE_MINUTES = 15;
const MAX_ATTEMPTS = 3;

export type QueueItem = {
  id: string;
  university_id: string | null;
  program_id: string | null;
  stage: QueueStage;
  status: string;
  attempts: number;
  last_error: string | null;
};

/**
 * Read every row of a table/selection. The Data API caps a single response at
 * 1,000 rows, which silently truncates once the universe passes a thousand
 * schools — so every full-table read here pages explicitly.
 */
async function fetchAll(supabase: any, table: string, columns: string): Promise<any[]> {
  const page = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

/**
 * Make sure every school and program has the queue rows it needs. Safe to run
 * repeatedly — existing rows are left alone, so this is how a fresh import
 * batch joins the pipeline.
 */
export async function enqueueMissingWork(supabase: any): Promise<Record<QueueStage, number>> {
  const created: Record<QueueStage, number> = {
    federal_data: 0,
    url_discovery: 0,
    program_scrape: 0,
  };

  const existing = await fetchAll(supabase, "ingest_queue", "id, university_id, program_id, stage");

  const have = new Set(
    existing.map((row) => `${row.stage}:${row.university_id ?? ""}:${row.program_id ?? ""}`),
  );

  const schools = await fetchAll(supabase, "universities", "id, federal_match_status");
  const programs = await fetchAll(
    supabase,
    "programs",
    "id, university_id, roster_url, athletic_website, offering_status",
  );

  const rows: any[] = [];

  for (const school of schools) {
    const key = `federal_data:${school.id}:`;
    if (!have.has(key)) {
      rows.push({ university_id: school.id, stage: "federal_data" });
      created.federal_data += 1;
    }
  }

  for (const program of programs) {
    if (program.offering_status === "not_offered") continue;

    const discoveryKey = `url_discovery:${program.university_id}:${program.id}`;
    if (!have.has(discoveryKey) && !program.roster_url) {
      rows.push({
        university_id: program.university_id,
        program_id: program.id,
        stage: "url_discovery",
      });
      created.url_discovery += 1;
    }

    const scrapeKey = `program_scrape:${program.university_id}:${program.id}`;
    if (!have.has(scrapeKey)) {
      rows.push({
        university_id: program.university_id,
        program_id: program.id,
        stage: "program_scrape",
      });
      created.program_scrape += 1;
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("ingest_queue").insert(chunk);
    if (!error) continue;
    // The stage keys are partial unique indexes, so a duplicate can't be
    // upserted away. A race (or a row created since the read) is simply
    // already-queued work: retry one at a time and skip those.
    if (!/duplicate key/i.test(error.message)) throw new Error(error.message);
    for (const row of chunk) {
      const { error: rowError } = await supabase.from("ingest_queue").insert(row);
      if (rowError && !/duplicate key/i.test(rowError.message)) throw new Error(rowError.message);
    }
  }

  return created;
}


/**
 * Put every confirmed team that still has no official roster page or staff page
 * back in line to have those pages found. Unlike enqueueMissingWork this revives
 * finished/failed rows, because "we looked once and found nothing" is exactly the
 * case that needs another try — nothing else can be filled in without a page.
 */
export async function requeueMissingLinkWork(
  supabase: any,
): Promise<{ programs: number; revived: number; created: number }> {
  const programs = (
    await fetchAll(
      supabase,
      "programs",
      "id, university_id, roster_url, coaching_staff_url, offering_status",
    )
  ).filter(
    (program) =>
      program.offering_status === "verified" &&
      (!program.roster_url?.trim() || !program.coaching_staff_url?.trim()),
  );
  if (!programs.length) return { programs: 0, revived: 0, created: 0 };

  const existing = await fetchAll(supabase, "ingest_queue", "id, program_id, stage, status");
  const discoveryByProgram = new Map<string, { id: string; status: string }>();
  for (const row of existing) {
    if (row.stage !== "url_discovery" || !row.program_id) continue;
    discoveryByProgram.set(row.program_id, { id: row.id, status: row.status });
  }

  const reviveIds: string[] = [];
  const inserts: any[] = [];
  for (const program of programs) {
    const row = discoveryByProgram.get(program.id);
    if (!row) {
      inserts.push({
        university_id: program.university_id,
        program_id: program.id,
        stage: "url_discovery",
        status: "pending",
      });
      continue;
    }
    // Leave work that is already lined up or in flight alone.
    if (row.status === "pending" || row.status === "running" || row.status === "held") continue;
    reviveIds.push(row.id);
  }

  for (let i = 0; i < reviveIds.length; i += 200) {
    const chunk = reviveIds.slice(i, i + 200);
    const { error } = await supabase
      .from("ingest_queue")
      .update({
        status: "pending",
        attempts: 0,
        leased_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", chunk);
    if (error) throw new Error(error.message);
  }

  for (const row of inserts) {
    const { error } = await supabase.from("ingest_queue").insert(row);
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  }

  return { programs: programs.length, revived: reviveIds.length, created: inserts.length };
}


 * Claim up to `limit` items for one stage. Leasing is best-effort optimistic:
 * we re-check the status on update, so a row another run already took is
 * dropped rather than worked twice.
 */
export async function leaseQueueItems(
  supabase: any,
  stage: QueueStage,
  limit: number,
): Promise<QueueItem[]> {
  const staleBefore = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("ingest_queue")
    .select("id, university_id, program_id, stage, status, attempts, last_error, leased_at")
    .eq("stage", stage)
    .in("status", ["pending", "failed", "running"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit * 3);
  if (error) throw new Error(error.message);

  const claimed: QueueItem[] = [];
  for (const row of (candidates ?? []) as any[]) {
    if (claimed.length >= limit) break;
    if (row.status === "running" && row.leased_at && row.leased_at > staleBefore) continue;

    const { data: updated, error: leaseError } = await supabase
      .from("ingest_queue")
      .update({
        status: "running",
        leased_at: new Date().toISOString(),
        attempts: (row.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id, university_id, program_id, stage, status, attempts, last_error")
      .maybeSingle();
    if (leaseError) throw new Error(leaseError.message);
    if (updated) claimed.push(updated as QueueItem);
  }

  return claimed;
}

export async function completeQueueItem(supabase: any, id: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ingest_queue")
    .update({ status: "done", last_error: null, leased_at: null, last_success_at: now, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** A failure that a human has to resolve (an ambiguous match, say) parks here. */
export async function failQueueItem(supabase: any, id: string, message: string, blocked = false) {
  const { error } = await supabase
    .from("ingest_queue")
    .update({
      status: blocked ? "blocked" : "failed",
      last_error: message.slice(0, 500),
      leased_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type CoverageRow = { stage: QueueStage; pending: number; running: number; done: number; failed: number; blocked: number };

/** Counts per stage for the coverage dashboard. */
export async function queueCoverage(supabase: any): Promise<CoverageRow[]> {
  const data = await fetchAll(supabase, "ingest_queue", "id, stage, status");


  const base = () => ({ pending: 0, running: 0, done: 0, failed: 0, blocked: 0 });
  const byStage = new Map<QueueStage, ReturnType<typeof base>>();
  for (const stage of QUEUE_STAGES) byStage.set(stage, base());

  for (const row of (data ?? []) as { stage: QueueStage; status: string }[]) {
    const bucket = byStage.get(row.stage);
    if (!bucket) continue;
    if (row.status in bucket) (bucket as any)[row.status] += 1;
  }

  return QUEUE_STAGES.map((stage) => ({ stage, ...byStage.get(stage)! }));
}
