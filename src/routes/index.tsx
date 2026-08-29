import { createFileRoute, Link } from "@tanstack/react-router";
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
  component: Index,
});

const VERIFIED_FIELDS = [
  { label: "Programs tracked", value: "9" },
  { label: "Universities", value: "6" },
  { label: "Roster entries", value: "8" },
  { label: "Sourced fields", value: "15" },
];

function Index() {
  return (
    <AppShell right={<AuthButton />}>
      <StadiumHero
        eyebrow="College baseball & softball"
        headline="Recruiting research that separates fact from opinion."
        subhead="Every academic, athletic and cost figure is sourced and dated. Every judgment call is labeled as ours. No blended guesswork."
        stats={VERIFIED_FIELDS}
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
        <Card className="rounded-xl border-0 p-6 shadow-card">
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

        <Card className="rounded-xl border-0 p-6 shadow-card">
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

        <Card className="rounded-xl border-0 p-6 shadow-card">
          <ShieldCheck className="size-6 text-org-primary" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Scoped by organization</h2>
          <p className="mt-2 text-sm text-steel">
            Staff, parents and players read the shared database. Only platform staff can change
            it, and every edit is logged.
          </p>
        </Card>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <IntelBlock className="shadow-card">
          Roster construction at this level leans heavily on JUCO arms in the spring. Expect a
          walk-on-first conversation unless the recruit is a two-way with a plus fastball.
        </IntelBlock>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Avg GPA", value: "3.83" },
            { label: "Avg SAT", value: "1520" },
            { label: "Accept rate", value: "5.7%" },
            { label: "Net price", value: "$27,500" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white p-4 shadow-card">
              <p className="meta">{stat.label}</p>
              <p className="tabular mt-1 font-display text-2xl font-bold text-org-primary">
                {stat.value}
              </p>
              <VerifiedChip className="mt-3">Sourced</VerifiedChip>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
