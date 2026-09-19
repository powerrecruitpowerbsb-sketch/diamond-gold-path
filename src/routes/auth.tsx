import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccount, validateInviteCode } from "@/lib/admin.functions";
import { routeForRole } from "@/lib/role-routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Power Recruit" },
      {
        name: "description",
        content:
          "Sign in to Power Recruit to research verified college baseball and softball program data.",
      },
      { property: "og:title", content: "Sign in — Power Recruit" },
      {
        property: "og:description",
        content: "Access the Power Recruit college baseball and softball research database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const account = useServerFn(getMyAccount);
  const checkInvite = useServerFn(validateInviteCode);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const me = await account();
        navigate({ to: routeForRole(me.primaryRole), replace: true });
      } catch {
        /* stay on the sign-in screen */
      }
    });
  }, [account, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Enter your name");
        const invite = await checkInvite({ data: { code: inviteCode } });
        if (!invite.valid) {
          throw new Error("That invite code isn't valid. Ask your program admin for a current code.");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim(), invite_code: inviteCode.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setConfirmSent(true);
        toast.success(`Account created for ${invite.organizationName ?? "your organization"}`);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const me = await account();
        navigate({ to: routeForRole(me.primaryRole), replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-chalk">
      <div className="stadium-gradient relative">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-28 sm:px-6 sm:pt-10 sm:pb-36">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span
              className="grid size-9 place-items-center rounded-md bg-org-accent font-display text-base font-bold text-navy-deep"
              aria-hidden
            >
              P
            </span>
            <span className="font-display text-xl font-bold text-white">Power Recruit</span>
          </Link>
          <h1 className="mt-8 max-w-xl font-display text-3xl font-bold text-white sm:text-4xl">
            Verified college baseball and softball program research.
          </h1>
          <p className="mt-3 max-w-lg text-sm text-white/70">
            Sourced school data, program detail, and Power Recruit intelligence — in one place for
            your staff and families.
          </p>
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-20 max-w-md px-4 pb-16 sm:-mt-24 sm:px-6">
        <div className="surface-raised rounded-2xl p-6 sm:p-7">
          {confirmSent ? (
            <div className="text-center">
              <BadgeCheck className="mx-auto size-8 text-diamond-green" aria-hidden />
              <h2 className="mt-3 font-display text-2xl font-bold text-graphite">Check your email</h2>
              <p className="mt-2 text-sm text-steel">
                We sent a confirmation link to <span className="font-semibold">{email}</span>. Confirm
                it, then sign in.
              </p>
              <Button
                variant="outline"
                className="mt-5 w-full touch-target"
                onClick={() => {
                  setConfirmSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                {(["signin", "signup"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={
                      mode === option
                        ? "rounded-[9px] bg-card py-2 text-sm font-semibold text-org-primary shadow-sm"
                        : "rounded-[9px] py-2 text-sm font-medium text-steel"
                    }
                  >
                    {option === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <h2 className="font-display text-2xl font-bold text-graphite">
                {mode === "signin" ? "Welcome back" : "Join your program"}
              </h2>
              <p className="mt-1 text-sm text-steel">
                {mode === "signin"
                  ? "Use the email your program was set up with."
                  : "You'll need the invite code from your program admin."}
              </p>

              <form onSubmit={submit} className="mt-5 grid gap-4">
                {mode === "signup" ? (
                  <div>
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      required
                      className="mt-1.5"
                    />
                  </div>
                ) : null}

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" ? (
                      <Link
                        to="/forgot-password"
                        className="text-xs font-semibold text-org-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    ) : null}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    minLength={8}
                    required
                    className="mt-1.5"
                  />
                </div>

                {mode === "signup" ? (
                  <div>
                    <Label htmlFor="invite">Invite code</Label>
                    <Input
                      id="invite"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value)}
                      placeholder="POWERBB-2026"
                      required
                      className="mt-1.5 font-mono"
                    />
                    <p className="meta mt-1.5">Codes are issued per organization by Power Recruit staff.</p>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={busy}
                  className="touch-target mt-1 w-full bg-seam-red text-white hover:bg-seam-red/90"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
