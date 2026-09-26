import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The player's home screen in one read: their card, numbers, clips, college
 * list summary, shared coach notes and what is next on the calendar.
 *
 * Access is the database's call (can_access_athlete / is_linked_athlete), so a
 * player only ever gets their own athlete back.
 */

const str = (v: unknown) => String(v ?? "").trim();

export const VIDEO_CATEGORIES = [
  { key: "game", label: "Game at-bat" },
  { key: "bp", label: "BP / exit velo" },
  { key: "bullpen", label: "Bullpen" },
  { key: "fielding", label: "Fielding" },
  { key: "catching", label: "Catching" },
  { key: "speed", label: "Speed / running" },
  { key: "other", label: "Other" },
] as const;

export const getAthleteHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId?: string | null } | undefined) => ({
    athleteId: str(input?.athleteId) || null,
  }))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;

    let athleteId = data.athleteId;
    if (!athleteId) {
      const { data: links } = await sb
        .from("athlete_family_links")
        .select("org_athlete_id")
        .eq("user_id", context.userId)
        .limit(1);
      athleteId = (links?.[0] as any)?.org_athlete_id ?? null;
    }
    if (!athleteId) return { athlete: null };

    const today = new Date().toISOString().slice(0, 10);
    const [athleteRes, metricsRes, videosRes, savedRes, notesRes, teamRes] = await Promise.all([
      sb
        .from("org_athletes")
        .select(
          "id, organization_id, name, sport, grad_year, primary_position, secondary_position, bats, throws, " +
            "high_school, club_team, home_city, home_state, height_inches, weight_lbs, gpa, sat_score, act_score, " +
            "eligibility_id, athlete_email, video_links, photo_path, share_slug, share_enabled",
        )
        .eq("id", athleteId)
        .maybeSingle(),
      sb
        .from("athlete_metrics")
        .select("id, metric_key, value, unit, recorded_on, source, verified, verified_at, created_at")
        .eq("org_athlete_id", athleteId)
        .order("recorded_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      sb
        .from("athlete_videos")
        .select("id, storage_path, title, category, created_at")
        .eq("org_athlete_id", athleteId)
        .order("created_at", { ascending: false }),
      sb
        .from("athlete_saved_schools")
        .select(
          "id, status, program_id, recommended_by_name, coach_message, programs:program_id (id, sport, governing_body, division, universities:university_id (name, state))",
        )
        .eq("org_athlete_id", athleteId),
      sb
        .from("org_player_notes")
        .select("id, note, created_at")
        .eq("org_athlete_id", athleteId)
        .eq("visible_to_parent", true)
        .order("created_at", { ascending: false })
        .limit(3),
      sb.from("team_athletes").select("team_id").eq("org_athlete_id", athleteId),
    ]);

    if (athleteRes.error) throw new Error(athleteRes.error.message);
    const athlete = athleteRes.data as Record<string, any> | null;
    if (!athlete) return { athlete: null };

    const teamIds = ((teamRes.data ?? []) as any[]).map((r) => r.team_id);
    const eventFilter = teamIds.length
      ? `org_athlete_id.eq.${athleteId},team_id.in.(${teamIds.join(",")})`
      : `org_athlete_id.eq.${athleteId}`;
    const { data: events } = await sb
      .from("schedule_events")
      .select("id, name, event_type, start_date, end_date, venue, city, state")
      .or(eventFilter)
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(4);

    let photoUrl: string | null = null;
    if (athlete['photo_path']) {
      const { data: signed } = await sb.storage
        .from("athlete-photos")
        .createSignedUrl(String(athlete['photo_path']), 60 * 60);
      photoUrl = signed?.signedUrl ?? null;
    }

    const videoRows = (videosRes.data ?? []) as any[];
    let videos: any[] = [];
    if (videoRows.length) {
      const { data: signed } = await sb.storage
        .from("athlete-videos")
        .createSignedUrls(videoRows.map((v) => v.storage_path), 60 * 60 * 3);
      videos = videoRows.map((v, i) => ({ ...v, url: signed?.[i]?.signedUrl ?? null }));
    }

    const { data: org } = await sb
      .from("organizations")
      .select("name")
      .eq("id", athlete['organization_id'])
      .maybeSingle();

    return {
      athlete,
      orgName: (org as any)?.name ?? null,
      photoUrl,
      metrics: (metricsRes.data ?? []) as Record<string, any>[],
      videos,
      saved: (savedRes.data ?? []) as Record<string, any>[],
      notes: (notesRes.data ?? []) as Record<string, any>[],
      events: (events ?? []) as Record<string, any>[],
    };
  });

export const addAthleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      athleteId: string;
      storagePath: string;
      title?: string | null;
      category?: string | null;
      sizeBytes?: number | null;
      mimeType?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const athleteId = str(data.athleteId);
    const path = str(data.storagePath);
    if (!athleteId || !path.startsWith(`${athleteId}/`)) {
      throw new Error("That clip does not belong to this player");
    }
    const category = VIDEO_CATEGORIES.some((c) => c.key === data.category)
      ? String(data.category)
      : "other";
    const { error } = await context.supabase.from("athlete_videos").insert({
      org_athlete_id: athleteId,
      storage_path: path,
      title: str(data.title).slice(0, 120) || null,
      category,
      size_bytes: data.sizeBytes ?? null,
      mime_type: data.mimeType ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAthleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("athlete_videos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Clip not found");
    await context.supabase.storage.from("athlete-videos").remove([(row as any).storage_path]);
    const { error } = await context.supabase.from("athlete_videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A coach confirms a number the family entered. The database refuses anyone else. */
export const verifyAthleteMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("athlete_metrics")
      .update({ verified: true } as never)
      .eq("id", data.id)
      .select("verified")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!(row as any)?.verified) throw new Error("Only club staff can verify a number");
    return { ok: true };
  });
