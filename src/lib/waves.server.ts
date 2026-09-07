/**
 * Waves: collect the country one competition level at a time.
 *
 * The queue itself has no notion of order, so a wave is enforced by holding back
 * every waiting job outside the wave and releasing the ones inside it. Held jobs
 * keep their place — nothing is deleted, and switching wave (or choosing
 * "everything") simply releases them again.
 */

const HELD = "held";
const RELEASABLE = ["pending", "failed", HELD];

export type WaveKey =
  | "all"
  | "ncaa-d1"
  | "ncaa-d2"
  | "ncaa-d3"
  | "naia"
  | "njcaa"
  | "cccaa"
  | "nwac";

export const WAVES: { key: WaveKey; label: string }[] = [
  { key: "ncaa-d1", label: "NCAA Division I" },
  { key: "ncaa-d2", label: "NCAA Division II" },
  { key: "ncaa-d3", label: "NCAA Division III" },
  { key: "naia", label: "NAIA" },
  { key: "njcaa", label: "NJCAA" },
  { key: "cccaa", label: "CCCAA (California)" },
  { key: "nwac", label: "NWAC (Northwest)" },
  { key: "all", label: "Everything at once" },
];

/** Does this program belong to the wave? */
function inWave(wave: WaveKey, body: string | null, division: string | null): boolean {
  if (wave === "all") return true;
  const governing = (body ?? "").toUpperCase();
  const div = (division ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  switch (wave) {
    case "ncaa-d1":
      return governing === "NCAA" && /^(D?1|I)$/.test(div);
    case "ncaa-d2":
      return governing === "NCAA" && /^(D?2|II)$/.test(div);
    case "ncaa-d3":
      return governing === "NCAA" && /^(D?3|III)$/.test(div);
    case "naia":
      return governing === "NAIA";
    case "njcaa":
      return governing === "NJCAA";
    case "cccaa":
      return governing === "CCCAA";
    case "nwac":
      return governing === "NWAC";
    default:
      return false;
  }
}

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function allPrograms(supabase: any) {
  const rows: { id: string; governing_body: string | null; division: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("programs")
      .select("id, governing_body, division")
      .neq("offering_status", "not_offered")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export type WaveResult = {
  wave: WaveKey;
  released: number;
  held: number;
  waitingInWave: number;
};

/**
 * Make `wave` the only work the run will pick up. Jobs for other levels are set
 * aside; jobs for this level are put back in line.
 */
export async function setCollectionWave(supabase: any, wave: WaveKey): Promise<WaveResult> {
  const programs = await allPrograms(supabase);
  const inside = programs.filter((p) => inWave(wave, p.governing_body, p.division)).map((p) => p.id);
  const outside = programs.filter((p) => !inWave(wave, p.governing_body, p.division)).map((p) => p.id);

  const result: WaveResult = { wave, released: 0, held: 0, waitingInWave: 0 };

  // Release this wave's work.
  for (const ids of chunk(inside, 200)) {
    const { data, error } = await supabase
      .from("ingest_queue")
      .update({ status: "pending", leased_at: null, updated_at: new Date().toISOString() })
      .in("program_id", ids)
      .eq("status", HELD)
      .select("id");
    if (error) throw new Error(error.message);
    result.released += (data ?? []).length;
  }

  // Hold everything else that is still waiting.
  if (wave !== "all") {
    for (const ids of chunk(outside, 200)) {
      const { data, error } = await supabase
        .from("ingest_queue")
        .update({ status: HELD, leased_at: null, updated_at: new Date().toISOString() })
        .in("program_id", ids)
        .in("status", ["pending", "failed"])
        .select("id");
      if (error) throw new Error(error.message);
      result.held += (data ?? []).length;
    }
  }

  for (const ids of chunk(inside, 200)) {
    const { count, error } = await supabase
      .from("ingest_queue")
      .select("id", { count: "exact", head: true })
      .in("program_id", ids)
      .in("status", RELEASABLE.filter((status) => status !== HELD));
    if (error) throw new Error(error.message);
    result.waitingInWave += count ?? 0;
  }

  // Remember the choice so the scheduled runner and the screen agree.
  await supabase
    .from("collection_state")
    .update({ current_wave: wave, updated_at: new Date().toISOString() })
    .eq("id", "singleton");

  return result;
}

export type WaveStatus = {
  key: WaveKey;
  label: string;
  /** Still in line for this level (includes anything in flight). */
  waiting: number;
  /** Set aside until this level's turn. */
  held: number;
  /** Being worked on right this second. */
  running: number;
  /** Finished for this level. */
  done: number;
  /** Tried the full three times and never worked — needs a person, not another pass. */
  givenUp: number;
  /** Every job this level has, finished or not. */
  total: number;
  complete: boolean;
};

export type WaveBoard = {
  levels: WaveStatus[];
  /** The level whose work is released right now, if any. */
  currentWave: WaveKey | null;
  /** The level that would come next in order, if any work is left there. */
  nextWave: WaveKey | null;
  autoAdvance: boolean;
  /** Jobs finished in the last ten minutes, as a per-minute pace. */
  perMinute: number;
};

const labelOf = (key: WaveKey) => WAVES.find((wave) => wave.key === key)?.label ?? key;

/** The next level in order that still has work left. */
export function nextWaveWithWork(levels: WaveStatus[], after: WaveKey | null): WaveKey | null {
  const order = WAVES.filter((wave) => wave.key !== "all").map((wave) => wave.key);
  const start = after ? order.indexOf(after) + 1 : 0;
  for (let i = Math.max(start, 0); i < order.length; i += 1) {
    const key = order[i]!;
    const level = levels.find((entry) => entry.key === key);
    if (level && !level.complete) return key;
  }

  // Fall back to any earlier level still holding work.
  for (const key of order) {
    const level = levels.find((entry) => entry.key === key);
    if (level && !level.complete) return key;
  }
  return null;
}

/** How much work is waiting, level by level, so the next wave is an informed choice. */
export async function waveProgress(supabase: any): Promise<WaveBoard> {
  const programs = await allPrograms(supabase);
  const byProgram = new Map(programs.map((p) => [p.id, p]));

  const counts = new Map<
    WaveKey,
    { waiting: number; held: number; running: number; done: number; givenUp: number }
  >();
  for (const wave of WAVES) counts.set(wave.key, { waiting: 0, held: 0, running: 0, done: 0, givenUp: 0 });

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("ingest_queue")
      .select("program_id, status, attempts")
      .in("status", [...RELEASABLE, "running", "done", "skipped", "blocked"])
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { program_id: string | null; status: string; attempts: number | null }[];
    for (const row of page) {
      if (!row.program_id) continue;
      const program = byProgram.get(row.program_id);
      if (!program) continue;
      // Three tries is the limit, so a job at that count is never picked up
      // again. Counting it as "still to do" would keep its level unfinished for
      // good and the run would never move on.
      const exhausted =
        (row.attempts ?? 0) >= MAX_ATTEMPTS &&
        (row.status === "pending" || row.status === "failed" || row.status === HELD);
      for (const wave of WAVES) {
        if (wave.key === "all") continue;
        if (!inWave(wave.key, program.governing_body, program.division)) continue;
        const bucket = counts.get(wave.key)!;
        if (exhausted) bucket.givenUp += 1;
        else if (row.status === HELD) bucket.held += 1;
        else if (row.status === "running") bucket.running += 1;
        else if (row.status === "pending" || row.status === "failed") bucket.waiting += 1;
        else bucket.done += 1;
      }
    }
    if (page.length < 1000) break;
  }

  const levels: WaveStatus[] = WAVES.filter((wave) => wave.key !== "all").map((wave) => {
    const bucket = counts.get(wave.key)!;
    const waiting = bucket.waiting + bucket.running;
    return {
      key: wave.key,
      label: wave.label,
      waiting,
      held: bucket.held,
      running: bucket.running,
      done: bucket.done,
      givenUp: bucket.givenUp,
      total: waiting + bucket.held + bucket.done + bucket.givenUp,
      complete: waiting === 0 && bucket.held === 0,
    };
  });

  const { data: stateRow } = await supabase
    .from("collection_state")
    .select("current_wave, auto_advance")
    .eq("id", "singleton")
    .maybeSingle();
  const stored = (stateRow as { current_wave?: string | null; auto_advance?: boolean } | null) ?? null;

  const storedWave = (stored?.current_wave ?? null) as WaveKey | null;
  const currentWave =
    storedWave && levels.some((level) => level.key === storedWave)
      ? storedWave
      : (levels.find((level) => level.waiting > 0)?.key ?? null);

  const { count: recent } = await supabase
    .from("ingest_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .gte("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  return {
    levels,
    currentWave,
    nextWave: nextWaveWithWork(levels, currentWave),
    autoAdvance: stored?.auto_advance !== false,
    perMinute: Math.round(((recent ?? 0) / 10) * 10) / 10,
  };
}

/** Turn "work through the levels in order" on or off. */
export async function setAutoAdvance(supabase: any, on: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("collection_state")
    .update({ auto_advance: on, updated_at: new Date().toISOString() })
    .eq("id", "singleton");
  if (error) throw new Error(error.message);
  return on;
}

/**
 * Called when a pass finds nothing: release the next level in order and say
 * which one it was, or null when the whole country is done.
 */
export async function advanceToNextWave(supabase: any): Promise<{ wave: WaveKey; label: string } | null> {
  const board = await waveProgress(supabase);
  const next = nextWaveWithWork(board.levels, board.currentWave);
  if (!next) return null;
  await setCollectionWave(supabase, next);
  return { wave: next, label: labelOf(next) };
}

