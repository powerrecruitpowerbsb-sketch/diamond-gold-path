import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Database, ShieldCheck } from "lucide-react";

import { getPublicStats } from "@/lib/console.functions";
import { useMyAccount } from "@/hooks/use-my-account";
import { routeForRole } from "@/lib/role-routes";
import { OrgMark } from "@/components/brand/OrgMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curve Recruit — College Baseball & Softball Recruiting Research" },
      {
        name: "description",
        content:
          "Sign in to Curve Recruit to research college baseball and softball programs with verified academic, athletic and cost data alongside staff intelligence.",
      },
      { property: "og:title", content: "Curve Recruit — Recruiting Research Platform" },
      {
        property: "og:description",
        content:
          "Verified program, academic and cost data for college baseball and softball, paired with staff intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // The front door must open even if the counts can't be read — a failed
  // figure fetch shows blanks, never a broken page.
  loader: async () => {
    try {
      return await getPublicStats();
    } catch {
      return { programs: 0, schools: 0, players: 0, sourcedFields: 0 };
    }
  },
  component: Index,
});

function Index() {
  const stats = Route.useLoaderData();
  const navigate = useNavigate();
  const { account, signedIn } = useMyAccount();

  // Signed-in people never need the front door — send them straight to work.
  useEffect(() => {
    if (signedIn && account) {
      navigate({ to: routeForRole(account.primaryRole), replace: true });
    }
  }, [signedIn, account, navigate]);

  const fmt = (value: number) => value.toLocaleString("en-US");
  const figures = [
    { label: "Programs tracked", value: fmt(stats.programs) },
    { label: "Universities", value: fmt(stats.schools) },
    { label: "Roster entries", value: fmt(stats.players) },
    { label: "Sourced fields", value: fmt(stats.sourcedFields) },
  ];

  const points = [
    {
      icon: BadgeCheck,
      title: "Verified data",
      body: "Tuition, enrollment, admissions and roster figures carry a source link and a verification date on the field itself.",
    },
    {
      icon: Database,
      title: "One shared college database",
      body: "Universities, programs, majors, rosters and classifications maintained centrally and read by every organization.",
    },
    {
      icon: ShieldCheck,
      title: "Scoped by organization",
      body: "Staff, parents and players read the shared database. Only platform staff can change it, and every edit is logged.",
    },
  ];

  return (
    <div className="stadium-gradient min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex items-center gap-2.5">
          <OrgMark logoUrl={null} name={null} size={32} className="bg-white/10" />
          <span className="font-display text-lg font-bold text-white">Curve Recruit</span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          <p className="mb-4 font-mono text-[11px] font-medium tracking-[0.18em] text-org-accent uppercase">
            College baseball &amp; softball
          </p>
          <h1 className="max-w-3xl font-display text-[2.5rem] leading-[1.05] font-bold text-white sm:text-[3.5rem]">
            Recruiting research that separates fact from opinion.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-white/75 sm:text-lg">
            Every academic, athletic and cost figure is sourced and dated. Every judgment call is
            labeled as ours. No blended guesswork.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="touch-target bg-seam-red px-7 text-base font-semibold text-white hover:bg-seam-red/90"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
            <span className="text-sm text-white/55">
              Need access? Ask your program admin for an invite code.
            </span>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/12 pt-8 sm:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt className="meta text-white/55">{figure.label}</dt>
                <dd className="tabular font-display text-3xl font-bold text-white sm:text-4xl">
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-6 border-t border-white/12 pt-8 sm:grid-cols-3">
          {points.map((point) => (
            <div key={point.title}>
              <point.icon className="size-5 text-org-accent" aria-hidden />
              <h2 className="mt-3 text-sm font-semibold text-white">{point.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
