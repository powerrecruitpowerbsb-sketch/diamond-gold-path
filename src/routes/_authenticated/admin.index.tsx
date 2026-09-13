import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getConsoleCounts, getNeedsYou } from "@/lib/console.functions";
import { PageHeader, num } from "@/components/console/PageHeader";
import { ConsoleCounts } from "@/components/console/ConsoleCounts";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: NeedsYou,
});

/** Everything waiting on a person, one line each, one click deep. */
function NeedsYou() {
  const needsFn = useServerFn(getNeedsYou);
  const countsFn = useServerFn(getConsoleCounts);
  const { data: needs } = useQuery({ queryKey: ["needs-you"], queryFn: () => needsFn() });
  const { data: counts } = useQuery({
    queryKey: ["console-counts"],
    queryFn: () => countsFn(),
  });

  const queues = [
    {
      to: "/admin/withheld",
      label: "Withheld link conflicts",
      value: needs?.withheld,
      blurb: "Two schools claim the same address, so it is held back from the product.",
    },
    {
      to: "/admin/blocks",
      label: "Permanent blocks",
      value: needs?.blocks,
      blurb: "Values that can never be proposed again until someone releases them.",
    },
    {
      to: "/admin/federal-decisions",
      label: "School identity decisions",
      value: needs?.identity,
      blurb: "Schools with no federal ID on file.",
    },
    {
      to: "/admin/discovery",
      label: "Discovered links",
      value: needs?.discovered,
      blurb: "Addresses found by collection, waiting to be confirmed.",
    },
    {
      to: "/admin/review",
      label: "Review queue",
      value: needs?.review,
      blurb: "Proposed field changes waiting to be approved or rejected.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Needs you"
        description="Everything waiting on a person. Each queue keeps its own screen, because each needs different evidence."
        counts={ConsoleCounts(counts)}
      />

      <div className="rounded border border-border bg-card">
        {queues.map((queue) => (
          <Link
            key={queue.to}
            to={queue.to}
            className="flex items-baseline gap-4 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-graphite">{queue.label}</span>
              <span className="block text-xs text-steel">{queue.blurb}</span>
            </span>
            <span className="tabular font-display text-xl font-bold text-org-primary">
              {num(queue.value)}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
