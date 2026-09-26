import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getOnboardingBoard, resendOrgInvite } from "@/lib/invites.functions";
import { cn } from "@/lib/utils";

type Slot = { state: "joined" | "invited" | "none"; inviteId?: string; email?: string };
type Filter = "all" | "missing" | "invited";

/** Leadership view: who has logged in, who is invited, who has no email yet. */
export function OnboardingPanel() {
  const boardFn = useServerFn(getOnboardingBoard);
  const resendFn = useServerFn(resendOrgInvite);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("missing");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ["onboarding-board"],
    queryFn: () => boardFn(),
    retry: false,
  });

  if (error) return null; // not a manager — nothing to show
  const rows = data?.rows ?? [];
  const slots = rows.flatMap((r) => [r.player, r.parent]);
  const joined = slots.filter((s) => s.state === "joined").length;
  const invited = slots.filter((s) => s.state === "invited").length;
  const none = slots.filter((s) => s.state === "none").length;

  const visible = rows.filter((r) => {
    if (filter === "missing") return r.player.state === "none" || r.parent.state === "none";
    if (filter === "invited") return r.player.state === "invited" || r.parent.state === "invited";
    return true;
  });

  async function resend(s: Slot) {
    if (!s.inviteId) return;
    setBusy(s.inviteId);
    try {
      const result = await resendFn({ data: { id: s.inviteId } });
      toast.success(`Invite re-sent to ${result.email}`);
      await queryClient.invalidateQueries({ queryKey: ["onboarding-board"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const chip = (label: string, s: Slot, athleteId: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase",
          s.state === "joined" && "bg-diamond-green/15 text-diamond-green",
          s.state === "invited" && "bg-org-accent/20 text-graphite",
          s.state === "none" && "bg-chalk text-steel",
        )}
      >
        {label} · {s.state === "joined" ? "Joined" : s.state === "invited" ? "Invited" : "No email"}
      </span>
      {s.state === "invited" && data?.canInvite ? (
        <button
          type="button"
          disabled={busy === s.inviteId}
          onClick={() => resend(s)}
          className="text-xs font-semibold text-org-primary disabled:opacity-50"
        >
          Resend
        </button>
      ) : null}
      {s.state === "none" && data?.canInvite ? (
        <Link to="/roster/$id" params={{ id: athleteId }} className="text-xs font-semibold text-org-primary">
          Invite
        </Link>
      ) : null}
    </span>
  );

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-graphite">Onboarding</h2>
        <Link to="/roster/new" className="text-sm font-semibold text-org-primary">
          Add & invite
        </Link>
      </div>
      {isPending ? (
        <p className="mt-3 text-sm text-steel">Loading…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-steel tabular-nums">
            {joined} joined · {invited} invited · {none} no email — across {rows.length} athletes
          </p>
          <div className="mt-3 flex gap-2">
            {(["missing", "invited", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "touch-target rounded-full border px-3 text-xs font-semibold",
                  filter === f ? "border-org-primary bg-org-primary text-org-primary-foreground" : "border-border text-steel",
                )}
              >
                {f === "missing" ? "Missing" : f === "invited" ? "Invited" : "All"}
              </button>
            ))}
          </div>
          {visible.length ? (
            <ul className="mt-3 divide-y divide-border/70">
              {visible.slice(0, 40).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to="/roster/$id" params={{ id: r.id }} className="text-sm font-semibold text-graphite">
                    {r.name}
                    {r.gradYear ? <span className="ml-2 font-mono text-xs text-steel">{r.gradYear}</span> : null}
                  </Link>
                  <span className="flex flex-wrap gap-3">
                    {chip("Player", r.player, r.id)}
                    {chip("Parent", r.parent, r.id)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-steel">Nothing here.</p>
          )}
          {visible.length > 40 ? (
            <Link to="/roster" className="mt-2 inline-block text-sm font-semibold text-org-primary">
              See full roster
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
