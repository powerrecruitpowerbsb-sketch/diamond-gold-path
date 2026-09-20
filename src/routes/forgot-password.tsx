import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Curve Recruit" },
      {
        name: "description",
        content: "Request a password reset link for your Curve Recruit account.",
      },
      { property: "og:title", content: "Reset your password — Curve Recruit" },
      {
        property: "og:description",
        content: "Request a password reset link for your Curve Recruit account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stadium-gradient grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[0_18px_40px_-24px_rgba(18,35,58,0.6)] sm:p-7">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto size-8 text-diamond-green" aria-hidden />
            <h1 className="mt-3 font-display text-2xl font-bold text-graphite">Reset link sent</h1>
            <p className="mt-2 text-sm text-steel">
              If an account exists for {email}, a reset link is on its way.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full touch-target">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-graphite">Reset your password</h1>
            <p className="mt-1 text-sm text-steel">
              Enter your email and we'll send you a link to set a new password.
            </p>
            <form onSubmit={submit} className="mt-5 grid gap-4">
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
              <Button
                type="submit"
                disabled={busy}
                className="touch-target w-full bg-seam-red text-white hover:bg-seam-red/90"
              >
                Send reset link
              </Button>
              <Link to="/auth" className="text-center text-xs font-semibold text-org-primary hover:underline">
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
