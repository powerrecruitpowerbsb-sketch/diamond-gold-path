import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listQuarantinedHosts } from "@/lib/console.functions";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

export const Route = createFileRoute("/_authenticated/admin/hosts")({
  component: BlockedSites,
});

function BlockedSites() {
  const fn = useServerFn(listQuarantinedHosts);
  const { data, isPending } = useQuery({ queryKey: ["quarantined-hosts"], queryFn: () => fn() });
  const rows = (data ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Blocked sites"
        description="Sites whose firewall turns us away. Pages on these hosts are skipped until the site answers again."
        counts={[`${rows.length.toLocaleString("en-US")} blocked hosts`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.host}
          empty="No site is blocking us."
          caption="Blocked hosts"
          columns={[
            { header: "Host", cell: (row) => row.host },
            { header: "Firewall", cell: (row) => row.protection_kind ?? "—" },
            {
              header: "Evidence",
              cell: (row) => <span className="text-steel">{row.evidence ?? "—"}</span>,
            },
            { header: "Times seen", numeric: true, cell: (row) => (row.detections ?? 0).toLocaleString("en-US") },
            {
              header: "First blocked",
              cell: (row) =>
                row.first_detected_at
                  ? new Date(row.first_detected_at).toLocaleDateString("en-US")
                  : "—",
            },
            {
              header: "Last tried",
              cell: (row) =>
                row.last_probe_at ? new Date(row.last_probe_at).toLocaleDateString("en-US") : "never",
            },
            { header: "Last result", cell: (row) => row.probe_status ?? "—" },
          ]}
        />
      )}
      <p className="mt-3 text-sm text-steel">
        Retrying a single host comes with the next step. This screen only reads.
      </p>
    </>
  );
}
