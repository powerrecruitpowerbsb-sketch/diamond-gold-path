import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen } from "lucide-react";

import { getConsoleCounts, getNeedsYou } from "@/lib/console.functions";
import { PageHeader, num } from "@/components/console/PageHeader";
import { ConsoleCounts } from "@/components/console/ConsoleCounts";
import { AutopilotPanel } from "@/components/admin/AutopilotPanel";
import { RunningNow } from "@/components/admin/RunningNow";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Command center — Curve Recruit" },
      { name: "description", content: "Is the data fresh, is the refresh running, and what is waiting on a person." },
      { property: "og:title", content: "Command center — Curve Recruit" },
      { property: "og:description", content: "The super admin's daily view of data upkeep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const needsFn = useServerFn(getNeedsYou);
  const countsFn = useServerFn(getConsoleCounts);
  const { data: needs } = useQuery({ queryKey: ["needs-you"], queryFn: () => needsFn() });
  const { data: counts } = useQuery({ queryKey: ["console-counts"], queryFn: () => countsFn() });

  const queues = [
    { to: "/admin/discovery", label: "Suggested addresses", value: needs?.discovered, blurb: "Roster or staff pages the crawler found. Confirm the ones that belong to the school." },
    { to: "/admin/federal-decisions", label: "School identity", value: needs?.identity, blurb: "Pick the right federal record so tuition and test scores can fill in." },
    { to: "/admin/review", label: "Proposed changes", value: needs?.review, blurb: "Field changes waiting for approve or reject." },
    { to: "/admin/withheld", label: "Shared addresses", value: needs?.withheld, blurb: "Two schools claim the same page, so it is held back." },
    { to: "/admin/blocks", label: "Never propose again", value: needs?.blocks, blurb: "Values you blocked. Release one only if it was a mistake." },
  ];
  const total = queues.reduce((sum, q) => sum + Number(q.value ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Command center"
        description="Three questions, top to bottom: is it running, is it fresh, and what needs you."
        counts={ConsoleCounts(counts)}
      />

      <Link
        to="/admin/handbook"
        className="mb-4 flex items-center gap-3 rounded border border-border bg-card px-4 py-3 hover:bg-muted/50"
      >
        <BookOpen className="size-5 text-org-primary" aria-hidden />
        <span className="text-sm">
          <span className="font-semibold text-graphite">New here? Read the super admin handbook.</span>{" "}
          <span className="text-steel">The weekly routine, the season calendar and what to do when a site breaks.</span>
        </span>
      </Link>

      <div className="grid gap-4">
        <RunningNow />
        <AutopilotPanel />

        <section className="rounded border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-lg font-bold text-graphite">Needs you</h2>
            <span className="meta tabular-nums">{num(total)} waiting</span>
          </div>
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
              <span className="tabular font-display text-xl font-bold text-org-primary">{num(queue.value)}</span>
            </Link>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <QuickLink to="/admin/operations" title="Blocked & broken sites" body="Sites that refuse us and addresses that stopped working." />
          <QuickLink to="/admin/missing" title="Missing pages & coaches" body="Teams with no roster page or no head coach yet." />
          <QuickLink to="/admin/tools" title="Collection tools" body="Membership imports, school facts and clean-up." />
        </section>
      </div>
    </>
  );
}

function QuickLink({ to, title, body }: { to: "/admin/operations" | "/admin/missing" | "/admin/tools"; title: string; body: string }) {
  return (
    <Link to={to} className="rounded border border-border bg-card p-4 hover:bg-muted/50">
      <span className="block text-sm font-semibold text-graphite">{title}</span>
      <span className="block text-xs text-steel">{body}</span>
    </Link>
  );
}
