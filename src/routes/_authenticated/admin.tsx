import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { useMyAccount } from "@/hooks/use-my-account";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";

const ADMIN_NAV = [
  { to: "/admin", label: "Console", exact: true },
  { to: "/admin/universities", label: "Schools", exact: false },
  { to: "/admin/programs", label: "Programs (Baseball / Softball)", exact: false },
  { to: "/admin/majors", label: "Majors", exact: false },
  { to: "/admin/audit", label: "Audit log", exact: false },
];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin console — Power Recruit" },
      {
        name: "description",
        content:
          "Power Recruit staff console for managing verified university, program, and classification data.",
      },
      { property: "og:title", content: "Admin console — Power Recruit" },
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
  const { account: data, isPending } = useMyAccount();

  if (isPending) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!data?.isSuperadmin) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]">
          <ShieldAlert className="mx-auto size-8 text-seam-red" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-bold text-graphite">Not authorized</h1>
          <p className="mt-2 text-sm text-steel">
            The admin console is limited to Power Recruit superadmins.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell right={<AuthButton />}>
      <nav
        aria-label="Admin sections"
        className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]"
      >
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            className="touch-target flex shrink-0 items-center rounded-md px-3.5 text-sm font-semibold text-steel transition-colors hover:bg-muted hover:text-graphite"
            activeProps={{ className: "bg-org-primary text-white hover:bg-org-primary hover:text-white" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="mb-6 -mt-4 text-xs text-steel">
        <strong className="font-semibold text-graphite">Schools</strong> hold academics and cost.{" "}
        <strong className="font-semibold text-graphite">Programs</strong> are the baseball or softball
        team at a school — division, conference, coaches, roster, and our intelligence.
      </p>
      <Outlet />
    </AppShell>
  );
}
