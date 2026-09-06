/** Server-only logic for the superadmin data review queue. */

import { PROGRAM_FIELD_NAMES, UNIVERSITY_FIELD_NAMES } from "@/lib/admin-schemas";
import {
  isEmptyValue,
  normalizePosition,
  plausibleSeasonYear,
  rosterVerdict,
  valuesEquivalent,
} from "@/lib/data-quality";

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

const POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL", "RHP", "LHP", "TWO_WAY"];
const CLASS_YEARS = ["FR", "SO", "JR", "SR", "GR"];

function pickEnum(value: unknown, options: string[]): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return options.includes(text) ? text : null;
}

/**
 * A roster proposal replaces the stored roster for one program + season in a
 * single reviewed step, rather than one queue item per player.
 */
async function applyRosterProposal(supabase: any, row: PendingRow) {
  const payload = row.proposed_value as any;
  const players = Array.isArray(payload?.players) ? payload.players : null;
  const programId = payload?.program_id ?? row.record_id;
  if (!players || !players.length) throw new Error("Roster proposal contains no players");
  if (!programId) throw new Error("Roster proposal is missing its program");
  // A season read off a jersey number or an archive page is not a season.
  const seasonYear = plausibleSeasonYear(payload?.season_year) ?? new Date().getFullYear();

  const rows = players.map((player: any) => {
    const position = pickEnum(normalizePosition(player?.position), POSITIONS);
    return {
      program_id: programId,
      season_year: seasonYear,
      name: String(player?.name ?? "").trim(),
      position,
      class_year: pickEnum(player?.class_year, CLASS_YEARS),
      bats: pickEnum(player?.bats, ["R", "L", "S"]),
      throws: pickEnum(player?.throws, ["R", "L"]),
      hometown: player?.hometown ? String(player.hometown) : null,
      home_state: player?.home_state ? String(player.home_state).toUpperCase().slice(0, 2) : null,
      is_transfer: Boolean(player?.is_transfer),
      is_juco_transfer: Boolean(player?.is_juco_transfer),
      two_way: position === "TWO_WAY",
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
    const { error } = await supabase
      .from(row.table_name)
      .update({ [row.field_name]: value === "" ? null : value })
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
    const select = lookupTable === "programs" ? "*, universities(name, state)" : "*";
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

  const programToSchool = new Map<string, { schoolId: string; schoolName: string; sport: string }>();
  if (programIds.length) {
    const { data } = await supabase
      .from("programs")
      .select("id, sport, university_id, universities(name)")
      .in("id", programIds);
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
  if (schoolIds.length) {
    const { data } = await supabase.from("universities").select("id, name").in("id", schoolIds);
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
} {
  if (row.table_name === "roster_players") {
    const verdict = rosterVerdict(row.proposed_value ?? {}, row.source_url);
    if (verdict.auto) return { kind: "auto_apply", reason: "a complete roster from the team's own page" };
    return { kind: "needs_review", reason: verdict.reason ?? "needs a look" };
  }

  const field = row.field_name as string;
  if (!field) return { kind: "needs_review", reason: "a brand-new record" };

  const proposed = unwrapFieldValue(field, row.proposed_value);
  const current = row.currentValue;

  if (valuesEquivalent(field, current, proposed)) {
    return { kind: "no_change", reason: "already matches what we store" };
  }

  const disagreement = Array.isArray(row.proposed_value?.["_alternates"]);
  if (disagreement) return { kind: "needs_review", reason: "two sources disagree" };

  if (!row.recordLabel) return { kind: "needs_review", reason: "we could not load the record" };

  if (!isEmptyValue(field, current)) {
    return { kind: "needs_review", reason: "would replace a value we already hold" };
  }

  if (row.source_type !== "official") {
    return { kind: "needs_review", reason: "fills a blank field, but not from an official source" };
  }

  if ((row.ai_confidence ?? 0) < 0.7) {
    return { kind: "needs_review", reason: "the reading of this page looked shaky" };
  }

  return { kind: "auto_apply", reason: "fills a blank field from an official source" };
}

export async function sweepPendingNoise(
  supabase: any,
  userId: string,
  apply: boolean,
  limit = 1000,
): Promise<{
  examined: number;
  noChange: number;
  gapFills: number;
  remaining: number;
  failures: number;
  moreWaiting: boolean;
  reasons: { reason: string; count: number }[];
  samples: { label: string; field: string; reason: string }[];
}> {
  const { data: rows, error } = await supabase
    .from("pending_data_changes")
    .select(
      "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const pending = (rows ?? []) as PendingRow[];
  // The API caps a read at 1,000 rows, so "is there more?" comes from a count.
  const { count: openTotal } = await supabase
    .from("pending_data_changes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const moreWaiting = (openTotal ?? 0) > pending.length;
  const decorated = await decoratePending(supabase, pending);

  const noChangeIds: string[] = [];
  const autoRows: PendingRow[] = [];
  const samples: { label: string; field: string; reason: string }[] = [];
  const reasonCounts = new Map<string, number>();
  let remaining = 0;

  for (const row of decorated as any[]) {
    const verdict = pendingVerdict(row);
    const field = (row.field_name as string) ?? "roster";

    if (verdict.kind === "no_change") {
      noChangeIds.push(row.id);
    } else if (verdict.kind === "auto_apply") {
      autoRows.push(row as PendingRow);
    } else {
      remaining += 1;
      reasonCounts.set(verdict.reason, (reasonCounts.get(verdict.reason) ?? 0) + 1);
      continue;
    }

    if (samples.length < 10) {
      samples.push({ label: row.recordLabel ?? "Record", field, reason: verdict.reason });
    }
  }

  let failures = 0;
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

    for (const row of autoRows) {
      try {
        await approvePending(supabase, userId, row);
      } catch {
        failures += 1;
      }
    }
  }

  return {
    examined: pending.length,
    noChange: noChangeIds.length,
    gapFills: autoRows.length,
    remaining,
    failures,
    moreWaiting,
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    samples,
  };
}
