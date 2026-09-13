import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listRetiredSchools } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/retired")({
  component: RetiredSchools,
});

function RetiredSchools() {
  const fn = useServerFn(listRetiredSchools);
  const { data, isPending } = useQuery({ queryKey: ["retired-schools"], queryFn: () => fn() });
  const rows = (data ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Retired schools"
        description="Schools taken out of the recruitable set because they closed or were never real. Their records are kept, not deleted."
        counts={[`${rows.length.toLocaleString("en-US")} retired`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="No school is retired."
          caption="Retired schools"
          columns={[
            { header: "School", cell: (row) => row.name },
            { header: "State", cell: (row) => row.state ?? "—" },
            { header: "Federal ID", cell: (row) => row.ipeds_unitid ?? "none" },
            { header: "Reason", cell: (row) => <span className="text-steel">{row.retired_reason ?? "—"}</span> },
            {
              header: "Retired",
              cell: (row) =>
                row.retired_at ? new Date(row.retired_at).toLocaleDateString("en-US") : "—",
            },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Restoring a school comes with the next step. This screen only reads.
      </p>
    </>
  );
}
