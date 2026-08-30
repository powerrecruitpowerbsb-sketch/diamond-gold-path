/**
 * Server-only seed logic: one shared path that matches (or creates) a school and
 * then creates/updates its baseball or softball program. Both the bulk CSV
 * importer and single-record admin creates call `upsertUniversityAndProgram`.
 */

import { GOVERNING_BODIES, SPORTS, US_STATES } from "@/lib/admin-schemas";

export type SeedRowInput = {
  universityName: string;
  state: string | null;
  sport: string;
  governingBody?: string | null;
  division?: string | null;
  conference?: string | null;
  /** Bulk seeds are skeletons; the guided wizard marks entered sports verified. */
  offeringStatus?: "unverified" | "verified" | "not_offered";
  /** Skip name matching when the caller already knows the school. */
  universityId?: string | null;
};

export type SchoolIndexEntry = { id: string; name: string; state: string | null };

export type UpsertOutcome = {
  universityId: string;
  programId: string;
  universityCreated: boolean;
  programCreated: boolean;
  programUpdated: boolean;
};

/** "Univ. of St. Mary's" and "University of St Marys" must match each other. */
export function normalizeSchoolName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\buniv\b\.?/g, "university")
    .replace(/\bcc\b/g, "community college")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeState(state: unknown): string | null {
  const text = String(state ?? "").trim().toUpperCase();
  return (US_STATES as readonly string[]).includes(text) ? text : null;
}

export function normalizeSport(sport: unknown): string | null {
  const text = String(sport ?? "").trim().toLowerCase();
  return (SPORTS as readonly string[]).includes(text) ? text : null;
}

export function normalizeGoverningBody(body: unknown): string | null {
  const text = String(body ?? "").trim().toUpperCase();
  if (!text) return null;
  return (GOVERNING_BODIES as readonly string[]).includes(text) ? text : null;
}

export type ValidatedRow = {
  index: number;
  universityName: string;
  state: string | null;
  sport: string | null;
  governingBody: string | null;
  division: string | null;
  conference: string | null;
  errors: string[];
};

/** Turn one raw CSV row into a checked row, with plain-language problems listed. */
export function validateSeedRow(raw: Partial<SeedRowInput> & { index: number }): ValidatedRow {
  const errors: string[] = [];
  const universityName = String(raw.universityName ?? "").trim();
  if (!universityName) errors.push("School name is missing");

  const state = normalizeState(raw.state);
  if (!state) errors.push("State must be a two-letter US state code");

  const sport = normalizeSport(raw.sport);
  if (!sport) errors.push("Sport must be baseball or softball");

  const rawBody = String(raw.governingBody ?? "").trim();
  const governingBody = normalizeGoverningBody(rawBody);
  if (rawBody && !governingBody) {
    errors.push(`Governing body must be one of ${GOVERNING_BODIES.join(", ")}`);
  }

  return {
    index: raw.index,
    universityName,
    state,
    sport,
    governingBody,
    division: String(raw.division ?? "").trim() || null,
    conference: String(raw.conference ?? "").trim() || null,
    errors,
  };
}

/**
 * Load every school once so a large batch doesn't query per row. Paged, because
 * the Data API caps one response at 1,000 rows and a truncated index would
 * happily create a second copy of a school we already have.
 */
export async function loadSchoolIndex(supabase: any): Promise<SchoolIndexEntry[]> {
  const page = 1000;
  const out: SchoolIndexEntry[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("universities")
      .select("id, name, state")
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SchoolIndexEntry[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}


export function findSchool(
  index: SchoolIndexEntry[],
  name: string,
  state: string | null,
): SchoolIndexEntry | null {
  const key = normalizeSchoolName(name);
  if (!key) return null;
  const sameName = index.filter((row) => normalizeSchoolName(row.name) === key);
  if (!sameName.length) return null;
  if (state) {
    const inState = sameName.find((row) => (row.state ?? "").toUpperCase() === state);
    if (inState) return inState;
    // Same name in a different state is a different school.
    if (sameName.every((row) => row.state)) return null;
  }
  return sameName[0] ?? null;
}

/**
 * The single shared path: find or create the school, then create or update its
 * program for this sport. Safe to call per CSV row or from a single-record form.
 */
export async function upsertUniversityAndProgram(
  supabase: any,
  input: SeedRowInput,
  index?: SchoolIndexEntry[],
): Promise<UpsertOutcome> {
  const name = String(input.universityName ?? "").trim();
  const state = normalizeState(input.state);
  const sport = normalizeSport(input.sport);
  if (!sport) throw new Error("Sport must be baseball or softball");

  let universityId = input.universityId ?? null;
  let universityCreated = false;

  if (!universityId) {
    if (!name) throw new Error("School name is required");
    const schools = index ?? (await loadSchoolIndex(supabase));
    const match = findSchool(schools, name, state);
    if (match) {
      universityId = match.id;
    } else {
      // Skeleton only: name + state. Everything else waits for enrichment.
      const { data: inserted, error } = await supabase
        .from("universities")
        .insert({ name, state })
        .select("id, name, state")
        .single();
      if (error) throw new Error(error.message);
      universityId = (inserted as { id: string }).id;
      universityCreated = true;
      if (index) index.push(inserted as SchoolIndexEntry);
    }
  }

  const { data: existingProgram, error: programLookupError } = await supabase
    .from("programs")
    .select("id, governing_body, division, conference, offering_status")
    .eq("university_id", universityId)
    .eq("sport", sport)
    .maybeSingle();
  if (programLookupError) throw new Error(programLookupError.message);

  const patch: Record<string, unknown> = {};
  const body = normalizeGoverningBody(input.governingBody);
  if (body) patch["governing_body"] = body;
  if (input.division) patch["division"] = String(input.division).trim();
  if (input.conference) patch["conference"] = String(input.conference).trim();
  if (input.offeringStatus) patch["offering_status"] = input.offeringStatus;

  if (existingProgram) {
    const programId = (existingProgram as { id: string }).id;
    const changed = Object.entries(patch).filter(
      ([field, value]) => (existingProgram as any)[field] !== value,
    );
    if (changed.length) {
      const { error } = await supabase
        .from("programs")
        .update(Object.fromEntries(changed))
        .eq("id", programId);
      if (error) throw new Error(error.message);
    }
    return {
      universityId: universityId!,
      programId,
      universityCreated,
      programCreated: false,
      programUpdated: changed.length > 0,
    };
  }

  const { data: insertedProgram, error: insertError } = await supabase
    .from("programs")
    .insert({
      university_id: universityId,
      sport,
      offering_status: input.offeringStatus ?? "unverified",
      ...patch,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  return {
    universityId: universityId!,
    programId: (insertedProgram as { id: string }).id,
    universityCreated,
    programCreated: true,
    programUpdated: false,
  };
}
