import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wrench } from "lucide-react";

import { BuildChecklist } from "@/components/admin/BuildChecklist";
import { RunningNow } from "@/components/admin/RunningNow";
import { countPendingChanges } from "@/lib/review.functions";
import { countPendingDiscoveries } from "@/lib/discovery.functions";
import { getPipelineStatus, listNonSchoolEntries } from "@/lib/pipeline.functions";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({
  head: () => ({
    meta: [
      { title: "Data collection — Power Recruit" },
      {
        name: "description",
        content:
          "See what the nationwide collection is doing right now, how far the database has come, and what still needs a person.",
      },
      { property: "og:title", content: "Data collection — Power Recruit" },
      {
        property: "og:description",
        content: "Collection status, build progress, and the short list of decisions waiting for staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pipeline,
});

type Task = {
  to: "/admin/review" | "/admin/discovery" | "/admin/federal-decisions" | "/admin/tools";
  label: string;
  hint: string;
  cta: string;
};

function Pipeline() {
  const statusFn = useServerFn(getPipelineStatus);
  const reviewCountFn = useServerFn(countPendingChanges);
  const discoveryCountFn = useServerFn(countPendingDiscoveries);
  const nonSchoolsFn = useServerFn(listNonSchoolEntries);

  const { data: status } = useQuery({ queryKey: ["pipeline-status"], queryFn: () => statusFn() });
  const { data: reviewCount } = useQuery({
    queryKey: ["pending-changes-count"],
    queryFn: () => reviewCountFn(),
  });
  const { data: discoveries } = useQuery({
    queryKey: ["pending-discoveries-count"],
    queryFn: () => discoveryCountFn(),
  });
  const { data: nonSchools } = useQuery({
    queryKey: ["non-school-entries"],
    queryFn: () => nonSchoolsFn(),
  });

  const facts = reviewCount?.pending ?? 0;
  const links = discoveries?.pending ?? 0;
  const unfound = discoveries?.unfound ?? 0;
  const matches = status?.schools.federalNeedsHelp ?? 0;
  const strays = nonSchools?.entries?.length ?? 0;

  const tasks: Task[] = [
    facts
      ? {
          to: "/admin/review",
          label: `${facts.toLocaleString()} proposed change${facts === 1 ? "" : "s"} to say yes or no to`,
          hint: "Values that would change something already saved.",
          cta: "Open these",
        }
      : null,
    links
      ? {
          to: "/admin/discovery",
          label: `${links.toLocaleString()} found page${links === 1 ? "" : "s"} to confirm`,
          hint: "Each one shows the address so you can check it in a click.",
          cta: "Check these",
        }
      : null,
    unfound
      ? {
          to: "/admin/discovery",
          label: `${unfound.toLocaleString()} page${unfound === 1 ? "" : "s"} we couldn't find`,
          hint: "Paste the right address in, one school at a time.",
          cta: "Work through these",
        }
      : null,
    matches
      ? {
          to: "/admin/federal-decisions",
          label: `${matches.toLocaleString()} school${matches === 1 ? "" : "s"} need the right match picked`,
          hint: "Each is shown beside its closest national record.",
          cta: "Pick the matches",
        }
      : null,
    strays
      ? {
          to: "/admin/tools",
          label: `${strays.toLocaleString()} entr${strays === 1 ? "y" : "ies"} that aren't really schools`,
          hint: "Directory pages that came in with a membership list.",
          cta: "Clear these out",
        }
      : null,
  ].filter(Boolean) as Task[];

  return (
    <div className="grid gap-5">
      <RunningNow />

      <BuildChecklist />

      <section className="rounded border border-border bg-white p-5">
        <h2 className="font-display text-lg font-bold text-graphite">What needs a person</h2>
        <p className="mt-1 text-sm text-steel">
          Everything else runs on its own. Only these need a decision from you.
        </p>
        {tasks.length ? (
          <div className="mt-4 grid gap-2">
            {tasks.map((task) => (
              <div
                key={task.label}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-graphite">{task.label}</p>
                  <p className="meta">{task.hint}</p>
                </div>
                <Link
                  to={task.to}
                  className="touch-target inline-flex items-center rounded-lg bg-org-primary px-3.5 text-sm font-semibold text-white"
                >
                  {task.cta}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-diamond-green/30 bg-diamond-green/10 p-3 text-sm text-graphite">
            Nothing is waiting on you right now.
          </p>
        )}
      </section>

      <Link
        to="/admin/tools"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-steel underline"
      >
        <Wrench className="size-4" aria-hidden />
        Collection tools — pull membership lists, fill school facts, clean up
      </Link>
    </div>
  );
}
