/** Server-only logic for the superadmin data review queue. */

import { PROGRAM_FIELD_NAMES, UNIVERSITY_FIELD_NAMES } from "@/lib/admin-schemas";
import { COACH_FIELDS, coachEvidenceVerdict } from "@/lib/coach-quality";
import {
  coerceForColumn,
  fieldValueSane,
  isEmptyValue,
  normalizePosition,
  plausibleSeasonYear,
  rosterKeepable,
  rosterVerdict,
  valuesEquivalent,
} from "@/lib/data-quality";
import { markJucoTransfers, twoYearSchoolNames } from "@/lib/juco-transfer.server";
import { rejectionKey } from "@/lib/rejected-memory";
import { checkRosterSource, recordRefusal } from "@/lib/roster-provenance.server";
import { canonicalSeasonYear, currentSeasonYear } from "@/lib/season";



export const REVIEW_TABLES = ["universities", "programs", "roster_players"] as const;
export type ReviewTable = (typeof REVIEW_TABLES)[number];

/** Tables whose live records are edited field-by-field. */
const FIELD_TABLES = ["universities", "programs"] as const;

const EXTRA_UNIVERSITY_FIELDS = ["last_verified_at"];
const EXTRA_PROGRAM_FIELDS = ["university_id", "sport", "last_roster_pull_at", "last_verified_at"];

export function allowedFields(table: string): string[] {
  if (table === "universities") return [...UNIVERSITY_FIELD_NAMES, ...EXTRA_UNIVERSITY_FIELDS];
  if (table === "programs") return [...PROGRAM_FIELD_NAMES, ...EXTRA_PROGRAM_FIELDS];
  return [];
}

function assertReviewable(table: string) {
  if (!REVIEW_TABLES.includes(table as ReviewTable)) {
    throw new Error(`Unsupported table for review: ${table}`);
  }
}

/** Unwrap a jsonb proposed_value into the raw scalar for a single-field proposal. */
export function unwrapFieldValue(fieldName: string, proposed: unknown): unknown {
  if (proposed && typeof proposed === "object" && !Array.isArray(proposed)) {
    const obj = proposed as Record<string, unknown>;
    if (fieldName in obj) return obj[fieldName];
    if ("value" in obj) return obj["value"];
  }
  return proposed;
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type PendingRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  field_name: string | null;
  proposed_value: Json;
  source_url: string | null;
  source_type: string;
  ai_confidence: number | null;
  status: string;
  created_at: string;
};

async function upsertSource(
  supabase: any,
  tableName: string,
  recordId: string,
  fieldName: string,
  sourceUrl: string | null,
  sourceType: string,
  verifiedBy: string,
) {
  const { error } = await supabase.from("data_field_sources").upsert(
    [
      {
        table_name: tableName,
        record_id: recordId,
        field_name: fieldName,
        source_url: sourceUrl || null,
        source_type: sourceType || "manual",
        last_verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
      },
    ],
    { onConflict: "table_name,record_id,field_name" },
  );
  if (error) throw new Error(error.message);
}

const POSITIONS = ["C", "1B", "2B", "3B", "SS", "MIF", "CIF", "OF", "UTIL", "RHP", "LHP", "TWO_WAY"];
const CLASS_YEARS = ["FR", "SO", "JR", "SR", "GR"];

function pickEnum(value: unknown, options: string[]): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return options.includes(text) ? text : null;
}

/**
 * Replace the stored roster for one program + season. Used by an approved
 * proposal and by the roster re-check, so both take exactly one path.
 *
 * A source page is REQUIRED: without it nothing can verify the players came
 * from a page belonging to this school, which is how wrong links silently
 * became wrong rosters. The source domain is checked against the school before
 * a single row is written; a domain another school holds is refused and parked
 * for review.
 */
export async function replaceRoster(
  supabase: any,
  payload: {
    program_id: string; season_year?: unknown; season_label?: unknown; players: any[];
    source_url: string; run_id?: string | null;
    /** Which reader read the page: "structural" (tested) or "ai" (fallback). */
    reader?: string | null;
  },
) {
  const players = Array.isArray(payload?.players) ? payload.players : null;
  const programId = payload?.program_id;
  if (!players || !players.length) throw new Error("Roster proposal contains no players");
  if (!programId) throw new Error("Roster proposal is missing its program");

  const sourceUrl = typeof payload?.source_url === "string" ? payload.source_url.trim() : "";
  if (!sourceUrl) throw new Error("Roster write refused: no source page was named");
  const verdict = await checkRosterSource(supabase, programId, sourceUrl);
  if (!verdict.ok) {
    await recordRefusal(supabase, {
      programId,
      kind: "roster",
      sourceUrl,
      domain: verdict.domain,
      reason: verdict.reason,
      holderId: verdict.holder?.id ?? null,
      holderDetail: verdict.holder?.name ?? null,
      rows: players.length,
    });
    throw new Error(`Roster write refused: ${verdict.reason}`);
  }
  const extractedAt = new Date().toISOString();
  // A season read off a jersey number or an archive page is not a season.
  const seasonYear = canonicalSeasonYear(payload?.season_year) ?? currentSeasonYear();
  const seasonLabel =
    typeof payload?.season_label === "string" && payload.season_label.trim()
      ? payload.season_label.trim().slice(0, 120)
      : null;

  // The junior-college half of the transfer flag is decided against our own
  // records, from the school the page named, never from the school's name alone.
  const previousSchools = [...new Set(players.map((p: any) => String(p?.previous_school ?? "").trim()).filter(Boolean))];
  const jucoNames = previousSchools.length
    ? await twoYearSchoolNames(supabase, previousSchools)
    : new Set<string>();
  const resolved = markJucoTransfers(players as any[], jucoNames);

  const rows = resolved.map((player: any) => {
    const position = pickEnum(normalizePosition(player?.position), POSITIONS);
    return {
      program_id: programId,
      season_year: seasonYear,
      season_label: seasonLabel,
      name: String(player?.name ?? "").trim(),

      position,
      class_year: pickEnum(player?.class_year, CLASS_YEARS),
      bats: pickEnum(player?.bats, ["R", "L", "S"]),
      throws: pickEnum(player?.throws, ["R", "L"]),
      hometown: player?.hometown ? String(player.hometown) : null,
      home_state: player?.home_state ? String(player.home_state).toUpperCase().slice(0, 2) : null,
      home_country: player?.home_country ? String(player.home_country).toUpperCase().slice(0, 2) : null,
      is_transfer: Boolean(player?.is_transfer),
      is_juco_transfer: Boolean(player?.is_juco_transfer),
      two_way: position === "TWO_WAY",
      source_url: sourceUrl,
      source_domain: verdict.domain,
      extracted_at: extractedAt,
      ingest_run_id: payload?.run_id ?? null,
      provenance: "traced",
      // Which reader read the page: the tested structural one, or the AI fallback.
      reader: payload?.reader === "ai" ? "ai" : "structural",
    };
  }).filter((r: { name: string }) => r.name);


  if (!rows.length) throw new Error("Roster proposal contains no named players");

  const { error: clearError } = await supabase
    .from("roster_players")
    .delete()
    .eq("program_id", programId)
    .eq("season_year", seasonYear);
  if (clearError) throw new Error(clearError.message);

  const { error: insertError } = await supabase.from("roster_players").insert(rows);
  if (insertError) throw new Error(insertError.message);
  return rows.length;
}

/**
 * A roster proposal replaces the stored roster for one program + season in a
 * single reviewed step, rather than one queue item per player.
 */
async function applyRosterProposal(supabase: any, row: PendingRow) {
  const payload = row.proposed_value as any;
  const sourceUrl = payload?.source_url ?? payload?.roster_url ?? row.source_url ?? "";
  await replaceRoster(supabase, {
    program_id: payload?.program_id ?? row.record_id,
    season_year: payload?.season_year,
    season_label: payload?.season_label,
    players: Array.isArray(payload?.players) ? payload.players : [],
    source_url: sourceUrl,
    run_id: payload?.run_id ?? null,
  });
}


/**
 * Apply one pending proposal to live data, then mark it approved.
 * Throws on any validation/write failure — the caller reports per-item results.
 */
export async function approvePending(supabase: any, userId: string, row: PendingRow) {
  assertReviewable(row.table_name);
  if (row.status !== "pending") throw new Error("Already reviewed");

  if (row.table_name === "roster_players") {
    await applyRosterProposal(supabase, row);
    const { error: rosterStatusError } = await supabase
      .from("pending_data_changes")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending");
    if (rosterStatusError) throw new Error(rosterStatusError.message);
    return { id: row.id, recordId: row.record_id };
  }

  const allowed = new Set(allowedFields(row.table_name));
  let recordId = row.record_id;

  if (row.field_name) {
    if (!recordId) throw new Error("Field change is missing a target record");
    if (!allowed.has(row.field_name)) throw new Error(`Field not writable: ${row.field_name}`);
    const value = unwrapFieldValue(row.field_name, row.proposed_value);
    const patch: Record<string, unknown> = {
      [row.field_name]: value === "" ? null : coerceForColumn(row.field_name, value),
    };

    /* Coach names carry the page they were read from, and that page must
       belong to this school — the same test the roster write applies. */
    if (row.table_name === "programs" && COACH_FIELDS.has(row.field_name)) {
      const coachSource = row.source_url ?? "";
      if (!coachSource) throw new Error("Coach write refused: no source page was named");
      const verdict = await checkRosterSource(supabase, recordId, coachSource);
      if (!verdict.ok) {
        await recordRefusal(supabase, {
          programId: recordId,
          kind: "coach",
          sourceUrl: coachSource,
          domain: verdict.domain,
          reason: verdict.reason,
          holderId: verdict.holder?.id ?? null,
          holderDetail: verdict.holder?.name ?? null,
          rows: 1,
        });
        throw new Error(`Coach write refused: ${verdict.reason}`);
      }
      patch["coach_source_url"] = coachSource;
      patch["coach_source_domain"] = verdict.domain;
      patch["coach_extracted_at"] = new Date().toISOString();
    }

    const { error } = await supabase
      .from(row.table_name)
      .update(patch)
      .eq("id", recordId);
    if (error) throw new Error(error.message);
    await upsertSource(
      supabase,
      row.table_name,
      recordId,
      row.field_name,
      row.source_url,
      row.source_type,
      userId,
    );
  } else {
    const proposed = row.proposed_value;
    if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
      throw new Error("Whole-record proposal must be an object");
    }
    const entries = Object.entries(proposed as Record<string, unknown>).filter(([key]) =>
      allowed.has(key),
    );
    if (!entries.length) throw new Error("Proposal contains no writable fields");
    const values = Object.fromEntries(entries);

    if (recordId) {
      const { error } = await supabase.from(row.table_name).update(values).eq("id", recordId);
      if (error) throw new Error(error.message);
    } else {
      if (row.table_name === "universities" && !values["name"]) {
        throw new Error("New school proposal needs a name");
      }
      if (row.table_name === "programs" && (!values["university_id"] || !values["sport"])) {
        throw new Error("New program proposal needs a school and sport");
      }
      const { data: inserted, error } = await supabase
        .from(row.table_name)
        .insert(values)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      recordId = (inserted as { id: string }).id;
    }

    for (const [field] of entries) {
      await upsertSource(
        supabase,
        row.table_name,
        recordId!,
        field,
        row.source_url,
        row.source_type,
        userId,
      );
    }
  }

  const { error: statusError } = await supabase
    .from("pending_data_changes")
    .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending");
  if (statusError) throw new Error(statusError.message);

  return { id: row.id, recordId };
}

/**
 * Which of these proposals repeat a value someone already declined? Looked up
 * per record so a re-read of the same wrong page is dropped silently instead of
 * coming back to the queue.
 */
async function loadDeclinedKeys(supabase: any, rows: PendingRow[]): Promise<Set<string>> {
  const ids = [...new Set(rows.map((row) => row.record_id).filter(Boolean) as string[])];
  const keys = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const { data } = await supabase
      .from("rejected_values")
      .select("table_name, record_id, field_name, normalized_value")
      .in("record_id", batch);
    for (const row of ((data ?? []) as any[])) {
      keys.add(
        [row.table_name, row.record_id ?? "", row.field_name ?? "", row.normalized_value].join("|"),
      );
    }
  }
  return keys;
}

/** Remember declined values so the same proposal is never raised again. */
export async function rememberDeclines(
  supabase: any,
  userId: string,
  rows: PendingRow[],
  reason: string | null,
) {
  const payload = rows
    .filter((row) => row.record_id)
    .map((row) => ({
      table_name: row.table_name,
      record_id: row.record_id,
      field_name: row.field_name ?? "",
      normalized_value: rejectionKey({
        table_name: row.table_name,
        record_id: row.record_id,
        field_name: row.field_name,
        value: row.field_name ? unwrapFieldValue(row.field_name, row.proposed_value) : row.proposed_value,
      }).split("|").slice(3).join("|"),
      reason,
      created_by: userId,
    }));
  if (!payload.length) return 0;
  const { error } = await supabase
    .from("rejected_values")
    .upsert(payload, { onConflict: "table_name,record_id,field_name,normalized_value" });
  if (error) throw new Error(error.message);
  return payload.length;
}

/** Attach the current live value (and a human label) to each pending row. */
export async function decoratePending(supabase: any, rows: PendingRow[]) {
  const byTable = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.record_id) continue;
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
    byTable.get(row.table_name)!.add(row.record_id);
  }

  const live = new Map<string, Record<string, unknown>>();
  const labels = new Map<string, string>();

  for (const [table, ids] of byTable) {
    // Roster proposals point at a program, not a roster_players row.
    const lookupTable = table === "roster_players" ? "programs" : table;
    if (!FIELD_TABLES.includes(lookupTable as (typeof FIELD_TABLES)[number])) continue;
    const select =
      lookupTable === "programs" ? "*, universities(name, state, website_url)" : "*";
    const idList = [...ids];
    // Ask for records in batches: one request for hundreds of ids silently comes
    // back short, which would make every item look like it had no live value.
    for (let index = 0; index < idList.length; index += 100) {
      const batch = idList.slice(index, index + 100);
      const { data, error } = await supabase.from(lookupTable).select(select).in("id", batch);
      if (error) throw new Error(error.message);
      for (const record of (data ?? []) as Record<string, any>[]) {
        const key = `${table}:${record["id"]}`;
        const label =
          lookupTable === "programs"
            ? `${record["universities"]?.name ?? "Program"} — ${String(record["sport"] ?? "")}`
            : String(record["name"] ?? "School");
        live.set(key, record);
        labels.set(key, table === "roster_players" ? `${label} roster` : label);
      }
    }
  }

  // Anything a person has already declined for this record is never asked again.
  const declined = await loadDeclinedKeys(supabase, rows);

  return rows.map((row) => {
    const key = row.record_id ? `${row.table_name}:${row.record_id}` : null;
    const record = key ? live.get(key) : undefined;
    const currentValue =
      row.field_name && record ? (record[row.field_name] ?? null) : null;
    const decorated = {
      ...row,
      recordLabel: key ? (labels.get(key) ?? null) : null,
      currentValue: (currentValue ?? null) as Json,
      currentRecord: (row.field_name || row.table_name === "roster_players"
        ? null
        : (record ?? null)) as Json,
      // Carried for the coach guards: which sport this is, and which sites
      // count as this school's own.
      programSport: (record?.["sport"] ?? null) as string | null,
      athleticWebsite: (record?.["athletic_website"] ?? null) as string | null,
      coachingStaffUrl: (record?.["coaching_staff_url"] ?? null) as string | null,
      schoolWebsite: ((record?.["universities"] as any)?.website_url ?? null) as string | null,
      previouslyDeclined: declined.has(
        rejectionKey({
          table_name: row.table_name,
          record_id: row.record_id,
          field_name: row.field_name,
          value: row.field_name ? unwrapFieldValue(row.field_name, row.proposed_value) : row.proposed_value,
        }),
      ),
    };
    // Say on the item itself why a person is being asked — the same judgement the
    // automatic tidy-up uses, so the screen and the sweep never disagree.
    return { ...decorated, reviewReason: pendingVerdict(decorated).reason };
  });
}

// --- Grouping -------------------------------------------------------------
// At quarterly scale the queue is thousands of items, so it is presented as one
// group per school (its own details plus every program under it) rather than a
// flat list of fields.

export type DecoratedRow = Awaited<ReturnType<typeof decoratePending>>[number];

export type PendingGroup = {
  key: string;
  schoolId: string | null;
  schoolName: string;
  /** Programs represented in this group, e.g. ["Baseball", "Softball"]. */
  programs: string[];
  items: DecoratedRow[];
  conflicts: number;
  lowConfidence: number;
  hasRoster: boolean;
  hasNewRecord: boolean;
  /** Highest risk first: conflicts, then unscored/low confidence. */
  riskScore: number;
};

function hasConflict(row: DecoratedRow): boolean {
  const value = row.proposed_value as Record<string, unknown> | null;
  return Boolean(
    value && typeof value === "object" && Array.isArray((value as any)["_alternates"]),
  );
}

/** Build school-level groups out of decorated pending rows. */
export async function groupPending(supabase: any, rows: DecoratedRow[]): Promise<PendingGroup[]> {
  const programIds = [
    ...new Set(
      rows
        .filter((row) => row.table_name === "programs" || row.table_name === "roster_players")
        .map((row) => row.record_id)
        .filter(Boolean) as string[],
    ),
  ];

  const chunk = <T,>(items: T[], size: number) => {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
    return out;
  };

  const programToSchool = new Map<string, { schoolId: string; schoolName: string; sport: string }>();
  for (const ids of chunk(programIds, 100)) {
    const { data } = await supabase
      .from("programs")
      .select("id, sport, university_id, universities(name)")
      .in("id", ids);
    for (const program of (data ?? []) as any[]) {
      programToSchool.set(program.id, {
        schoolId: program.university_id,
        schoolName: program.universities?.name ?? "School",
        sport: String(program.sport ?? ""),
      });
    }
  }

  const schoolIds = [
    ...new Set(
      rows
        .filter((row) => row.table_name === "universities")
        .map((row) => row.record_id)
        .filter(Boolean) as string[],
    ),
  ];
  const schoolNames = new Map<string, string>();
  for (const ids of chunk(schoolIds, 100)) {
    const { data } = await supabase.from("universities").select("id, name").in("id", ids);
    for (const school of (data ?? []) as any[]) schoolNames.set(school.id, school.name);
  }


  const groups = new Map<string, PendingGroup>();

  for (const row of rows) {
    let schoolId: string | null = null;
    let schoolName = "New submission";
    let sport = "";

    if (row.table_name === "universities" && row.record_id) {
      schoolId = row.record_id;
      schoolName = schoolNames.get(row.record_id) ?? "School";
    } else if (row.record_id) {
      const program = programToSchool.get(row.record_id);
      if (program) {
        schoolId = program.schoolId;
        schoolName = program.schoolName;
        sport = program.sport;
      }
    }

    const key = schoolId ?? `unassigned:${row.table_name}:${row.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        schoolId,
        schoolName,
        programs: [],
        items: [],
        conflicts: 0,
        lowConfidence: 0,
        hasRoster: false,
        hasNewRecord: false,
        riskScore: 0,
      });
    }

    const group = groups.get(key)!;
    group.items.push(row);
    if (sport && !group.programs.includes(sport)) group.programs.push(sport);
    if (hasConflict(row)) group.conflicts += 1;
    if ((row.ai_confidence ?? -1) < 0.7) group.lowConfidence += 1;
    if (row.table_name === "roster_players") group.hasRoster = true;
    if (!row.record_id) group.hasNewRecord = true;
  }

  const list = [...groups.values()].map((group) => ({
    ...group,
    riskScore: group.conflicts * 100 + group.lowConfidence * 10 + (group.hasNewRecord ? 5 : 0),
  }));

  list.sort((a, b) => b.riskScore - a.riskScore || a.schoolName.localeCompare(b.schoolName));
  for (const group of list) {
    group.items.sort((a, b) => (a.ai_confidence ?? -1) - (b.ai_confidence ?? -1));
  }
  return list;
}

// --- Queue hygiene -----------------------------------------------------------

/**
 * The queue fills with items that never needed a person: a URL that differs
 * only by a trailing slash, a number inside rounding distance, a flag filling a
 * column that was only ever at its default. This walks the open queue and
 * resolves those, leaving only genuine decisions behind.
 *
 * `apply: false` reports what would happen without touching anything.
 */
/**
 * One shared judgement for an open item, used both by the sweep and by the
 * review screen, so what the screen says about an item is exactly what the
 * sweep would do with it.
 */
export function pendingVerdict(row: any): {
  kind: "no_change" | "auto_apply" | "needs_review";
  reason: string;
  /** Set for a roster we keep even though the page was only partly read. */
  partial?: boolean;
  /** Set when the team should go back in line for a fresh pull. */
  repull?: boolean;
} {
  // A value someone already turned down is never raised a second time.
  if (row.previouslyDeclined) {
    return { kind: "no_change", reason: "you turned this value down before" };
  }

  if (row.table_name === "roster_players") {
    const verdict = rosterVerdict(row.proposed_value ?? {}, row.source_url);
    if (verdict.auto) {
      return { kind: "auto_apply", reason: "a complete roster from the team's own page" };
    }
    const keepable = rosterKeepable(row.proposed_value ?? {});
    if (keepable.keep) {
      return {
        kind: "auto_apply",
        reason: keepable.partial
          ? "only part of the roster was read — saved, with a fuller pull queued"
          : "a roster from the team's own page",
        partial: keepable.partial,
      };
    }
    // A roster read off last year's page, or one whose season could not be read
    // at all, is nothing a person can put right by hand: the page itself was
    // wrong or stale. Drop it and put the team back in line for a fresh pull
    // rather than parking it in the queue for someone to stare at.
    const staleSeason = /^roster is labelled |^no season could be read$/.test(
      keepable.reason ?? verdict.reason ?? "",
    );
    if (staleSeason) {
      return {
        kind: "no_change",
        reason: "the page showed an out-of-date season — a fresh pull is queued",
        repull: true,
      };
    }
    return { kind: "needs_review", reason: keepable.reason ?? verdict.reason ?? "needs a look" };
  }

  const field = row.field_name as string;
  if (!field) return { kind: "needs_review", reason: "a brand-new record" };

  const proposed = unwrapFieldValue(field, row.proposed_value);
  const current = row.currentValue;

  if (valuesEquivalent(field, current, proposed)) {
    return { kind: "no_change", reason: "already matches what we store" };
  }

  // Coach names live or die by their evidence. Unproven pages are discarded
  // outright rather than queued, and a change to a name we already hold at a
  // top-division program is confirmed by a person before it is written.
  if (COACH_FIELDS.has(field)) {
    const evidence = coachEvidenceVerdict({
      value: proposed,
      sourceUrl: row.source_url,
      sport: row.programSport,
      athleticWebsite: row.athleticWebsite,
      coachingStaffUrl: row.coachingStaffUrl,
      schoolWebsite: row.schoolWebsite,
    });
    if (!evidence.ok) {
      const reason = evidence.reason ?? "the coach page could not be trusted";
      return { kind: evidence.severity === "flag" ? "needs_review" : "no_change", reason };
    }
    if (!isEmptyValue(field, current)) {
      return { kind: "needs_review", reason: "this would replace a coach we already have" };
    }
  }

  const disagreement = Array.isArray(row.proposed_value?.["_alternates"]);
  if (disagreement) return { kind: "needs_review", reason: "two sources disagree" };

  if (!row.recordLabel) return { kind: "needs_review", reason: "we could not load the record" };

  if (!fieldValueSane(field, proposed)) {
    return { kind: "needs_review", reason: "that value doesn't look possible for this field" };
  }

  if (row.source_type !== "official") {
    return { kind: "needs_review", reason: "not from the school's own site" };
  }

  // The school's own site is treated as the better answer, so it is applied even
  // when it replaces something we already hold.
  return {
    kind: "auto_apply",
    reason: isEmptyValue(field, current)
      ? "fills a blank field from the school's own site"
      : "updates an older value from the school's own site",
  };
}


export type PendingSweepResult = {
  examined: number;
  noChange: number;
  gapFills: number;
  remaining: number;
  failures: number;
  moreWaiting: boolean;
  reasons: { reason: string; count: number }[];
  samples: { label: string; field: string; reason: string }[];
};

/** Identity of a proposal, so the same fact proposed twice is only decided once. */
function proposalKey(row: PendingRow): string {
  return [
    row.table_name,
    row.record_id ?? "",
    row.field_name ?? "",
    JSON.stringify(row.proposed_value ?? null),
  ].join("|");
}

/**
 * Decide a set of already-decorated open items and, when asked, carry those
 * decisions out. This is the single rulebook: the sweep runs it over the whole
 * waiting pile, and each pull runs it over the items it just created, so a fresh
 * pull never leaves behind work a sweep would have done for you.
 */
export async function settlePendingRows(
  supabase: any,
  userId: string,
  decorated: any[],
  apply: boolean,
): Promise<{
  noChange: number;
  autoApplied: number;
  remaining: number;
  failures: number;
  reasons: Map<string, number>;
  samples: { label: string; field: string; reason: string }[];
}> {
  const noChangeIds: string[] = [];
  const autoRows: PendingRow[] = [];
  const repullPrograms = new Set<string>();
  const samples: { label: string; field: string; reason: string }[] = [];
  const reasons = new Map<string, number>();
  const seen = new Set<string>();
  let remaining = 0;

  for (const row of decorated) {
    // Duplicates of a proposal we have already handled in this pass are noise.
    const key = proposalKey(row as PendingRow);
    if (seen.has(key)) {
      noChangeIds.push(row.id);
      continue;
    }
    seen.add(key);

    const verdict = pendingVerdict(row);
    const field = (row.field_name as string) ?? "roster";

    if (verdict.kind === "no_change") {
      noChangeIds.push(row.id);
      if (verdict.repull) {
        const programId = (row.proposed_value?.program_id ?? row.record_id) as string | null;
        if (programId) repullPrograms.add(programId);
      }
    } else if (verdict.kind === "auto_apply") {
      autoRows.push(row as PendingRow);
      if (verdict.partial) {
        const programId = (row.proposed_value?.program_id ?? row.record_id) as string | null;
        if (programId) repullPrograms.add(programId);
      }
    } else {
      remaining += 1;
      reasons.set(verdict.reason, (reasons.get(verdict.reason) ?? 0) + 1);
      continue;
    }

    if (samples.length < 10) {
      samples.push({ label: row.recordLabel ?? "Record", field, reason: verdict.reason });
    }
  }

  let failures = 0;
  let autoApplied = autoRows.length;

  if (apply) {
    for (let index = 0; index < noChangeIds.length; index += 200) {
      const batch = noChangeIds.slice(index, index + 200);
      const { error: rejectError } = await supabase
        .from("pending_data_changes")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          decided_via: "auto",
        })
        .in("id", batch)
        .eq("status", "pending");
      if (rejectError) throw new Error(rejectError.message);
    }

    autoApplied = 0;
    for (const row of autoRows) {
      try {
        await approvePending(supabase, userId, row);
        autoApplied += 1;
      } catch {
        failures += 1;
      }
    }

    // Partly-read rosters are kept, then the program goes back in line so a
    // later pull can complete it.
    for (const programId of repullPrograms) {
      const { data: existing } = await supabase
        .from("ingest_queue")
        .select("id")
        .eq("program_id", programId)
        .eq("stage", "program_scrape")
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("ingest_queue")
          .update({ status: "pending", attempts: 0, leased_at: null })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("ingest_queue")
          .insert([{ program_id: programId, stage: "program_scrape", status: "pending" }]);
      }
    }
  }

  return { noChange: noChangeIds.length, autoApplied, remaining, failures, reasons, samples };
}

export async function sweepPendingNoise(
  supabase: any,
  userId: string,
  apply: boolean,
  limit = 1000,
  offset = 0,
): Promise<PendingSweepResult> {
  const { data: rows, error } = await supabase
    .from("pending_data_changes")
    .select(
      "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const pending = (rows ?? []) as PendingRow[];
  // The API caps a read at 1,000 rows, so "is there more?" comes from a count.
  const { count: openTotal } = await supabase
    .from("pending_data_changes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const moreWaiting = (openTotal ?? 0) > offset + pending.length;
  const decorated = await decoratePending(supabase, pending);

  const settled = await settlePendingRows(supabase, userId, decorated as any[], apply);

  return {
    examined: pending.length,
    noChange: settled.noChange,
    gapFills: settled.autoApplied,
    remaining: settled.remaining,
    failures: settled.failures,
    moreWaiting,
    reasons: [...settled.reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    samples: settled.samples,
  };
}


/**
 * Work the whole waiting pile instead of one batch: repeat passes, stepping past
 * the items left for a person, until nothing is left or time runs out.
 */
export async function sweepPendingUntilDone(
  supabase: any,
  userId: string,
  apply: boolean,
  options: { maxPasses?: number; budgetMs?: number } = {},
): Promise<PendingSweepResult & { passes: number }> {
  const maxPasses = Math.min(Math.max(options.maxPasses ?? 8, 1), 20);
  const budgetMs = options.budgetMs ?? 45_000;
  const startedAt = Date.now();

  const total: PendingSweepResult & { passes: number } = {
    examined: 0,
    noChange: 0,
    gapFills: 0,
    remaining: 0,
    failures: 0,
    moreWaiting: false,
    reasons: [],
    samples: [],
    passes: 0,
  };
  const reasonCounts = new Map<string, number>();
  let offset = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const result = await sweepPendingNoise(supabase, userId, apply, 1000, offset);
    total.passes += 1;
    total.examined += result.examined;
    total.noChange += result.noChange;
    total.gapFills += result.gapFills;
    total.remaining += result.remaining;
    total.failures += result.failures;
    total.moreWaiting = result.moreWaiting;
    for (const { reason, count } of result.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + count);
    }
    for (const sample of result.samples) {
      if (total.samples.length < 10) total.samples.push(sample);
    }
    offset += result.remaining;

    if (!apply) break;
    if (!result.moreWaiting || result.examined === 0) break;
    if (Date.now() - startedAt > budgetMs) break;
  }

  total.reasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  return total;
}

