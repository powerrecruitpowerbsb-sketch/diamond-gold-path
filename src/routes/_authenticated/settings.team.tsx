import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { InvitePanel } from "@/components/admin/InvitePanel";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";

export const Route = createFileRoute("/_authenticated/settings/team")({
  head: () => ({
    meta: [
      { title: "Team & invites — Curve Recruit" },
      {
        name: "description",
        content:
          "Invite coaches and staff to your Curve Recruit organization by email, and manage pending invitations.",
      },
      { property: "og:title", content: "Team & invites — Curve Recruit" },
      {
        property: "og:description",
        content: "Invite staff by email and manage who has access to your organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamSettings,
});

function TeamSettings() {
  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/roster"
        className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      <div className="mt-4 max-w-4xl">
        <h1 className="font-display text-3xl font-bold text-graphite">Team &amp; invites</h1>
        <p className="mt-1 text-sm text-steel">
          The owner and admins send invitations, for staff and for families alike. Coaches and staff
          do not invite.
        </p>


        <InvitePanel
          title="Invite staff"
          description="Send an email invitation to a coach or recruiting staff member. Admins can manage branding, the roster and invites; staff can work the roster and shortlists."
          roles={[
            {
              value: "org_staff",
              label: "Coach / Staff",
              hint: "Coaches manage athletes and shortlists, and write recruiting intelligence for review.",
            },
            {
              value: "org_admin",
              label: "Admin",
              hint: "Admins run the organization: invites, seasons, teams and the intelligence approval queue.",
            },
          ]}
          peopleLabel="Coaches & staff"
          emptyPeople="No staff accounts yet."
        />
      </div>
    </AppShell>
  );
}
