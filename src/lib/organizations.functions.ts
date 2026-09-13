import { createServerFn } from "@tanstack/react-start";

import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Organization management for Power Recruit staff.
 *
 * Onboarding a customer used to mean a hand-written database insert. These are
 * the only writes in the console restyle, and every one is superadmin-only.
 */

const PLANS = ["founding", "standard", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

/** Where an invited owner lands to set their password. */
function acceptUrl(): string | undefined {
  try {
    const request = getRequest();
    return new URL("/reset-password", new URL(request.url).origin).toString();
  } catch {
    return undefined;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((row: { role: string }) => row.role === "superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);

    const [{ data: orgs, error }, { data: members }, { data: athletes }, { data: saved }] =
      await Promise.all([
        context.supabase
          .from("organizations")
          .select(
            "id, name, plan, seat_count, billing_status, billing_contact_email, annual_fee_amount, access_expires_at, is_founding_free_org, created_at",
          )
          .order("name"),
        context.supabase.from("users").select("id, organization_id, user_type"),
        context.supabase.from("org_athletes").select("id, organization_id"),
        context.supabase.from("athlete_saved_schools").select("id, org_athlete_id"),
      ]);
    if (error) throw new Error(error.message);

    const athleteOrg = new Map<string, string>(
      ((athletes ?? []) as any[]).map((row) => [row.id as string, row.organization_id as string]),
    );

    const staffByOrg = new Map<string, number>();
    const familyByOrg = new Map<string, number>();
    for (const row of (members ?? []) as any[]) {
      if (!row.organization_id) continue;
      const bucket =
        row.user_type === "org_admin" || row.user_type === "org_staff" ? staffByOrg : familyByOrg;
      bucket.set(row.organization_id, (bucket.get(row.organization_id) ?? 0) + 1);
    }

    const athletesByOrg = new Map<string, number>();
    for (const row of (athletes ?? []) as any[]) {
      athletesByOrg.set(row.organization_id, (athletesByOrg.get(row.organization_id) ?? 0) + 1);
    }

    const savedByOrg = new Map<string, number>();
    for (const row of (saved ?? []) as any[]) {
      const org = athleteOrg.get(row.org_athlete_id as string);
      if (org) savedByOrg.set(org, (savedByOrg.get(org) ?? 0) + 1);
    }

    return ((orgs ?? []) as any[]).map((org) => ({
      id: org.id as string,
      name: org.name as string,
      plan: (org.plan ?? "standard") as string,
      seats: (org.seat_count ?? 0) as number,
      seatsUsed: staffByOrg.get(org.id) ?? 0,
      familyCount: familyByOrg.get(org.id) ?? 0,
      athletes: athletesByOrg.get(org.id) ?? 0,
      savedSchools: savedByOrg.get(org.id) ?? 0,
      billingStatus: (org.billing_status ?? null) as string | null,
      billingEmail: (org.billing_contact_email ?? null) as string | null,
      annualFee: (org.annual_fee_amount ?? null) as number | null,
      expiresAt: (org.access_expires_at ?? null) as string | null,
      createdAt: org.created_at as string,
    }));
  });

/** Create an organization and, optionally, invite its first owner in one step. */
export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      plan: Plan;
      seats: number;
      billingEmail?: string | null;
      annualFee?: number | null;
      ownerEmail?: string | null;
    }) => ({
      name: str(input?.name),
      plan: str(input?.plan) as Plan,
      seats: Number(input?.seats ?? 0),
      billingEmail: str(input?.billingEmail) || null,
      annualFee: input?.annualFee == null ? null : Number(input.annualFee),
      ownerEmail: str(input?.ownerEmail) || null,
    }),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.name) throw new Error("Give the organization a name");
    if (!PLANS.includes(data.plan)) throw new Error("Pick a plan");
    if (!Number.isFinite(data.seats) || data.seats < 0 || data.seats > 1000) {
      throw new Error("Seats must be between 0 and 1000");
    }

    const { data: created, error } = await context.supabase
      .from("organizations")
      .insert({
        name: data.name,
        plan: data.plan,
        seat_count: Math.round(data.seats),
        billing_contact_email: data.billingEmail,
        annual_fee_amount: data.annualFee,
        billing_status: data.plan === "founding" ? "active" : "trial",
        is_founding_free_org: data.plan === "founding",
        created_by: context.userId,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    let ownerInvited: string | null = null;
    if (data.ownerEmail) {
      const { sendInviteCore } = await import("./invites.server");
      await sendInviteCore({
        actorUserId: context.userId,
        orgId: (created as any).id,
        email: data.ownerEmail.toLowerCase(),
        role: "org_admin" as any,
        athleteId: null,
        redirectTo: acceptUrl(),
      });
      ownerInvited = data.ownerEmail;
    }

    return { id: (created as any).id as string, name: (created as any).name as string, ownerInvited };
  });

/** Change plan, seats, billing contact or fee on an existing organization. */
export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      plan?: Plan;
      seats?: number;
      billingEmail?: string | null;
      annualFee?: number | null;
    }) => ({
      id: str(input?.id),
      plan: input?.plan ? (str(input.plan) as Plan) : undefined,
      seats: input?.seats == null ? undefined : Number(input.seats),
      billingEmail: input?.billingEmail === undefined ? undefined : str(input.billingEmail) || null,
      annualFee: input?.annualFee === undefined ? undefined : Number(input.annualFee),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.id) throw new Error("Which organization?");

    const patch: Record<string, unknown> = {};
    if (data.plan !== undefined) {
      if (!PLANS.includes(data.plan)) throw new Error("Pick a plan");
      patch["plan"] = data.plan;
    }
    if (data.seats !== undefined) {
      if (!Number.isFinite(data.seats) || data.seats < 0 || data.seats > 1000) {
        throw new Error("Seats must be between 0 and 1000");
      }
      patch["seat_count"] = Math.round(data.seats);
    }
    if (data.billingEmail !== undefined) patch["billing_contact_email"] = data.billingEmail;
    if (data.annualFee !== undefined) patch["annual_fee_amount"] = data.annualFee;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase.from("organizations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Suspend or restore access. Suspending never deletes anything. */
export const setOrganizationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; suspended: boolean }) => ({
    id: str(input?.id),
    suspended: Boolean(input?.suspended),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.id) throw new Error("Which organization?");

    const { error } = await context.supabase
      .from("organizations")
      .update({
        billing_status: data.suspended ? "suspended" : "active",
        access_expires_at: data.suspended ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, suspended: data.suspended };
  });

/** Invite an owner into an organization that already exists. */
export const inviteOrganizationOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; email: string }) => ({
    id: str(input?.id),
    email: str(input?.email).toLowerCase(),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    if (!data.id) throw new Error("Which organization?");
    if (!data.email.includes("@")) throw new Error("That does not look like an email address");

    const { sendInviteCore } = await import("./invites.server");
    await sendInviteCore({
      actorUserId: context.userId,
      orgId: data.id,
      email: data.email,
      role: "org_admin" as any,
      athleteId: null,
      redirectTo: acceptUrl(),
    });
    return { ok: true, email: data.email };
  });
