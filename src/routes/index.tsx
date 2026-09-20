import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Database, Send } from "lucide-react";

import { getPublicStats } from "@/lib/console.functions";
import { useMyAccount } from "@/hooks/use-my-account";
import { routeForRole } from "@/lib/role-routes";
import { Button } from "@/components/ui/button";
import curveMark from "@/assets/curve-mark-white.png.asset.json";
import heroPitcher from "@/assets/hero-pitcher.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curve Recruit — College Baseball & Softball Recruiting Research" },
      {
        name: "description",
        content:
          "Sign in to Curve Recruit to research college baseball and softball programs with verified academic, athletic and cost data.",
      },
      { property: "og:title", content: "Curve Recruit — Recruiting Research Platform" },
      {
        property: "og:description",
        content:
          "Verified program, academic and cost data for college baseball and softball, paired with staff intelligence.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://diamond-gold-path.lovable.app/" },
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
    { label: "Programs", value: fmt(stats.programs) },
    { label: "Schools", value: fmt(stats.schools) },
    { label: "Roster entries", value: fmt(stats.players) },
    { label: "Sourced fields", value: fmt(stats.sourcedFields) },
  ];

  const points = [
    { icon: BadgeCheck, title: "Verified data", body: "Every figure carries its source." },
    { icon: Database, title: "One college database", body: "Shared by every organization." },
    { icon: Send, title: "Scout cards & outreach", body: "Share a player in one link." },
  ];

  return (
    <div className="min-h-screen bg-surface-0">
      <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Left: the entrance */}
        <div className="stadium-gradient relative z-10 flex flex-col px-6 py-8 sm:px-12 sm:py-12">
          <div className="flex items-center gap-2.5">
            <img src={curveMark.url} alt="Curve Recruit" width={34} height={34} className="size-9 object-contain" />
            <span className="font-display text-lg font-bold text-white">Curve Recruit</span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-14">
            <p className="mb-4 font-mono text-[11px] font-medium tracking-[0.2em] text-org-accent uppercase">
              College baseball &amp; softball
            </p>
            <h1 className="max-w-xl font-display text-[2.6rem] leading-[1.03] font-bold text-white sm:text-[3.4rem]">
              Recruiting built on verified data.
            </h1>
            <p className="mt-5 max-w-md text-base text-white/70">
              Sourced, dated, and honest about what a school hasn&apos;t published.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                asChild
                className="touch-target bg-seam-red px-8 text-base font-semibold text-white hover:bg-seam-red/90"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
              <span className="text-sm text-white/50">Invite code from your program admin.</span>
            </div>

            <dl className="mt-14 grid max-w-lg grid-cols-2 gap-x-6 gap-y-7 border-t border-white/12 pt-8 sm:grid-cols-4">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <dd className="tabular font-display text-2xl font-bold text-white sm:text-[1.75rem]">
                    {figure.value}
                  </dd>
                  <dt className="meta mt-0.5 text-white/45">{figure.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid gap-4 border-t border-white/12 pt-6 sm:grid-cols-3">
            {points.map((point) => (
              <div key={point.title} className="flex items-start gap-2.5">
                <point.icon className="mt-0.5 size-4 shrink-0 text-org-accent" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold text-white">{point.title}</h2>
                  <p className="text-xs text-white/50">{point.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: the field */}
        <div className="relative min-h-[340px] overflow-hidden lg:min-h-screen">
          <img
            src={heroPitcher}
            alt="A college pitcher in his windup under stadium lights"
            width={1280}
            height={1600}
            className="absolute inset-0 size-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/25 to-transparent lg:bg-gradient-to-r lg:from-surface-0 lg:via-transparent lg:to-surface-0/40" />
        </div>
      </div>
    </div>
  );
}
