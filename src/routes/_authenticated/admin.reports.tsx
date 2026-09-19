import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";
import { Button } from "@/components/ui/button";
import { listThreadReports, resolveThreadReport } from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: FlaggedConversations,
});

function FlaggedConversations() {
  const listFn = useServerFn(listThreadReports);
  const resolveFn = useServerFn(resolveThreadReport);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["thread-reports"],
    queryFn: () => listFn(),
    retry: false,
  });
  const rows = data ?? [];

  const resolve = useMutation({
    mutationFn: (input: { id: string; status: string }) => resolveFn({ data: input }),
    onSuccess: () => {
      toast.success("Updated.");
      queryClient.invalidateQueries({ queryKey: ["thread-reports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = rows.filter((row) => row.status === "open").length;

  return (
    <>
      <PageHeader
        title="Flagged conversations"
        description="Anything a family or coach reported from a school conversation. Nothing is deleted."
        counts={[`${rows.length.toLocaleString("en-US")} reports`, `${open.toLocaleString("en-US")} open`]}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => String(row.id)}
          empty="Nothing has been reported."
          caption="Flagged conversations"
          columns={[
            { header: "Organization", cell: (row) => row.organization ?? "—" },
            { header: "Athlete", cell: (row) => row.athlete ?? "—" },
            { header: "Reported by", cell: (row) => row.reportedBy },
            { header: "Reason", cell: (row) => row.reason ?? "—" },
            {
              header: "When",
              cell: (row) => new Date(String(row.createdAt)).toLocaleDateString("en-US"),
            },
            { header: "Status", cell: (row) => row.status },
            {
              header: "Actions",
              cell: (row) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    resolve.mutate({
                      id: String(row.id),
                      status: row.status === "open" ? "closed" : "open",
                    })
                  }
                >
                  {row.status === "open" ? "Close" : "Reopen"}
                </Button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
