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

  return result;
}

/** How much work is waiting, level by level, so the next wave is an informed choice. */
export async function waveProgress(
  supabase: any,
): Promise<{ key: WaveKey; label: string; waiting: number; held: number }[]> {
  const programs = await allPrograms(supabase);
  const byProgram = new Map(programs.map((p) => [p.id, p]));

  const counts = new Map<WaveKey, { waiting: number; held: number }>();
  for (const wave of WAVES) counts.set(wave.key, { waiting: 0, held: 0 });

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("ingest_queue")
      .select("program_id, status")
      .in("status", [...RELEASABLE, "running"])
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { program_id: string | null; status: string }[];
    for (const row of page) {
      if (!row.program_id) continue;
      const program = byProgram.get(row.program_id);
      if (!program) continue;
      for (const wave of WAVES) {
        if (wave.key === "all") continue;
        if (!inWave(wave.key, program.governing_body, program.division)) continue;
        const bucket = counts.get(wave.key)!;
        if (row.status === HELD) bucket.held += 1;
        else bucket.waiting += 1;
      }
    }
    if (page.length < 1000) break;
  }

  return WAVES.filter((wave) => wave.key !== "all").map((wave) => ({
    key: wave.key,
    label: wave.label,
    ...counts.get(wave.key)!,
  }));
}
