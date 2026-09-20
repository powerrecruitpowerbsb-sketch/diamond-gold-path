import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";

import { useMyAccount } from "@/hooks/use-my-account";
import { getNeedsYou } from "@/lib/console.functions";
import { ConsoleShell, type ConsoleNavSection } from "@/components/console/ConsoleShell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Staff console — Curve Recruit" },
      {
        name: "description",
        content:
          "Curve Recruit staff console for managing verified university, program, and classification data.",
      },
      { property: "og:title", content: "Staff console — Curve Recruit" },
      {
        property: "og:description",
        content: "Staff tools for managing the Curve Recruit college database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { account, isPending } = useMyAccount();
  const needsFn = useServerFn(getNeedsYou);
  const { data: needs } = useQuery({
    queryKey: ["needs-you"],
    queryFn: () => needsFn(),
    enabled: Boolean(account?.isSuperadmin),
  });

  if (isPending) {
    return <div className="min-h-screen bg-chalk p-6"><div className="h-40 animate-pulse rounded border border-border bg-card" /></div>;
  }

  if (!account?.isSuperadmin) {
    return (
      <div className="min-h-screen bg-chalk p-6">
        <div className="mx-auto max-w-lg rounded border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto size-8 text-seam-red" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-bold text-graphite">Not authorized</h1>
          <p className="mt-2 text-sm text-steel">
            The staff console is limited to Curve Recruit superadmins.
          </p>
        </div>
      </div>
    );
  }

  const waiting =
    (needs?.withheld ?? 0) +
    (needs?.blocks ?? 0) +
    (needs?.identity ?? 0) +
    (needs?.discovered ?? 0) +
    (needs?.review ?? 0);

  const sections: ConsoleNavSection[] = [
    {
      label: "Data operations",
      to: "/admin/operations",
      count: waiting || undefined,
      items: [
        { to: "/admin/operations", label: "Overview & schedule", exact: true },
        { to: "/admin/review", label: "Review queue", count: needs?.review },
        { to: "/admin/federal-decisions", label: "School identity", count: needs?.identity },
        { to: "/admin/discovery", label: "Found addresses", count: needs?.discovered },
        { to: "/admin/withheld", label: "Shared addresses", count: needs?.withheld },
        { to: "/admin/blocks", label: "Never propose again", count: needs?.blocks },
      ],
    },
    {
      label: "Colleges & teams",
      items: [
        { to: "/admin/universities", label: "All colleges" },
        { to: "/admin/programs", label: "All teams" },
        { to: "/admin/not-offered", label: "Not offered" },
        { to: "/admin/retired", label: "Retired" },
      ],
    },
    {
      label: "Organizations & accounts",
      items: [{ to: "/admin/organizations", label: "Organizations" }],
    },
    {
      label: "Safety & reports",
      items: [
        { to: "/admin/reports", label: "Flagged conversations" },
        { to: "/admin/audit", label: "Audit log" },
      ],
    },
  ];

  return (
    <ConsoleShell sections={sections}>
      <Outlet />
    </ConsoleShell>
  );
}
