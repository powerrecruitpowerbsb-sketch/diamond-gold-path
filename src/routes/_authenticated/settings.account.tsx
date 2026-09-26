import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccount } from "@/hooks/use-my-account";
import { updateMyName } from "@/lib/admin.functions";
import { roleLabel } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "Account — Curve Recruit" },
      { name: "description", content: "Your name, email, password and sign-out." },
      { property: "og:title", content: "Account — Curve Recruit" },
      { property: "og:description", content: "Manage your Curve Recruit account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

const inputCls =
  "h-11 w-full min-w-0 rounded-lg border border-white/10 bg-transparent px-3 text-sm text-graphite placeholder:text-steel focus:border-org-primary focus:outline-none";
const btnCls =
  "h-11 shrink-0 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-50";

function Card({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="card-panel relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-org-primary via-org-primary/70 to-transparent" />
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="font-display flex items-center gap-2 text-lg font-bold uppercase tracking-wide text-graphite">
          <span aria-hidden className="h-4 w-1 rounded-full bg-org-primary" />
          {title}
        </h2>
        {tag ? <span className="font-mono text-[11px] uppercase tracking-wider text-steel">{tag}</span> : null}
      </div>
      {children}
    </section>
  );
}

function AccountPage() {
  const { account, isPending } = useMyAccount();
  const profile = (account as any)?.profile as { name?: string | null; email?: string | null } | null;
  const role = (account as any)?.primaryRole as string | undefined;

  return (
    <AppShell right={<AuthButton />}>
      <div className="max-w-3xl space-y-5 sm:space-y-6">
        <div>
          <p className="meta text-org-accent">Settings</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-graphite">Account</h1>
        </div>
        {isPending ? (
          <div className="h-64 animate-pulse rounded-2xl bg-card" />
        ) : (
          <>
            <NameCard current={profile?.name ?? ""} role={roleLabel(role)} />
            <EmailCard current={profile?.email ?? ""} />
            <PasswordCard />
            <SignOutCard />
          </>
        )}
      </div>
    </AppShell>
  );
}

function NameCard({ current, role }: { current: string; role: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateMyName);
  const [name, setName] = useState(current);
  useEffect(() => setName(current), [current]);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { name } }),
    onSuccess: () => {
      toast.success("Name saved");
      qc.invalidateQueries({ queryKey: ["my-account"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card title="Profile" tag={role}>
      <label className="meta text-steel" htmlFor="acct-name">Name</label>
      <form
        className="mt-1 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <button className={btnCls} disabled={save.isPending || !name.trim() || name.trim() === current}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </Card>
  );
}

function EmailCard({ current }: { current: string }) {
  const [email, setEmail] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setEmail(current), [current]);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/settings/account` },
    );
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Check both inboxes to confirm the change");
  };
  return (
    <Card title="Email">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <button className={btnCls} disabled={busy || !email.trim() || email.trim() === current}>
          {busy ? "Sending…" : "Change"}
        </button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && pw !== confirm;
  const submit = async () => {
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    if (pw !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      setPw("");
      setConfirm("");
    }
  };
  return (
    <Card title="Password">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
        <input type="password" autoComplete="new-password" placeholder="Confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        <button className={btnCls} disabled={busy || !pw || !confirm}>
          {busy ? "Saving…" : "Update"}
        </button>
      </form>
      {mismatch ? <p className="mt-2 text-xs text-seam-red">Passwords don't match</p> : null}
    </Card>
  );
}

function SignOutCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <button
      onClick={signOut}
      className="touch-target h-11 w-full rounded-lg border border-seam-red/40 text-sm font-semibold text-seam-red hover:bg-seam-red/10"
    >
      Sign out
    </button>
  );
}
