/**
 * Memory of values a person has declined.
 *
 * Without this, declining a wrong coach name or a wrong roster only cleared the
 * item: the next pull read the same page, proposed the same value and put it
 * back in the queue. Every decline is now remembered against the exact record
 * and field, so the same value is never asked about twice.
 */

/** One stable key for "this value, for this field, on this record". */
export function rejectionKey(input: {
  table_name: string;
  record_id: string | null | undefined;
  field_name: string | null | undefined;
  value: unknown;
}): string {
  return [
    input.table_name,
    input.record_id ?? "",
    input.field_name ?? "",
    normalizeRejectedValue(input.value),
  ].join("|");
}

/** A comparable form of a proposed value, so trivial differences still match. */
export function normalizeRejectedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizeRejectedValue));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A roster proposal is identified by its team, season and player names, not
    // by the incidental order of the page it was read from.
    if (Array.isArray(record["players"])) {
      const names = (record["players"] as any[])
        .map((player) => normalizeRejectedValue(player?.name))
        .filter(Boolean)
        .sort();
      return JSON.stringify({
        program: normalizeRejectedValue(record["program_id"]),
        season: normalizeRejectedValue(record["season_year"]),
        names,
      });
    }
    const entries = Object.entries(record)
      .filter(([key]) => !key.startsWith("_"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalizeRejectedValue(item)]);
    return JSON.stringify(entries);
  }
  return String(value);
}
