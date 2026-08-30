/** Server-only logic for the superadmin data review queue. */

import { PROGRAM_FIELD_NAMES, UNIVERSITY_FIELD_NAMES } from "@/lib/admin-schemas";

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
  const seasonYear = Number(payload?.season_year) || new Date().getFullYear();

  const rows = players.map((player: any) => ({
    program_id: programId,
    season_year: seasonYear,
    name: String(player?.name ?? "").trim(),
    position: pickEnum(player?.position, POSITIONS),
    class_year: pickEnum(player?.class_year, CLASS_YEARS),
    bats: pickEnum(player?.bats, ["R", "L", "S"]),
    throws: pickEnum(player?.throws, ["R", "L"]),
    hometown: player?.hometown ? String(player.hometown) : null,
    home_state: player?.home_state ? String(player.home_state).toUpperCase().slice(0, 2) : null,
    is_transfer: Boolean(player?.is_transfer),
    is_juco_transfer: Boolean(player?.is_juco_transfer),
    two_way: pickEnum(player?.position, POSITIONS) === "TWO_WAY",
  })).filter((r: { name: string }) => r.name);

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
    const { data } = await supabase.from(lookupTable).select(select).in("id", [...ids]);
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

  return rows.map((row) => {
    const key = row.record_id ? `${row.table_name}:${row.record_id}` : null;
    const record = key ? live.get(key) : undefined;
    const currentValue =
      row.field_name && record ? (record[row.field_name] ?? null) : null;
    return {
      ...row,
      recordLabel: key ? (labels.get(key) ?? null) : null,
      currentValue: (currentValue ?? null) as Json,
      currentRecord: (row.field_name || row.table_name === "roster_players"
        ? null
        : (record ?? null)) as Json,
    };
  });
}
