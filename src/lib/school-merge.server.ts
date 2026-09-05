/**
 * Two ways out of a "this national record is already taken" conflict:
 * combine the duplicate school into the one that holds the record, or record
 * that the school shares its parent institution's record.
 */

export type MergePreview = {
  duplicateId: string;
  duplicateName: string;
  keeperId: string;
  keeperName: string;
  programs: number;
  rosterPlayers: number;
  shortlists: number;
  notes: number;
};

/** Who already holds a national record, if anyone. */
export async function federalRecordOwner(
  supabase: any,
  unitid: number,
  exceptUniversityId?: string,
): Promise<{ id: string; name: string } | null> {
  let query = supabase.from("universities").select("id, name").eq("ipeds_unitid", unitid).limit(1);
  if (exceptUniversityId) query = query.neq("id", exceptUniversityId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: String((data as any).id), name: String((data as any).name ?? "") } : null;
}

const ids = (rows: any[]): string[] => rows.map((row) => String(row.id));

/** What a combine would move, so a human can see it before confirming. */
export async function previewMerge(
  supabase: any,
  duplicateId: string,
  keeperId: string,
): Promise<MergePreview> {
  const [{ data: duplicate }, { data: keeper }] = await Promise.all([
    supabase.from("universities").select("id, name").eq("id", duplicateId).single(),
    supabase.from("universities").select("id, name").eq("id", keeperId).single(),
  ]);
  const { data: programs } = await supabase.from("programs").select("id").eq("university_id", duplicateId);
  const programIds = ids((programs ?? []) as any[]);

  const count = async (table: string, column: string) => {
    if (!programIds.length) return 0;
    const { count: total } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, programIds);
    return total ?? 0;
  };

  const [rosterPlayers, shortlists, notes] = await Promise.all([
    count("roster_players", "program_id"),
    count("athlete_saved_schools", "program_id"),
    count("recruiting_intelligence", "program_id"),
  ]);

  return {
    duplicateId,
    duplicateName: String((duplicate as any)?.name ?? ""),
    keeperId,
    keeperName: String((keeper as any)?.name ?? ""),
    programs: programIds.length,
    rosterPlayers,
    shortlists,
    notes,
  };
}

/** How much collected data a program carries — used to pick the survivor. */
async function programWeight(supabase: any, programId: string): Promise<number> {
  const one = async (table: string) => {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId);
    return count ?? 0;
  };
  const [players, snapshots] = await Promise.all([one("roster_players"), one("roster_snapshots")]);
  return players + snapshots;
}

/** Move everything hanging off `fromProgram` onto `toProgram`, then drop it. */
async function foldProgram(supabase: any, fromProgram: string, toProgram: string) {
  for (const table of ["roster_players", "roster_snapshots"] as const) {
    const { error } = await supabase.from(table).update({ program_id: toProgram }).eq("program_id", fromProgram);
    if (error) throw new Error(error.message);
  }

  // These carry uniqueness per program, so an entry that already exists on the
  // survivor wins and the duplicate's copy is dropped.
  const { data: keptSaved } = await supabase
    .from("athlete_saved_schools")
    .select("org_athlete_id")
    .eq("program_id", toProgram);
  const keptAthletes = new Set(((keptSaved ?? []) as any[]).map((row) => String(row.org_athlete_id)));
  const { data: dupSaved } = await supabase
    .from("athlete_saved_schools")
    .select("id, org_athlete_id")
    .eq("program_id", fromProgram);
  for (const row of (dupSaved ?? []) as any[]) {
    if (keptAthletes.has(String(row.org_athlete_id))) {
      await supabase.from("athlete_saved_schools").delete().eq("id", row.id);
    } else {
      await supabase.from("athlete_saved_schools").update({ program_id: toProgram }).eq("id", row.id);
    }
  }

  const { data: keptIntel } = await supabase
    .from("recruiting_intelligence")
    .select("field_type")
    .eq("program_id", toProgram);
  const keptFields = new Set(((keptIntel ?? []) as any[]).map((row) => String(row.field_type)));
  const { data: dupIntel } = await supabase
    .from("recruiting_intelligence")
    .select("id, field_type")
    .eq("program_id", fromProgram);
  for (const row of (dupIntel ?? []) as any[]) {
    if (keptFields.has(String(row.field_type))) {
      await supabase.from("recruiting_intelligence").delete().eq("id", row.id);
    } else {
      await supabase.from("recruiting_intelligence").update({ program_id: toProgram }).eq("id", row.id);
    }
  }

  // One relationship record per program; the survivor's wins, and the
  // duplicate's contact history moves onto it.
  const { data: keptRel } = await supabase
    .from("program_relationships")
    .select("id")
    .eq("program_id", toProgram)
    .maybeSingle();
  const { data: dupRel } = await supabase
    .from("program_relationships")
    .select("id")
    .eq("program_id", fromProgram)
    .maybeSingle();
  if (dupRel) {
    if (keptRel) {
      await supabase
        .from("interaction_log")
        .update({ relationship_id: (keptRel as any).id })
        .eq("relationship_id", (dupRel as any).id);
      await supabase.from("program_relationships").delete().eq("id", (dupRel as any).id);
    } else {
      await supabase.from("program_relationships").update({ program_id: toProgram }).eq("id", (dupRel as any).id);
    }
  }

  for (const table of ["ingest_queue", "url_discovery_queue", "ingestion_runs"] as const) {
    const { error } = await supabase.from(table).delete().eq("program_id", fromProgram);
    if (error) throw new Error(error.message);
  }
  await supabase.from("pending_data_changes").delete().eq("table_name", "programs").eq("record_id", fromProgram);

  const { error: dropError } = await supabase.from("programs").delete().eq("id", fromProgram);
  if (dropError) throw new Error(dropError.message);
}

/**
 * Combine a duplicate school into the school that already holds the national
 * record. The keeper survives; the duplicate's teams and collected data move
 * across and the duplicate row is removed.
 */
export async function mergeSchools(
  supabase: any,
  userId: string,
  duplicateId: string,
  keeperId: string,
): Promise<MergePreview> {
  if (duplicateId === keeperId) throw new Error("Those are the same school");
  const preview = await previewMerge(supabase, duplicateId, keeperId);

  const { data: keeperPrograms } = await supabase
    .from("programs")
    .select("id, sport")
    .eq("university_id", keeperId);
  const keeperBySport = new Map<string, string>(
    ((keeperPrograms ?? []) as any[]).map((row) => [String(row.sport), String(row.id)]),
  );

  const { data: dupPrograms } = await supabase
    .from("programs")
    .select("id, sport")
    .eq("university_id", duplicateId);

  for (const program of (dupPrograms ?? []) as any[]) {
    const sport = String(program.sport);
    const rival = keeperBySport.get(sport);
    if (!rival) {
      const { error } = await supabase
        .from("programs")
        .update({ university_id: keeperId })
        .eq("id", program.id);
      if (error) throw new Error(error.message);
      keeperBySport.set(sport, String(program.id));
      continue;
    }
    // Whichever side collected more roster data is the one worth keeping.
    const [dupWeight, rivalWeight] = await Promise.all([
      programWeight(supabase, String(program.id)),
      programWeight(supabase, rival),
    ]);
    if (dupWeight > rivalWeight) {
      await foldProgram(supabase, rival, String(program.id));
      await supabase.from("programs").update({ university_id: keeperId }).eq("id", program.id);
      keeperBySport.set(sport, String(program.id));
    } else {
      await foldProgram(supabase, String(program.id), rival);
    }
  }

  for (const table of ["ingest_queue", "url_discovery_queue"] as const) {
    const { error } = await supabase.from(table).delete().eq("university_id", duplicateId);
    if (error) throw new Error(error.message);
  }
  await supabase.from("pending_data_changes").delete().eq("table_name", "universities").eq("record_id", duplicateId);
  await supabase.from("university_majors").delete().eq("university_id", duplicateId);
  await supabase.from("classifications").delete().eq("university_id", duplicateId);

  const { error: dropError } = await supabase.from("universities").delete().eq("id", duplicateId);
  if (dropError) throw new Error(dropError.message);

  await supabase.from("audit_log").insert({
    actor_id: userId,
    table_name: "universities",
    record_id: keeperId,
    field_name: "merged_duplicate",
    old_value: preview.duplicateName,
    new_value: preview.keeperName,
    action: "override",
  });

  return preview;
}

/**
 * Record that a school shares its parent institution's national record, copy
 * the parent's federal facts across, and take it out of the decision list.
 */
export async function linkSharedFederalRecord(
  supabase: any,
  userId: string,
  universityId: string,
  unitid: number,
): Promise<{ schoolName: string; parentName: string; fieldsApplied: number }> {
  const owner = await federalRecordOwner(supabase, unitid, universityId);
  if (!owner) throw new Error("No other school holds that national record");

  const { data: school, error } = await supabase
    .from("universities")
    .select("*")
    .eq("id", universityId)
    .single();
  if (error) throw new Error(error.message);
  const { data: parent } = await supabase.from("universities").select("*").eq("id", owner.id).single();

  // Only blanks are filled, so anything already verified on this campus stays.
  const SHARED_FIELDS = [
    "city",
    "state",
    "region",
    "campus_setting",
    "undergrad_enrollment",
    "school_size_bucket",
    "public_private",
    "religious_affiliation",
    "religious_tradition",
    "website_url",
    "admissions_url",
    "avg_gpa",
    "avg_sat",
    "avg_act",
    "acceptance_rate",
    "test_optional",
    "graduation_rate",
    "student_faculty_ratio",
    "tuition_in_state",
    "tuition_out_state",
    "room_board",
    "est_cost_of_attendance",
    "est_net_price",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const field of SHARED_FIELDS) {
    const current = (school as any)[field];
    const next = (parent as any)?.[field];
    const blank = current === null || current === undefined || current === "";
    if (blank && next !== null && next !== undefined && next !== "") patch[field] = next;
  }

  const { error: updateError } = await supabase
    .from("universities")
    .update({
      ...patch,
      federal_match_status: "not_in_federal",
      federal_match_name: `Shares a national record with ${owner.name}`,
      federal_synced_at: new Date().toISOString(),
    })
    .eq("id", universityId);
  if (updateError) throw new Error(updateError.message);

  await supabase
    .from("ingest_queue")
    .update({ status: "done", last_error: null, attempts: 0, updated_at: new Date().toISOString() })
    .eq("university_id", universityId)
    .eq("stage", "federal_data");

  await supabase.from("audit_log").insert({
    actor_id: userId,
    table_name: "universities",
    record_id: universityId,
    field_name: "shared_federal_record",
    old_value: null,
    new_value: owner.name,
    action: "override",
  });

  return {
    schoolName: String((school as any).name ?? ""),
    parentName: owner.name,
    fieldsApplied: Object.keys(patch).length,
  };
}
