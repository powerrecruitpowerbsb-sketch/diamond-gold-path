import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listArchiveRuns } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/archive")({
  component: RunArchive,
});

function RunArchive() {
  const fn = useServerFn(listArchiveRuns);
  const { data, isPending } = useQuery({ queryKey: ["archive-runs"], queryFn: () => fn() });
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Run archive"
        description="Every change made in bulk, with the value it replaced kept so the run can be undone."
        counts={[
          `${rows.length.toLocaleString("en-US")} runs`,
          `${rows.reduce((sum, row) => sum + row.rows, 0).toLocaleString("en-US")} rows archived`,
        ]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.runId}
          empty="No runs are archived yet."
          caption="Reversible runs"
          columns={[
            { header: "Run", cell: (row) => <span className="font-mono text-xs">{row.runId}</span> },
            { header: "What it did", cell: (row) => row.determinations.join(", ") || "—" },
            { header: "Fields", cell: (row) => row.fields.join(", ") || "—" },
            { header: "Rows", numeric: true, cell: (row) => row.rows.toLocaleString("en-US") },
            { header: "Schools", numeric: true, cell: (row) => row.schools.toLocaleString("en-US") },
            {
              header: "Restored",
              numeric: true,
              cell: (row) => row.restored.toLocaleString("en-US"),
            },
            { header: "When", cell: (row) => new Date(row.startedAt).toLocaleString("en-US") },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Undoing a run comes with the next step. This screen only reads.
      </p>
    </>
  );
}
