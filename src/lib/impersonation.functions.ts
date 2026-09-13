import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Power Recruit staff entering an organization and running it as its Owner.
 *
 * Nothing about the signed-in account changes: no role rows are rewritten and
 * no organization is written to their profile. Entering stores one row saying
 * which organization they are inside and when they went in; leaving removes it.
 * Everything they then do is still attributed to their own staff account.
 */

type Ctx = { supabase: any; userId: string };

async function assertSuperadmin(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((row: { role: string }) => row.role === "superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

export const enterOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string }) => ({
    organizationId: String(data?.organizationId ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const ctx = context as any as Ctx;
    await assertSuperadmin(ctx);
    if (!data.organizationId) throw new Error("Choose an organization to enter");

    const { data: org, error: orgError } = await ctx.supabase
      .from("organizations")
      .select("id, name")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgError) throw new Error(orgError.message);
    if (!org) throw new Error("That organization no longer exists");

    const { error } = await ctx.supabase.from("admin_acting_org").upsert(
      {
        user_id: ctx.userId,
        organization_id: data.organizationId,
        entered_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    return { organizationId: (org as any).id as string, name: (org as any).name as string };
  });

export const exitOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any as Ctx;
    await assertSuperadmin(ctx);
    const { error } = await ctx.supabase
      .from("admin_acting_org")
      .delete()
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
