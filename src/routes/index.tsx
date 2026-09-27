import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { getPublicStats } from "@/lib/console.functions";
import { useMyAccount } from "@/hooks/use-my-account";
import { routeForRole } from "@/lib/role-routes";
import { Button } from "@/components/ui/button";
import curveMark from "@/assets/curve-mark-white.png.asset.json";
import heroPitcher from "@/assets/hero-dual.jpg";

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
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { account, signedIn } = useMyAccount();

  // Signed-in people never need the front door — send them straight to work.
  useEffect(() => {
    if (signedIn && account) {
      navigate({ to: routeForRole(account.primaryRole), replace: true });
    }
  }, [signedIn, account, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-0">
      {/* The field: full-bleed behind everything on phones, right half on desktop */}
      <div className="absolute inset-0 lg:left-1/2">
        <img
          src={heroPitcher}
          alt="A college pitcher in his windup under stadium lights"
          width={1280}
          height={1600}
          className="size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/70 to-surface-0/20 lg:bg-gradient-to-r lg:from-surface-0 lg:via-transparent lg:to-surface-0/40" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-8 sm:px-12 sm:py-12 lg:w-1/2 lg:stadium-gradient">
        <div className="flex items-center gap-2.5">
          <img src={curveMark.url} alt="Curve Recruit" width={34} height={34} className="size-9 object-contain" />
          <span className="font-display text-lg font-bold text-white">Curve Recruit</span>
        </div>

        <div className="flex flex-1 flex-col justify-end pb-4 lg:justify-center lg:pb-0">
          <p className="mb-4 flex items-center gap-3 font-mono text-[11px] font-medium tracking-[0.25em] text-org-accent uppercase">
            <span className="h-px w-8 bg-org-accent" />
            Baseball &amp; softball
          </p>
          <h1 className="max-w-xl font-display text-[2.8rem] leading-[1.02] font-bold text-white sm:text-[3.8rem]">
            Recruiting,
            <br />
            Made <span className="text-seam-red">Transparent.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 italic sm:text-lg">
            Connecting organizations, players, and families with clarity at every step.
          </p>

          <Button
            asChild
            className="touch-target mt-8 w-full bg-seam-red px-8 text-base font-semibold text-white hover:bg-seam-red/90 sm:w-auto sm:self-start"
          >
            <Link to="/auth">Sign in</Link>
          </Button>

          <ul className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-white/12 pt-6">
            {["Organizations", "Players", "Families"].map((label, index) => (
              <li key={label}>
                <span className="font-mono text-[10px] text-org-accent">0{index + 1}</span>
                <p className="mt-1 font-display text-sm font-semibold text-white sm:text-base">{label}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
