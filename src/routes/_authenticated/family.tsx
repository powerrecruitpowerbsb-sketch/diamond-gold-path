import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family portal — Power Recruit" },
      {
        name: "description",
        content: "Family portal for Power Recruit — college research for players and parents.",
      },
      { property: "og:title", content: "Family portal — Power Recruit" },
      {
        property: "og:description",
        content: "College research for Power Recruit players and parents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell right={<AuthButton />}>
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]">
        <h1 className="font-display text-3xl font-bold text-graphite">Family portal</h1>
        <p className="mt-2 text-sm text-steel">Coming in Phase 3.</p>
      </div>
    </AppShell>
  ),
});
