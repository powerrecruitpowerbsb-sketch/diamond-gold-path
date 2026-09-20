/**
 * The picture shown on a shared scout card.
 *
 * Photos live in a private bucket, so a coach opening a shared link cannot read
 * them directly. This route takes only the share link's own address, checks the
 * player's people left sharing switched on, and then hands back a short-lived
 * link to that one picture. Nothing else about the player is exposed.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/athlete-photo/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String((params as { slug?: string }).slug ?? "").trim();
        if (!slug) return new Response("Not found", { status: 404 });

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: athlete } = await supabase
          .from("org_athletes")
          .select("photo_path")
          .eq("share_slug", slug)
          .eq("share_enabled", true)
          .maybeSingle();

        const path = (athlete as { photo_path?: string | null } | null)?.photo_path;
        if (!path) return new Response("Not found", { status: 404 });

        const { data: signed } = await supabase.storage
          .from("athlete-photos")
          .createSignedUrl(path, 60 * 60);
        if (!signed?.signedUrl) return new Response("Not found", { status: 404 });

        return new Response(null, {
          status: 302,
          headers: { location: signed.signedUrl, "cache-control": "private, max-age=300" },
        });
      },
    },
  },
});
