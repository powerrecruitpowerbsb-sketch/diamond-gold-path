/**
 * The organization a Power Recruit staff member is currently working inside.
 *
 * The value is resolved on the server from a row the staff member owns, never
 * from anything the browser sends, and the row records when they entered. For
 * everyone else this is always null — they only ever act on their own
 * organization.
 */
type Ctx = { supabase: any; userId: string };

export async function actingOrgId(
  context: Ctx,
  isSuperadmin: boolean,
): Promise<string | null> {
  if (!isSuperadmin) return null;
  const { data } = await context.supabase
    .from("admin_acting_org")
    .select("organization_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  return ((data as { organization_id?: string | null } | null)?.organization_id ?? null) as
    | string
    | null;
}
