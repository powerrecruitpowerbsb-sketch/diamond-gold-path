import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listWithheldLinks } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/withheld")({
  component: WithheldLinks,
});

const FIELD_LABEL: Record<string, string> = {
  roster_url: "Roster page",
  coaching_staff_url: "Coach page",
  athletic_website: "Athletics site",
};

function WithheldLinks() {
  const fn = useServerFn(listWithheldLinks);
  const { data, isPending } = useQuery({ queryKey: ["withheld-links"], queryFn: () => fn() });
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Withheld links"
        description="Addresses held back because more than one school claims the domain. Nothing was deleted — each stored address is still on its record."
        counts={[`${rows.length.toLocaleString("en-US")} withheld`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="No links are being withheld."
          caption="Withheld link conflicts"
          columns={[
            { header: "School", cell: (row) => row.schoolName ?? "—" },
            { header: "State", cell: (row) => row.state ?? "—" },
            { header: "Sport", cell: (row) => row.sport ?? "—" },
            { header: "Field", cell: (row) => FIELD_LABEL[row.field] ?? row.field },
            {
              header: "Address",
              cell: (row) => (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-org-primary underline-offset-2 hover:underline"
                >
                  {row.url}
                </a>
              ),
            },
            { header: "Said to belong to", cell: (row) => row.holderName ?? "—" },
            { header: "Reason", cell: (row) => <span className="text-steel">{row.detail ?? "—"}</span> },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Resolving a conflict — keeping one school's claim and releasing the other — comes with the
        next step. This screen only reads.
      </p>
    </>
  );
}
