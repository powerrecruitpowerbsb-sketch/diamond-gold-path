import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Curve Recruit" },
      { name: "description", content: "Choose a new password for your Curve Recruit account." },
      { property: "og:title", content: "Set a new password — Curve Recruit" },
      {
        property: "og:description",
        content: "Choose a new password for your Curve Recruit account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash ?? "";
    const isRecovery = hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (isRecovery && session)) setRecovery(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (isRecovery || data.session) setRecovery(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — sign in with your new password");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stadium-gradient grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[0_18px_40px_-24px_rgba(18,35,58,0.6)] sm:p-7">
        <h1 className="font-display text-2xl font-bold text-graphite">Set a new password</h1>
        {ready && !recovery ? (
          <>
            <p className="mt-2 text-sm text-steel">
              This link is no longer valid. Request a fresh reset email and try again.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full touch-target">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
                className="mt-1.5"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="touch-target w-full bg-seam-red text-white hover:bg-seam-red/90"
            >
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
