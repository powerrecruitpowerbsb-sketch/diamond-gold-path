import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgActor } from "@/lib/athletes.functions";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type WallOfFame = {
  org: string;
  logoUrl: string | null;
  primary: string | null;
  accent: string | null;
  commits: {
    name: string;
    gradYear: number | null;
    position: string | null;
    sport: string;
    slug: string | null;
    hasPhoto: boolean;
    school: string;
    division: string | null;
    conference: string | null;
    website: string | null;
  }[];
};

/** Staff read of the org's Wall of Fame switch + commit count. */
export const getWallState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await requireOrgActor(context as any);
    if (!actor.organizationId) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await (supabaseAdmin as any)
      .from("organizations")
      .select("wall_token, wall_enabled")
      .eq("id", actor.organizationId)
      .maybeSingle();
    const { count } = await (context.supabase as any)
      .from("athlete_saved_schools")
      .select("id, org_athletes!inner(organization_id)", { count: "exact", head: true })
      .eq("status", "committed")
      .eq("org_athletes.organization_id", actor.organizationId);
    return {
      canManage: actor.isSuperadmin || actor.isOrgAdmin,
      token: (org?.wall_token as string | null) ?? null,
      enabled: Boolean(org?.wall_enabled),
      commits: count ?? 0,
    };
  });

/** Owners/admins turn the public wall on or off; a fresh link kills old copies. */
export const setWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean; newLink?: boolean }) => ({
    enabled: Boolean(input?.enabled),
    newLink: Boolean(input?.newLink),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireOrgActor(context as any);
    if (!(actor.isSuperadmin || actor.isOrgAdmin) || !actor.organizationId) {
      throw new Error("Only owners and admins can share the Wall of Fame");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await (supabaseAdmin as any)
      .from("organizations")
      .select("wall_token")
      .eq("id", actor.organizationId)
      .maybeSingle();
    const token = data.newLink || !current?.wall_token ? newToken() : current.wall_token;
    const { error } = await (supabaseAdmin as any)
      .from("organizations")
      .update({ wall_enabled: data.enabled, wall_token: token })
      .eq("id", actor.organizationId);
    if (error) throw new Error(error.message);
    return { token, enabled: data.enabled };
  });

/** Public read. Null unless switched on. */
export const getWall = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: str(input?.token) }))
  .handler(async ({ data }) => {
    if (data.token.length < 16) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init?: any) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data: wall, error } = await (client as any).rpc("wall_of_fame", { _token: data.token });
    if (error) throw new Error(error.message);
    return (wall ?? null) as WallOfFame | null;
  });
