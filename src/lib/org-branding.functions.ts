import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const str = (value: unknown) => String(value ?? "").trim();

export const BRANDING_BUCKET = "org-branding";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type Ctx = { supabase: any; userId: string };

async function actor(context: Ctx) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("organization_id, user_type")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const { actingOrgId } = await import("@/lib/acting-org");
  const acting = await actingOrgId(context, isSuperadmin);
  const type = (profile as { user_type?: string | null } | null)?.user_type ?? null;
  return {
    // Staff inside an organization act as its owner; everyone else is pinned
    // to their own organization.
    organizationId:
      acting ??
      ((profile as { organization_id?: string | null } | null)?.organization_id ?? null),
    isSuperadmin,
    acting: Boolean(acting),
    // Logo and colors are the owner's to change.
    isOrgOwner: Boolean(acting) || type === "org_owner",
  };
}


/**
 * Resolves a stored logo reference to something an <img> can load. Logos live
 * in a private bucket, so stored paths are signed per request; absolute URLs
 * (legacy/public buckets) pass straight through.
 */
async function resolveLogo(context: Ctx, stored: string | null) {
  const value = str(stored);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data } = await context.supabase.storage
    .from(BRANDING_BUCKET)
    .createSignedUrl(value, 60 * 60 * 6);
  return (data as { signedUrl?: string } | null)?.signedUrl ?? null;
}

/**
 * Branding for the signed-in user's organization. Superadmins have no
 * organization, so this returns nulls for them and the shell keeps the fixed
 * Power Recruit navy/gold identity.
 */
export const getMyBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = await actor(context as any);
    if (!me.organizationId || me.isSuperadmin) {
      return { organizationId: null, name: null, logoUrl: null, primary: null, accent: null, logoPath: null, canEdit: false };
    }
    const { data: org } = await context.supabase
      .from("organizations")
      .select("id, name, logo_url, brand_primary_color, brand_accent_color")
      .eq("id", me.organizationId)
      .maybeSingle();
    const row = (org ?? null) as Record<string, any> | null;
    return {
      organizationId: me.organizationId,
      name: row?.['name'] ?? null,
      logoPath: row?.['logo_url'] ?? null,
      logoUrl: await resolveLogo(context as any, row?.['logo_url'] ?? null),
      primary: row?.['brand_primary_color'] ?? null,
      accent: row?.['brand_accent_color'] ?? null,
      canEdit: me.isOrgAdmin,
    };
  });

export const saveOrgBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { primary?: string | null; accent?: string | null; logoPath?: string | null }) => ({
      primary: str(input?.primary),
      accent: str(input?.accent),
      logoPath: input?.logoPath === null ? null : str(input?.logoPath),
    }),
  )
  .handler(async ({ context, data }) => {
    const me = await actor(context as any);
    if (!me.isOrgAdmin || !me.organizationId) {
      throw new Error("Forbidden: organization admins only");
    }
    if (data.primary && !HEX.test(data.primary)) throw new Error("Primary color must be a hex value");
    if (data.accent && !HEX.test(data.accent)) throw new Error("Accent color must be a hex value");

    const patch: Record<string, string | null> = {
      brand_primary_color: data.primary || null,
      brand_accent_color: data.accent || null,
    };
    if (data.logoPath !== "") patch['logo_url'] = data.logoPath || null;

    const { data: updated, error } = await context.supabase
      .from("organizations")
      .update(patch as never)
      .eq("id", me.organizationId)
      .select("id");
    if (error) throw new Error(error.message);
    // A row-level policy mismatch returns success with zero rows — never let
    // that read as a saved change.
    if (!updated || (updated as unknown[]).length === 0) {
      throw new Error("Branding could not be saved for this organization");
    }

    return { ok: true };
  });
