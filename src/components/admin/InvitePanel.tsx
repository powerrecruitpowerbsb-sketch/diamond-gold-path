import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, RotateCcw, Send, Trash2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

import {
  INVITE_ROLE_LABEL,
  listInvites,
  removeOrgMember,
  resendOrgInvite,
  revokeOrgInvite,
  sendOrgInvite,
  unlinkFamilyMember,
} from "@/lib/invites.functions";
import { cn } from "@/lib/utils";
import { InviteRows, type InviteRow } from "@/components/admin/InviteRows";

type Props = {
  /** Present for family invites on an athlete page; omitted for staff invites. */
  athleteId?: string | null;
  title: string;
  description: string;
  roles: { value: string; label: string; hint?: string }[];
  peopleLabel: string;
  emptyPeople: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-org-accent/50 bg-org-accent/15 text-navy-deep",
  accepted: "border-diamond-green/30 bg-diamond-green-tint text-diamond-green",
  revoked: "border-border bg-chalk text-steel",
  expired: "border-border bg-chalk text-steel",
};

/**
 * Shared invite surface. The athlete page, settings/team and the CSV importer
 * all send through the same server function, so this is purely presentation.
 */
export function InvitePanel({
  athleteId = null,
  title,
  description,
  roles,
  peopleLabel,
  emptyPeople,
}: Props) {
  const listFn = useServerFn(listInvites);
  const sendFn = useServerFn(sendOrgInvite);
  const resendFn = useServerFn(resendOrgInvite);
  const revokeFn = useServerFn(revokeOrgInvite);
  const unlinkFn = useServerFn(unlinkFamilyMember);
  const removeFn = useServerFn(removeOrgMember);
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);

  const queryKey = ["org-invites", athleteId ?? "org"];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { athleteId } }),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    if (athleteId) await queryClient.invalidateQueries({ queryKey: ["org-athlete", athleteId] });
  };

  async function sendRows(rows: InviteRow[]) {
    setBusy(true);
    let sent = 0;
    let failed = 0;
    try {
      for (const row of rows) {
        const name = `${row.firstName} ${row.lastName}`.trim() || null;
        try {
          const result = await sendFn({ data: { email: row.email.trim(), role: row.role as any, athleteId, name } });
          if (result.status === "sent") sent++;
          else toast.info(result.message);
        } catch (error) {
          failed++;
          toast.error(`${row.email}: ${(error as Error).message}`);
        }
      }
      if (sent) toast.success(`${sent} invite${sent === 1 ? "" : "s"} sent`);
      await invalidate();
    } finally {
      setBusy(false);
    }
    return failed === 0;
  }

  const invites = (data?.invites ?? []) as Record<string, any>[];
  const people = data?.people ?? [];
  const staffBlocked = !athleteId && data && !data.canInviteStaff;

  return (
    <section className="mt-6 rounded border border-border bg-card p-6">
      <h2 className="font-display text-xl font-bold text-graphite">{title}</h2>
      <p className="mt-1 text-sm text-steel">{description}</p>

      {staffBlocked ? (
        <p className="mt-3 rounded-lg border border-border bg-chalk p-3 text-sm text-steel">
          Only organization admins can invite staff members.
        </p>
      ) : (
        <InviteRows roles={roles} busy={busy} onSend={sendRows} />
      )}

      {/* Accepted / linked people */}
      <div className="mt-6">
        <h3 className="font-mono text-[11px] tracking-wide text-steel uppercase">{peopleLabel}</h3>
        {isPending ? (
          <p className="mt-2 text-sm text-steel">Loading…</p>
        ) : people.length === 0 ? (
          <p className="mt-2 text-sm text-steel">{emptyPeople}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {people.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-semibold text-graphite">{person.name ?? person.email}</span>
                <span className="rounded-md border border-border bg-chalk px-2 py-0.5 text-[11px] font-bold text-steel">
                  {INVITE_ROLE_LABEL[person.role] ?? person.role}
                </span>
                <span className="font-mono text-xs text-steel">{person.email ?? "—"}</span>
                <span className="ml-auto flex items-center gap-3">
                  {athleteId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${person.name ?? person.email} from this athlete?`))
                          return;
                        try {
                          await unlinkFn({ data: { athleteId, userId: person.id } });
                          await invalidate();
                          toast.success("Family access removed");
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-steel hover:text-seam-red"
                    >
                      <UserMinus className="size-3.5" aria-hidden /> Remove access
                    </button>
                  ) : null}
                  {data?.canInviteStaff && person.role !== "org_owner" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Delete ${person.name ?? person.email}'s account? They will no longer be able to sign in.`,
                          )
                        )
                          return;
                        try {
                          await removeFn({ data: { userId: person.id } });
                          await invalidate();
                          await queryClient.invalidateQueries({ queryKey: ["season-detail"] });
                          toast.success("Account deleted");
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-seam-red hover:underline"
                    >
                      <Trash2 className="size-3.5" aria-hidden /> Delete account
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invites */}
      <div className="mt-6">
        <h3 className="font-mono text-[11px] tracking-wide text-steel uppercase">Invites</h3>
        {invites.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-steel">
            <Mail className="size-4" aria-hidden /> No invites sent yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {invites.map((invite) => {
              const expired =
                invite['status'] === "pending" &&
                invite['expires_at'] &&
                new Date(invite['expires_at']).getTime() < Date.now();
              const status = expired ? "expired" : String(invite['status']);
              return (
                <li key={invite['id']} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="font-semibold text-graphite">{invite['email']}</span>
                  <span className="rounded-md border border-border bg-chalk px-2 py-0.5 text-[11px] font-bold text-steel">
                    {INVITE_ROLE_LABEL[invite['invited_role']] ?? invite['invited_role']}
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] font-bold capitalize",
                      STATUS_STYLE[status] ?? STATUS_STYLE['revoked'],
                    )}
                  >
                    {status === "pending" ? "sent" : status}
                  </span>
                  <span className="font-mono text-[11px] text-steel">
                    sent {new Date(invite['created_at']).toLocaleDateString()}
                  </span>
                  {invite['status'] === "pending" ? (
                    <span className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await resendFn({ data: { id: invite['id'] } });
                            await invalidate();
                            toast.success(`Invite re-sent to ${invite['email']}`);
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-org-primary hover:underline"
                      >
                        <RotateCcw className="size-3.5" aria-hidden /> Resend
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await revokeFn({ data: { id: invite['id'] } });
                            await invalidate();
                            toast.success("Invite revoked");
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-steel hover:text-seam-red"
                      >
                        <X className="size-3.5" aria-hidden /> Revoke
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
