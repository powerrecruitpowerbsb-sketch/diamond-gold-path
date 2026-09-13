import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listPermanentBlocks } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/blocks")({
  component: PermanentBlocks,
});

function PermanentBlocks() {
  const fn = useServerFn(listPermanentBlocks);
  const { data, isPending } = useQuery({ queryKey: ["permanent-blocks"], queryFn: () => fn() });
  const rows = (data ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Permanent blocks"
        description="Values that can never be proposed again. Each one needs a person to agree it is genuinely wrong, or to release it."
        counts={[`${rows.length.toLocaleString("en-US")} blocked`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="Nothing is permanently blocked."
          caption="Permanently blocked values"
          columns={[
            { header: "Record", cell: (row) => row.table_name },
            { header: "Field", cell: (row) => row.field_name },
            {
              header: "Blocked value",
              cell: (row) => <span className="break-all">{row.normalized_value ?? "—"}</span>,
            },
            { header: "Reason", cell: (row) => <span className="text-steel">{row.reason ?? "—"}</span> },
            {
              header: "Blocked",
              cell: (row) => new Date(row.created_at).toLocaleDateString("en-US"),
            },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Releasing a block comes with the next step. This screen only reads.
      </p>
    </>
  );
}
