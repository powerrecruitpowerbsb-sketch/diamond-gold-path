/**
 * Turns raw audit_log rows into plain-English activity entries.
 * Pure + client-safe: no database access here. Record labels are resolved
 * server-side by audit-enrich.server.ts and attached to each row.
 */

export type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  action: string;
  created_at: string;
  actor_id?: string | null;
  actorLabel?: string;
  /** e.g. "Vanderbilt — Baseball (NCAA D1)" or "Jake Miller" */
  recordLabel?: string | null;
  /** the person the record belongs to, e.g. "Jake Miller" */
  subjectLabel?: string | null;
};

export type FieldChange = {
  field: string;
  fieldLabel: string;
  from: string | null;
  to: string | null;
};

export type ActivityEntry = {
  id: string;
  actorLabel: string;
  sentence: string;
  createdAt: string;
  action: string;
  tableName: string;
  tableLabel: string;
  recordLabel: string | null;
  changes: FieldChange[];
  /** the single status-style transition worth showing as chips, if any */
  transition: { from: string; to: string } | null;
};

const TABLE_LABEL: Record<string, string> = {
  universities: "school",
  programs: "program",
  roster_players: "college roster player",
  majors: "major",
  university_majors: "school majors",
  classifications: "classification",
  data_field_sources: "data source",
  recruiting_intelligence: "recruiting intelligence",
  program_relationships: "program relationship",
  interaction_log: "coach interaction",
  org_athletes: "athlete",
  athlete_saved_schools: "shortlist entry",
  org_player_notes: "staff note",
  org_member_invites: "invitation",
  org_invites: "invite code",
  athlete_family_links: "family link",
  organizations: "organization",
  seasons: "season",
  teams: "team",
  team_athletes: "team assignment",
  team_coaches: "coach assignment",
  users: "user",
};

export function tableLabel(table: string) {
  return TABLE_LABEL[table] ?? table.replace(/_/g, " ");
}

const FIELD_LABEL: Record<string, string> = {
  status: "status",
  notes: "notes",
  note: "note",
  visible_to_parent: "parent visibility",
  grad_year: "grad year",
  primary_position: "position",
  offering_status: "sport offered",
  est_net_price: "estimated net price",
  est_cost_of_attendance: "estimated cost of attendance",
  head_coach_name: "head coach",
  recruiting_coordinator_name: "recruiting coordinator",
  governing_body: "governing body",
};

export function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

const STATUS_LABEL: Record<string, string> = {
  researching: "Researching",
  contacted: "Contacted",
  offered: "Offered",
  committed: "Committed",
  eliminated: "Eliminated",
  active: "Active",
  graduated: "Graduated",
  departed: "Departed",
  unverified: "Unverified",
  verified: "Verified",
  not_offered: "Not offered",
  true: "On",
  false: "Off",
};

export function valueLabel(value: string | null) {
  if (value == null || value === "") return "—";
  return STATUS_LABEL[value] ?? value;
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function fieldSummary(changes: FieldChange[]) {
  if (changes.length === 1) return changes[0]!.fieldLabel;
  return `${changes.length} fields`;
}

function buildSentence(row: AuditRow, changes: FieldChange[]): string {
  const record = row.recordLabel || null;
  const subject = row.subjectLabel || null;
  const created = row.action === "create";
  const statusChange = changes.find((c) => c.field === "status");

  switch (row.table_name) {
    case "athlete_saved_schools": {
      const school = record ?? "a program";
      if (created)
        return subject
          ? `added ${school} to ${possessive(subject)} shortlist`
          : `added ${school} to a shortlist`;
      if (statusChange)
        return subject
          ? `moved ${possessive(subject)} ${school} to ${valueLabel(statusChange.to)}`
          : `moved ${school} to ${valueLabel(statusChange.to)}`;
      return subject
        ? `updated ${fieldSummary(changes)} on ${possessive(subject)} ${school}`
        : `updated ${fieldSummary(changes)} on ${school}`;
    }
    case "org_player_notes": {
      const visible = changes.find((c) => c.field === "visible_to_parent");
      if (created) return `added a staff note on ${subject ?? "an athlete"}`;
      if (visible)
        return `made a note on ${subject ?? "an athlete"} ${
          visible.to === "true" ? "visible to parents" : "staff-only"
        }`;
      return `edited a staff note on ${subject ?? "an athlete"}`;
    }
    case "org_athletes":
      return created
        ? `added athlete ${record ?? ""}`.trim()
        : `updated ${fieldSummary(changes)} on ${record ?? "an athlete"}`;
    case "universities":
      return created
        ? `added school ${record ?? ""}`.trim()
        : `updated ${fieldSummary(changes)} for ${record ?? "a school"}`;
    case "programs":
      return created
        ? `created program ${record ?? ""}`.trim()
        : `updated ${fieldSummary(changes)} for ${record ?? "a program"}`;
    case "recruiting_intelligence":
      return created
        ? `wrote recruiting intelligence for ${record ?? "a program"}`
        : `updated recruiting intelligence for ${record ?? "a program"}`;
    case "team_athletes":
      return created
        ? `assigned ${subject ?? "an athlete"} to ${record ?? "a team"}`
        : `changed ${subject ?? "an athlete"} on ${record ?? "a team"}`;
    case "org_member_invites":
      return created ? `invited ${record ?? "a new member"}` : `updated the invitation for ${record ?? "a member"}`;
    case "teams":
      return created ? `created team ${record ?? ""}`.trim() : `updated team ${record ?? ""}`.trim();
    case "seasons":
      return created ? `created season ${record ?? ""}`.trim() : `updated season ${record ?? ""}`.trim();
    default: {
      const noun = tableLabel(row.table_name);
      const verb = row.action === "create" ? "created" : row.action === "override" ? "overrode" : "updated";
      return record ? `${verb} ${noun} ${record}` : `${verb} a ${noun}`;
    }
  }
}

/** Collapses field-level rows written in the same second on the same record. */
export function toActivityEntries(rows: AuditRow[]): ActivityEntry[] {
  const groups = new Map<string, AuditRow[]>();
  const order: string[] = [];
  for (const row of rows) {
    const bucket = row.created_at.slice(0, 19);
    const key = `${row.table_name}|${row.record_id ?? row.id}|${row.action}|${bucket}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    const head = group[0]!;
    const changes: FieldChange[] = group
      .filter((r) => r.field_name)
      .map((r) => ({
        field: r.field_name!,
        fieldLabel: fieldLabel(r.field_name!),
        from: r.old_value,
        to: r.new_value,
      }));
    const status = changes.find((c) => c.field === "status" || c.field === "offering_status");
    return {
      id: head.id,
      actorLabel: head.actorLabel || "System",
      sentence: buildSentence(head, changes),
      createdAt: head.created_at,
      action: head.action,
      tableName: head.table_name,
      tableLabel: tableLabel(head.table_name),
      recordLabel: head.recordLabel ?? null,
      changes,
      transition:
        status && status.from
          ? { from: valueLabel(status.from), to: valueLabel(status.to) }
          : null,
    };
  });
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function dayBucket(iso: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return "Today";
  if (date.getTime() >= startOfToday - 86400000) return "Yesterday";
  return "Earlier";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
