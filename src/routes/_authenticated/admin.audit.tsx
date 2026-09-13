import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listAuditLog } from "@/lib/admin.functions";
import { fieldLabel, initials, tableLabel, valueLabel } from "@/lib/audit-format";

const TABLES = [
  "universities",
  "programs",
  "classifications",
  "data_field_sources",
  "majors",
  "university_majors",
  "roster_players",
  "org_athletes",
  "athlete_saved_schools",
  "org_player_notes",
  "recruiting_intelligence",
  "teams",
  "team_athletes",
  "seasons",
  "org_member_invites",
];

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditScreen,
});

function AuditScreen() {
  const fetchLog = useServerFn(listAuditLog);
  const [tableName, setTableName] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-audit", tableName],
    queryFn: () => fetchLog({ data: { tableName: tableName || null, limit: 300 } }),
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Audit log</h1>
          <p className="mt-1 text-sm text-steel">
            Field-level history of every staff change, captured automatically in the database.
          </p>
        </div>
        <select
          aria-label="Filter by table"
          value={tableName}
          onChange={(event) => setTableName(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All records</option>
          {TABLES.map((table) => (
            <option key={table} value={table}>
              {tableLabel(table)}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <div className="h-64 animate-pulse rounded bg-muted" />
      ) : (data ?? []).length === 0 ? (
        <p className="rounded border border-border bg-card p-8 text-center text-sm text-steel">
          No changes recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["When", "Who", "Record", "Action", "Field", "Before", "After"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-semibold tracking-wide text-steel uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {((data ?? []) as any[]).map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="meta">{new Date(row.created_at).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-graphite">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-org-primary/10 text-[10px] font-bold text-org-primary"
                      >
                        {initials(row.actorLabel ?? "System")}
                      </span>
                      {row.actorLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-graphite">
                      {row.recordLabel ?? "—"}
                    </span>
                    <span className="meta capitalize">{tableLabel(row.table_name)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.action === "create"
                          ? "rounded bg-diamond-green-tint px-1.5 py-0.5 text-[11px] font-semibold text-diamond-green"
                          : row.action === "override"
                            ? "rounded bg-seam-red-tint px-1.5 py-0.5 text-[11px] font-semibold text-seam-red"
                            : "rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-steel"
                      }
                    >
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-graphite capitalize">
                    {row.field_name ? fieldLabel(row.field_name) : "—"}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 tabular text-steel">
                    {valueLabel(row.old_value)}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 tabular text-graphite">
                    {valueLabel(row.new_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
