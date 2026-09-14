import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listUnrecognisedWordings } from "@/lib/wordings.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/wordings")({
  component: Wordings,
});

function Wordings() {
  const fn = useServerFn(listUnrecognisedWordings);
  const { data, isPending } = useQuery({
    queryKey: ["unrecognised-wordings"],
    queryFn: () => fn(),
  });
  const groups = (data ?? []) as {
    field: string;
    distinct: number;
    records: number;
    rows: { wording: string; count: number }[];
  }[];

  const totalDistinct = groups.reduce((sum, group) => sum + group.distinct, 0);
  const totalRecords = groups.reduce((sum, group) => sum + group.records, 0);

  return (
    <>
      <PageHeader
        title="Unrecognised wordings"
        description="Text a page printed that our reader could not turn into a stored value. The page's own words are kept alongside every field we normalise, so a wording we miss is countable here instead of being found on a screenshot."
        counts={[
          `${totalDistinct.toLocaleString("en-US")} distinct wordings`,
          `${totalRecords.toLocaleString("en-US")} records affected`,
        ]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <section key={group.field}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-steel uppercase">
                {group.field} — {group.distinct.toLocaleString("en-US")} wording
                {group.distinct === 1 ? "" : "s"}, {group.records.toLocaleString("en-US")} record
                {group.records === 1 ? "" : "s"}
              </p>
              <RecordTable
                rows={group.rows}
                rowKey={(row) => `${group.field}:${row.wording}`}
                empty="Every wording seen for this field was recognised."
                caption={`${group.field} wordings we do not recognise`}
                columns={[
                  { header: "Wording on the page", cell: (row) => row.wording },
                  {
                    header: "Records",
                    numeric: true,
                    cell: (row) => row.count.toLocaleString("en-US"),
                  },
                ]}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
