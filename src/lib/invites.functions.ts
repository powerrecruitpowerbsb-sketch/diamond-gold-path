import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

const str = (value: unknown) => String(value ?? "").trim();

export const INVITE_ROLES = ["org_admin", "org_staff", "parent", "player"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const INVITE_ROLE_LABEL: Record<InviteRole, string> = {
  org_admin: "Admin",
  org_staff: "Staff",
  parent: "Parent",
  player: "Player",
};

const FAMILY_ROLES: InviteRole[] = ["parent", "player"];
const STAFF_ROLES: InviteRole[] = ["org_admin", "org_staff"];

type Ctx = { supabase: any; userId: string };

/**
 * Resolves who is calling and which organization they act on. Invites are the
 * one place where role matters twice: staff invites are admin-only, family
 * invites are open to any org manager.
 */
async function requireInviteActor(context: Ctx, organizationId?: string | null) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, organization_id")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);

  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const isOrgAdmin = roleList.includes("org_admin");
  const isManager = isOrgAdmin || roleList.includes("org_staff");
  const ownOrg = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (!isSuperadmin && !isManager) throw new Error("Forbidden: organization staff only");

  // Superadmins may act on any organization; everyone else is pinned to theirs.
  const orgId = isSuperadmin ? (str(organizationId) || ownOrg) : ownOrg;
  if (!orgId) throw new Error("No organization selected for this invite");

  return { orgId, isSuperadmin, isOrgAdmin, isManager };
}

function assertCanInviteRole(
  actor: { isSuperadmin: boolean; isOrgAdmin: boolean },
  role: InviteRole,
) {
  if (STAFF_ROLES.includes(role) && !actor.isSuperadmin && !actor.isOrgAdmin) {
    throw new Error("Only organization admins can invite staff members");
  }
}

function normalizeEmail(value: unknown) {
  const email = str(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Enter a valid email address");
  return email;
}

function acceptUrl() {
  try {
    const request = getRequest();
    return new URL("/reset-password", new URL(request.url).origin).toString();
  } catch {
    return undefined;
  }
}

/** Athlete must belong to the organization the invite is scoped to. */
async function requireAthleteInOrg(context: Ctx, athleteId: string, orgId: string) {
  const { data, error } = await context.supabase
    .from("org_athletes")
    .select("id, name, organization_id")
    .eq("id", athleteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data as any).organization_id !== orgId) {
    throw new Error("Athlete not found in this organization");
  }
  return data as { id: string; name: string };
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId?: string | null; organizationId?: string | null } | undefined) => ({
    athleteId: str(input?.athleteId) || null,
    organizationId: str(input?.organizationId) || null,
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireInviteActor(context as any, data.organizationId);

    let query = context.supabase
      .from("org_member_invites")
      .select(
        "id, email, invited_role, org_athlete_id, status, expires_at, created_at, accepted_at, accepted_user_id",
      )
      .eq("organization_id", actor.orgId)
      .order("created_at", { ascending: false });

    query = data.athleteId
      ? query.eq("org_athlete_id", data.athleteId)
      : query.is("org_athlete_id", null);

    const { data: invites, error } = await query;
    if (error) throw new Error(error.message);

    // Accepted people: family links for an athlete, org members for staff.
    let people: { id: string; name: string | null; email: string | null; role: string }[] = [];

    if (data.athleteId) {
      const { data: links } = await context.supabase
        .from("athlete_family_links")
        .select("user_id, relationship, users:user_id (id, name, email)")
        .eq("org_athlete_id", data.athleteId);
      people = ((links ?? []) as any[]).map((row) => ({
        id: row.user_id,
        name: row.users?.name ?? null,
        email: row.users?.email ?? null,
        role: row.relationship,
      }));
    } else {
      const { data: members } = await context.supabase
        .from("users")
        .select("id, name, email, user_type")
        .eq("organization_id", actor.orgId)
        .in("user_type", STAFF_ROLES)
        .order("name", { ascending: true });
      people = ((members ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name ?? null,
        email: row.email ?? null,
        role: row.user_type,
      }));
    }

    return {
      invites: (invites ?? []) as Record<string, any>[],
      people,
      canInviteStaff: actor.isSuperadmin || actor.isOrgAdmin,
      organizationId: actor.orgId,
    };
  });

/* ------------------------------------------------------------------ */
/* The single invite path                                              */
/* ------------------------------------------------------------------ */

type SendResult = {
  status: "sent" | "already_invited" | "already_member";
  email: string;
  inviteId?: string;
  message: string;
};

/**
 * THE one place an invite is created and emailed. Athlete pages, the settings
 * screen and the CSV importer all call this — never their own insert or send.
 */
async function sendInvite(
  context: Ctx,
  args: { orgId: string; email: string; role: InviteRole; athleteId: string | null },
): Promise<SendResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = args.email;

  // Already has an account in this organization → nothing to send.
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, organization_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing && (existing as any).organization_id === args.orgId) {
    if (args.athleteId) {
      // Link an existing family account straight to the athlete.
      await supabaseAdmin
        .from("athlete_family_links")
        .upsert(
          { org_athlete_id: args.athleteId, user_id: (existing as any).id, relationship: args.role },
          { onConflict: "org_athlete_id,user_id" },
        );
    }
    return {
      status: "already_member",
      email,
      message: `${email} already has an account — linked instead of re-invited.`,
    };
  }

  const { data: pending } = await supabaseAdmin
    .from("org_member_invites")
    .select("id")
    .eq("organization_id", args.orgId)
    .eq("status", "pending")
    .ilike("email", email)
    .is("org_athlete_id", args.athleteId ? undefined : null)
    .maybeSingle();

  if (pending && !args.athleteId) {
    return { status: "already_invited", email, message: `${email} already has a pending invite.` };
  }

  if (args.athleteId) {
    const { data: pendingForAthlete } = await supabaseAdmin
      .from("org_member_invites")
      .select("id")
      .eq("organization_id", args.orgId)
      .eq("org_athlete_id", args.athleteId)
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();
    if (pendingForAthlete) {
      return { status: "already_invited", email, message: `${email} already has a pending invite.` };
    }
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("org_member_invites")
    .insert({
      organization_id: args.orgId,
      email,
      invited_role: args.role,
      org_athlete_id: args.athleteId,
      invited_by: context.userId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  const inviteId = (inserted as { id: string }).id;
  const redirectTo = acceptUrl();

  // The account is created by the invite email; the signup trigger reads the
  // pending row above and applies role + org + athlete link server-side.
  const { error: sendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
  });

  if (sendError) {
    const message = sendError.message ?? "";
    const alreadyRegistered = /already been registered|already registered|email_exists/i.test(message);
    if (alreadyRegistered) {
      // Auth account exists (e.g. from another org or an unfinished invite):
      // send a set-password email instead so they can still get in.
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        ...(redirectTo ? { redirectTo } : {}),
      });
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

export const sendOrgInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      role: InviteRole;
      athleteId?: string | null;
      organizationId?: string | null;
    }) => ({
      email: str(input?.email),
      role: str(input?.role) as InviteRole,
      athleteId: str(input?.athleteId) || null,
      organizationId: str(input?.organizationId) || null,
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await requireInviteActor(context as any, data.organizationId);
    if (!INVITE_ROLES.includes(data.role)) throw new Error("Pick a role for this invite");
    assertCanInviteRole(actor, data.role);

    const email = normalizeEmail(data.email);
    const isFamily = FAMILY_ROLES.includes(data.role);

    if (isFamily) {
      if (!data.athleteId) throw new Error("Family invites need an athlete");
      await requireAthleteInOrg(context as any, data.athleteId, actor.orgId);
    } else if (data.athleteId) {
      throw new Error("Staff invites are not tied to an athlete");
    }

    return sendInvite(context as any, {
      orgId: actor.orgId,
      email,
      role: data.role,
      athleteId: isFamily ? data.athleteId : null,
    });
  });

export const resendOrgInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const actor = await requireInviteActor(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("org_member_invites")
      .select("id, email, invited_role, org_athlete_id, organization_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    const row = invite as any;
    if (!actor.isSuperadmin && row.organization_id !== actor.orgId) {
      throw new Error("Forbidden: that invite belongs to another organization");
    }
    assertCanInviteRole(actor, row.invited_role as InviteRole);
    if (row.status !== "pending") throw new Error("That invite is no longer pending");

    const redirectTo = acceptUrl();
    const { error: sendError } = await supabaseAdmin.auth.resetPasswordForEmail(row.email, {
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (sendError) {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email, {
        ...(redirectTo ? { redirectTo } : {}),
      });
      if (inviteError) throw new Error(inviteError.message);
    }

    await supabaseAdmin
      .from("org_member_invites")
      .update({ expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString() })
      .eq("id", row.id);

    return { ok: true, email: row.email as string };
  });

export const revokeOrgInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const actor = await requireInviteActor(context as any);
    const { data: invite, error } = await context.supabase
      .from("org_member_invites")
      .select("id, invited_role, organization_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    assertCanInviteRole(actor, (invite as any).invited_role as InviteRole);

    const { error: updateError } = await context.supabase
      .from("org_member_invites")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

export const unlinkFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; userId: string }) => ({
    athleteId: str(input?.athleteId),
    userId: str(input?.userId),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireInviteActor(context as any);
    await requireAthleteInOrg(context as any, data.athleteId, actor.orgId);
    const { error } = await context.supabase
      .from("athlete_family_links")
      .delete()
      .eq("org_athlete_id", data.athleteId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Family portal read                                                  */
/* ------------------------------------------------------------------ */

export const getFamilyPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: links, error } = await context.supabase
      .from("athlete_family_links")
      .select("org_athlete_id, relationship")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const athleteIds = ((links ?? []) as any[]).map((r) => r.org_athlete_id);
    if (!athleteIds.length) return { athletes: [] as Record<string, any>[] };

    const [{ data: athletes }, { data: saved }, { data: notes }] = await Promise.all([
      context.supabase
        .from("org_athletes")
        .select("id, name, grad_year, primary_position, bats, throws")
        .in("id", athleteIds),
      context.supabase
        .from("athlete_saved_schools")
        .select("id, org_athlete_id, status, notes, program_id")
        .in("org_athlete_id", athleteIds),
      context.supabase
        .from("org_player_notes")
        .select("id, org_athlete_id, note, created_at")
        .in("org_athlete_id", athleteIds)
        .eq("visible_to_parent", true)
        .order("created_at", { ascending: false }),
    ]);

    const programIds = Array.from(new Set(((saved ?? []) as any[]).map((r) => r.program_id)));
    let programs: any[] = [];
    if (programIds.length) {
      const { data: programRows } = await context.supabase
        .from("programs")
        .select("id, sport, division, governing_body, conference, universities:university_id (name, city, state)")
        .in("id", programIds);
      programs = (programRows ?? []) as any[];
    }
    const programMap = new Map(programs.map((p) => [p.id, p]));

    return {
      athletes: ((athletes ?? []) as any[]).map((athlete) => ({
        ...athlete,
        savedSchools: ((saved ?? []) as any[])
          .filter((row) => row.org_athlete_id === athlete.id)
          .map((row) => ({ ...row, program: programMap.get(row.program_id) ?? null })),
        notes: ((notes ?? []) as any[]).filter((row) => row.org_athlete_id === athlete.id),
      })),
    };
  });
