import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

export type InviteRoleValue = "org_admin" | "org_staff" | "parent" | "player";

export type SendInviteResult = {
  status: "sent" | "already_invited" | "already_member";
  email: string;
  inviteId?: string;
  message: string;
};

/**
 * THE one place an invite row is created and an email is sent. The athlete
 * page, the settings screen and the CSV importer all route through this, so
 * role assignment and athlete linking stay in trusted server code.
 */
export async function sendInviteCore(args: {
  actorUserId: string;
  orgId: string;
  email: string;
  role: InviteRoleValue;
  athleteId: string | null;
  redirectTo?: string | undefined;
}): Promise<SendInviteResult> {
  const email = args.email.trim().toLowerCase();

  // Already has an account in this organization → link, don't re-invite.
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, organization_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing && (existing as any).organization_id === args.orgId) {
    if (args.athleteId) {
      await supabaseAdmin.from("athlete_family_links").upsert(
        {
          org_athlete_id: args.athleteId,
          user_id: (existing as any).id,
          relationship: args.role,
        },
        { onConflict: "org_athlete_id,user_id" },
      );
    }
    return {
      status: "already_member",
      email,
      message: `${email} already has an account — linked instead of re-invited.`,
    };
  }

  // Pending invite for the same scope (organization-wide for staff, per athlete
  // for families) → don't send a second email.
  let pendingQuery = supabaseAdmin
    .from("org_member_invites")
    .select("id")
    .eq("organization_id", args.orgId)
    .eq("status", "pending")
    .ilike("email", email);
  pendingQuery = args.athleteId
    ? pendingQuery.eq("org_athlete_id", args.athleteId)
    : pendingQuery.is("org_athlete_id", null);

  const { data: pending } = await pendingQuery.maybeSingle();
  if (pending) {
    return { status: "already_invited", email, message: `${email} already has a pending invite.` };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("org_member_invites")
    .insert({
      organization_id: args.orgId,
      email,
      invited_role: args.role,
      org_athlete_id: args.athleteId,
      invited_by: args.actorUserId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  const inviteId = (inserted as { id: string }).id;
  const options = args.redirectTo ? { redirectTo: args.redirectTo } : {};

  const { error: sendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, options);

  if (sendError) {
    const message = sendError.message ?? "";
    if (/already been registered|already registered|email_exists/i.test(message)) {
      // Auth account exists but isn't a member here — a set-password email
      // still gets them in, and the signup/accept path applies the invite.
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, options);
      if (resetError) {
        await supabaseAdmin.from("org_member_invites").delete().eq("id", inviteId);
        throw new Error(resetError.message);
      }
      return { status: "sent", email, inviteId, message: `Invite email sent to ${email}.` };
    }
    await supabaseAdmin.from("org_member_invites").delete().eq("id", inviteId);
    throw new Error(message || "Could not send the invite email");
  }

  return { status: "sent", email, inviteId, message: `Invite email sent to ${email}.` };
}

/** Re-sends the set-password email for a still-pending invite. */
export async function resendInviteCore(email: string, redirectTo?: string | undefined) {
  const options = redirectTo ? { redirectTo } : {};
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, options);
  if (error) {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, options);
    if (inviteError) throw new Error(inviteError.message);
  }
}
