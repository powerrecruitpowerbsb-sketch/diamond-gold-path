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

  const { data: existing, error: existingError } = await supabase
    .from("ingest_queue")
    .select("university_id, program_id, stage");
  if (existingError) throw new Error(existingError.message);

  const have = new Set(
    ((existing ?? []) as any[]).map(
      (row) => `${row.stage}:${row.university_id ?? ""}:${row.program_id ?? ""}`,
    ),
  );

  const { data: schools, error: schoolError } = await supabase
    .from("universities")
    .select("id, federal_match_status");
  if (schoolError) throw new Error(schoolError.message);

  const { data: programs, error: programError } = await supabase
    .from("programs")
    .select("id, university_id, roster_url, athletic_website, offering_status");
  if (programError) throw new Error(programError.message);

  const rows: any[] = [];

  for (const school of (schools ?? []) as any[]) {
    const key = `federal_data:${school.id}:`;
    if (!have.has(key)) {
      rows.push({ university_id: school.id, stage: "federal_data" });
      created.federal_data += 1;
    }
  }

  for (const program of (programs ?? []) as any[]) {
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
    const { error } = await supabase.from("ingest_queue").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  return created;
}

/**
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
  const { data, error } = await supabase.from("ingest_queue").select("stage, status");
  if (error) throw new Error(error.message);

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
