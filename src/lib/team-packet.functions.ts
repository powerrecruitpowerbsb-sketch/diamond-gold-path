import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Staff read of a team's packet switch. RLS decides who can see the team. */
export const getTeamPacketState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) => ({ teamId: str(input?.teamId) }))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("teams")
      .select("id, name, packet_token, packet_enabled")
      .eq("id", data.teamId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as {
      id: string;
      name: string;
      packet_token: string | null;
      packet_enabled: boolean;
    } | null;
  });

/** Turn the public roster sheet on or off; a new link is made on first use or when asked. */
export const setTeamPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; enabled: boolean; newLink?: boolean }) => ({
    teamId: str(input?.teamId),
    enabled: Boolean(input?.enabled),
    newLink: Boolean(input?.newLink),
  }))
  .handler(async ({ context, data }) => {
    const { data: current } = await context.supabase
      .from("teams")
      .select("packet_token")
      .eq("id", data.teamId)
      .maybeSingle();
    const token =
      data.newLink || !(current as any)?.packet_token ? newToken() : (current as any).packet_token;
    const { data: row, error } = await context.supabase
      .from("teams")
      .update({ packet_enabled: data.enabled, packet_token: token } as never)
      .eq("id", data.teamId)
      .select("packet_token, packet_enabled")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Only club staff can share this team");
    return row as { packet_token: string; packet_enabled: boolean };
  });

/** Public read for college recruiters. Returns null unless the sheet is switched on. */
export const getTeamPacket = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: str(input?.token) }))
  .handler(async ({ data }) => {
    if (data.token.length < 16) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const client = createClient(process.env['SUPABASE_URL']!, key, {
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
    const { data: packet, error } = await (client as any).rpc("team_packet", { _token: data.token });
    if (error) throw new Error(error.message);
    return (packet ?? null) as TeamPacket | null;
  });

export type TeamPacket = {
  team: string;
  ageGroup: string | null;
  org: string;
  season: string | null;
  players: {
    jersey: string | null;
    name: string;
    gradYear: number | null;
    position: string | null;
    bats: string | null;
    throws: string | null;
    height: number | null;
    weight: number | null;
    slug: string | null;
    metrics: { key: string; value: number }[];
  }[];
};
