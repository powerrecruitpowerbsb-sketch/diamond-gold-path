import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import curveMark from "@/assets/curve-mark-white.png.asset.json";
import heroPitcher from "@/assets/hero-dual.jpg";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccount } from "@/lib/admin.functions";
import { routeForRole } from "@/lib/role-routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Curve Recruit" },
      { name: "description", content: "Sign in to Curve Recruit." },
      { property: "og:title", content: "Sign in — Curve Recruit" },
      { property: "og:description", content: "Sign in to Curve Recruit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const account = useServerFn(getMyAccount);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const me = await account();
        navigate({ to: routeForRole(me.primaryRole), replace: true });
      } catch {
        /* stay */
      }
    });
  }, [account, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const me = await account();
      navigate({ to: routeForRole(me.primaryRole), replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 h-12 border-white/15 bg-white/5 text-base text-white placeholder:text-white/30 focus-visible:ring-org-accent";

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-0">
      <div className="absolute inset-0 lg:left-1/2">
        <img
          src={heroPitcher}
          alt="A college pitcher in his windup under stadium lights"
          width={1280}
          height={1600}
          className="size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/80 to-surface-0/30 lg:bg-gradient-to-r lg:from-surface-0 lg:via-transparent lg:to-surface-0/40" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-8 sm:px-12 sm:py-12 lg:w-1/2 lg:stadium-gradient">
        <Link to="/" className="inline-flex items-center gap-2.5 self-start">
          <img src={curveMark.url} alt="" aria-hidden className="size-9 object-contain" />
          <span className="font-display text-lg font-bold text-white">Curve Recruit</span>
        </Link>

        <div className="flex flex-1 flex-col justify-end lg:justify-center">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-4xl font-bold text-white">Sign in</h1>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div>
                <Label htmlFor="email" className="text-white/70">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className={field}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password" className="text-white/70">Password</Label>
                  <Link to="/forgot-password" className="text-xs font-semibold text-white/60 hover:text-white">
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={field}
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="touch-target mt-2 h-12 w-full bg-seam-red text-base font-semibold text-white hover:bg-seam-red/90"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Sign in
              </Button>
            </form>

            <p className="mt-6 font-mono text-[11px] tracking-[0.15em] text-white/40 uppercase">
              Invite only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
