import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Org dashboard — Power Recruit" },
      {
        name: "description",
        content: "Organization dashboard for Power Recruit staff — recruiting research workspace.",
      },
      { property: "og:title", content: "Org dashboard — Power Recruit" },
      {
        property: "og:description",
        content: "Organization dashboard for Power Recruit staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell right={<AuthButton />}>
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]">
        <h1 className="font-display text-3xl font-bold text-graphite">Org dashboard</h1>
        <p className="mt-2 text-sm text-steel">Coming in Phase 3.</p>
      </div>
    </AppShell>
  ),
});
