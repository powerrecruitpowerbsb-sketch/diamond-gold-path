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
      { title: "Staff console — Power Recruit" },
      {
        name: "description",
        content:
          "Power Recruit staff console for managing verified university, program, and classification data.",
      },
      { property: "og:title", content: "Staff console — Power Recruit" },
      {
        property: "og:description",
        content: "Staff tools for managing the Power Recruit college database.",
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
            The staff console is limited to Power Recruit superadmins.
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
      label: "Needs you",
      to: "/admin",
      count: waiting || undefined,
      items: [
        { to: "/admin/withheld", label: "Withheld links", count: needs?.withheld },
        { to: "/admin/blocks", label: "Permanent blocks", count: needs?.blocks },
        { to: "/admin/federal-decisions", label: "School identity", count: needs?.identity },
        { to: "/admin/discovery", label: "Discovered links", count: needs?.discovered },
        { to: "/admin/review", label: "Review queue", count: needs?.review },
      ],
    },
    {
      label: "Collection",
      items: [
        { to: "/admin/pipeline", label: "Live run" },
        { to: "/admin/build", label: "Stages" },
        { to: "/admin/tools", label: "Tools" },
        { to: "/admin/hosts", label: "Blocked sites" },
        { to: "/admin/seed-import", label: "Bulk import" },
      ],
    },
    {
      label: "Schools",
      items: [
        { to: "/admin/universities", label: "All schools" },
        { to: "/admin/retired", label: "Retired" },
        { to: "/admin/not-offered", label: "Not offered" },
      ],
    },
    { label: "Teams", items: [{ to: "/admin/programs", label: "All teams" }] },
    { label: "Majors", items: [{ to: "/admin/majors", label: "All majors" }] },
    {
      label: "Organizations",
      items: [{ to: "/admin/organizations", label: "All organizations" }],
    },
    {
      label: "Activity",
      items: [
        { to: "/admin/audit", label: "Audit log" },
        { to: "/admin/archive", label: "Run archive" },
      ],
    },
  ];

  return (
    <ConsoleShell sections={sections}>
      <Outlet />
    </ConsoleShell>
  );
}
