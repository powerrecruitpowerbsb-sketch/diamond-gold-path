import { createFileRoute, Link } from "@tanstack/react-router";

import { getPublicStats } from "@/lib/console.functions";
import { BadgeCheck, Database, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { StadiumHero } from "@/components/brand/StadiumHero";
import { IntelBlock, SourceLine, VerifiedChip } from "@/components/brand/DataSignals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Power Recruit — College Baseball & Softball Recruiting Research" },
      {
        name: "description",
        content:
          "Research college baseball and softball programs with verified academic, athletic and cost data alongside proprietary staff intelligence.",
      },
      { property: "og:title", content: "Power Recruit — Recruiting Research Platform" },
      {
        property: "og:description",
        content:
          "Verified program, academic and cost data for college baseball and softball, paired with staff intelligence.",
      },
    ],
  }),
  loader: async () => await getPublicStats(),
  component: Index,
});

function Index() {
  const stats = Route.useLoaderData();
  const fmt = (value: number) => value.toLocaleString("en-US");
  const verifiedFields = [
    { label: "Programs tracked", value: fmt(stats.programs) },
    { label: "Universities", value: fmt(stats.schools) },
    { label: "Roster entries", value: fmt(stats.players) },
    { label: "Sourced fields", value: fmt(stats.sourcedFields) },
  ];

  return (
    <AppShell right={<AuthButton />}>
      <StadiumHero
        eyebrow="College baseball & softball"
        headline="Recruiting research that separates fact from opinion."
        subhead="Every academic, athletic and cost figure is sourced and dated. Every judgment call is labeled as ours. No blended guesswork."
        stats={verifiedFields}
        actions={
          <>
            <Button
              asChild
              className="touch-target bg-seam-red px-6 text-base font-semibold text-white hover:bg-seam-red/90"
            >
              <Link to="/auth">Sign in to research</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="touch-target border-white/25 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/admin">Staff console</Link>
            </Button>
          </>
        }
      />

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        <Card className="rounded-xl border-0 p-6">
          <BadgeCheck className="size-6 text-diamond-green" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Verified Data</h2>
          <p className="mt-2 text-sm text-steel">
            Tuition, enrollment, admissions and roster figures carry a source link and a
            verification date on the field itself.
          </p>
          <div className="mt-4">
            <VerifiedChip>Verified field</VerifiedChip>
          </div>
        </Card>

        <Card className="rounded-xl border-0 p-6">
          <Database className="size-6 text-org-primary" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">One shared college database</h2>
          <p className="mt-2 text-sm text-steel">
            Universities, programs, majors, rosters and classifications maintained centrally and
            read by every organization.
          </p>
          <SourceLine
            className="mt-4"
            sourceLabel="Institutional websites"
            lastVerifiedAt={new Date().toISOString()}
          />
        </Card>

        <Card className="rounded-xl border-0 p-6">
          <ShieldCheck className="size-6 text-org-primary" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Scoped by organization</h2>
          <p className="mt-2 text-sm text-steel">
            Staff, parents and players read the shared database. Only platform staff can change
            it, and every edit is logged.
          </p>
        </Card>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <IntelBlock>
          Roster construction at this level leans heavily on JUCO arms in the spring. Expect a
          walk-on-first conversation unless the recruit is a two-way with a plus fastball.
        </IntelBlock>

        <div className="rounded border border-border bg-card p-5">
          <p className="text-sm text-steel">
            Every academic, athletic and cost figure on a school's page carries the source it came
            from and the date it was last checked. Judgment calls are labelled as ours.
          </p>
          <VerifiedChip className="mt-4">Sourced and dated</VerifiedChip>
        </div>
      </section>
    </AppShell>
  );
}
