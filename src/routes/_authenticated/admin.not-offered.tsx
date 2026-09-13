import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listNotOfferedPrograms } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/not-offered")({
  component: NotOffered,
});

function NotOffered() {
  const fn = useServerFn(listNotOfferedPrograms);
  const { data, isPending } = useQuery({ queryKey: ["not-offered"], queryFn: () => fn() });
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Not offered"
        description="Teams a league's own member list says the school does not field. They stay on file so nothing chases them."
        counts={[`${rows.length.toLocaleString("en-US")} teams`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="Every team on file is fielded."
          caption="Teams marked not offered"
          columns={[
            { header: "School", cell: (row) => row.schoolName ?? "—" },
            { header: "State", cell: (row) => row.state ?? "—" },
            { header: "Sport", cell: (row) => row.sport },
            { header: "Governing body", cell: (row) => row.governingBody ?? "—" },
            { header: "Said by", cell: (row) => <span className="text-steel">{row.source ?? "—"}</span> },
            { header: "Marked", cell: (row) => new Date(row.updatedAt).toLocaleDateString("en-US") },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Adding a team back comes with the next step. This screen only reads.
      </p>
    </>
  );
}
