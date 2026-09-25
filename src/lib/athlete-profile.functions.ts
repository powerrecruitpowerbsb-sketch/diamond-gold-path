import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { METRIC_KEYS, METRIC_SOURCES, metricUnit, metricsForSport } from "@/lib/athlete-metrics";
import { normalizeSport } from "@/lib/sport";


/**
 * Athlete profile, measurables and schedule.
 *
 * Access is decided in the database (can_access_athlete): organization staff on
 * their own athletes, and the athlete's own family. Both parties read and write
 * the same records, so nothing here re-checks a role — a row that is not visible
 * simply does not come back.
 */

const str = (v: unknown) => String(v ?? "").trim();
const nullable = (v: unknown) => {
  const out = str(v);
  return out === "" ? null : out;
};
const intOrNull = (v: unknown) => {
  const out = str(v);
  if (out === "") return null;
  const n = Number(out);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const numOrNull = (v: unknown) => {
  const out = str(v);
  if (out === "") return null;
  const n = Number(out);
  return Number.isFinite(n) ? n : null;
};

export const PROFILE_COLUMNS =
  "id, organization_id, name, sport, grad_year, primary_position, secondary_position, bats, throws, " +
  "athlete_email, athlete_phone, parent_name, parent_email, parent_phone, home_city, home_state, " +
  "high_school, club_team, height_inches, weight_lbs, gpa, sat_score, act_score, eligibility_id, " +
  "twitter_handle, instagram_handle, video_links, photo_path, share_slug, share_enabled, share_contact";

/**
 * A handle is stored bare, so a pasted profile link or an "@name" both end up
 * as the username the card links to.
 */
const handle = (v: unknown) => {
  let out = str(v);
  if (!out) return null;
  out = out.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  out = out.replace(/^(x\.com|twitter\.com|instagram\.com)\//i, "");
  out = out.split(/[?#/]/)[0] ?? "";
  out = out.replace(/^@/, "").trim();
  return out === "" ? null : out;
};

export type AthleteProfileInput = {
  athleteId: string;
  athleteEmail?: string | null;
  athletePhone?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  homeCity?: string | null;
  homeState?: string | null;
  highSchool?: string | null;
  clubTeam?: string | null;
  secondaryPosition?: string | null;
  heightInches?: string | number | null;
  weightLbs?: string | number | null;
  gpa?: string | number | null;
  satScore?: string | number | null;
  actScore?: string | number | null;
  eligibilityId?: string | null;
  twitterHandle?: string | null;
  instagramHandle?: string | null;
  videoLinks?: string[] | null;
};

export const getAthleteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string }) => ({ athleteId: str(input?.athleteId) }))
  .handler(async ({ context, data }) => {
    const { data: athlete, error } = await context.supabase
      .from("org_athletes")
      .select(PROFILE_COLUMNS)
      .eq("id", data.athleteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!athlete) throw new Error("Athlete not found");

    const [{ data: metrics }, { data: events }] = await Promise.all([
      context.supabase
        .from("athlete_metrics")
        .select("id, metric_key, value, unit, recorded_on, source, source_ref, verified, created_at")
        .eq("org_athlete_id", data.athleteId)
        .order("recorded_on", { ascending: false, nullsFirst: false }),
      context.supabase
        .from("schedule_events")
        .select(
          "id, name, event_type, start_date, end_date, venue, city, state, notes, link_url, team_id, org_athlete_id",
        )
        .or(`org_athlete_id.eq.${data.athleteId},org_athlete_id.is.null`)
        .order("start_date", { ascending: true }),
    ]);

    return {
      athlete: athlete as Record<string, any>,
      metrics: (metrics ?? []) as Record<string, any>[],
      events: (events ?? []) as Record<string, any>[],
    };
  });

export const saveAthleteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AthleteProfileInput) => input)
  .handler(async ({ context, data }) => {
    const athleteId = str(data?.athleteId);
    if (!athleteId) throw new Error("Missing athlete");

    const fields: Record<string, unknown> = {
      athlete_email: nullable(data.athleteEmail),
      athlete_phone: nullable(data.athletePhone),
      parent_name: nullable(data.parentName),
      parent_email: nullable(data.parentEmail),
      parent_phone: nullable(data.parentPhone),
      home_city: nullable(data.homeCity),
      home_state: nullable(data.homeState),
      high_school: nullable(data.highSchool),
      club_team: nullable(data.clubTeam),
      secondary_position: nullable(data.secondaryPosition),
      height_inches: intOrNull(data.heightInches),
      weight_lbs: intOrNull(data.weightLbs),
      gpa: numOrNull(data.gpa),
      sat_score: intOrNull(data.satScore),
      act_score: intOrNull(data.actScore),
      eligibility_id: nullable(data.eligibilityId),
      twitter_handle: handle(data.twitterHandle),
      instagram_handle: handle(data.instagramHandle),
      video_links: Array.isArray(data.videoLinks)
        ? data.videoLinks.map((v) => str(v)).filter(Boolean).slice(0, 12)
        : [],
    };

    for (const email of [fields['athlete_email'], fields['parent_email']]) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email))) {
        throw new Error(`"${email}" is not a valid email address`);
      }
    }
    const gpa = fields['gpa'] as number | null;
    if (gpa !== null && (gpa < 0 || gpa > 5)) throw new Error("GPA must be between 0 and 5");

    // Count the rows back: if permission rules block the write, Postgres
    // changes nothing and reports no error, so silence would look like a save.
    const { error, count } = await context.supabase
      .from("org_athletes")
      .update(fields as never, { count: "exact" })
      .eq("id", athleteId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("You do not have permission to edit this player card");
    return { ok: true };

  });

/**
 * The picture saves on its own the moment it is chosen, so the card shows a face
 * without waiting for the rest of the form.
 */
export const setAthletePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string; photoPath: string | null }) => ({
    athleteId: str(input?.athleteId),
    photoPath: nullable(input?.photoPath),
  }))
  .handler(async ({ context, data }) => {
    if (!data.athleteId) throw new Error("Missing athlete");
    if (data.photoPath && !data.photoPath.startsWith(`${data.athleteId}/`)) {
      throw new Error("That photo does not belong to this player");
    }
    const { error, count } = await context.supabase
      .from("org_athletes")
      .update({ photo_path: data.photoPath } as never, { count: "exact" })
      .eq("id", data.athleteId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("You do not have permission to edit this player card");
    return { ok: true, photoPath: data.photoPath };
  });

export const saveAthleteMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      athleteId: string;
      metricKey: string;
      value: string | number;
      recordedOn?: string | null;
      source?: string | null;
      sourceRef?: string | null;
      unit?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const athleteId = str(data?.athleteId);
    const metricKey = str(data?.metricKey);
    if (!athleteId) throw new Error("Missing athlete");
    if (!METRIC_KEYS.includes(metricKey)) throw new Error(`Unknown measurable "${metricKey}"`);
    const value = numOrNull(data?.value);
    if (value === null) throw new Error("Enter a number for this measurable");

    // A number only belongs to the sport this player actually plays, so a
    // baseball-only or softball-only measurable is refused rather than stored.
    const { data: row } = await context.supabase
      .from("org_athletes")
      .select("sport")
      .eq("id", athleteId)
      .maybeSingle();
    const sport = normalizeSport(row?.["sport"]);
    if (!metricsForSport(sport).some((m) => m.key === metricKey)) {
      throw new Error(`That measurable is not recorded for ${sport}.`);
    }


    const source = METRIC_SOURCES.includes(str(data?.source) as never)
      ? str(data?.source)
      : "manual";

    const { error } = await context.supabase.from("athlete_metrics").insert({
      org_athlete_id: athleteId,
      metric_key: metricKey,
      value,
      // The unit belongs to the measurable itself (mph, sec, in, lb), so it is
      // set here rather than trusted from the form.
      unit: metricUnit(metricKey) || nullable(data?.unit),

      recorded_on: nullable(data?.recordedOn),
      source,
      source_ref: nullable(data?.sourceRef),
      // The database decides: staff entries are verified, family entries are
      // self-reported until a coach confirms them.
      verified: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAthleteMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("athlete_metrics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const EVENT_TYPES = ["tournament", "showcase", "camp", "game", "practice", "visit"] as const;

export const saveScheduleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      athleteId?: string | null;
      teamId?: string | null;
      seasonId?: string | null;
      organizationId?: string | null;
      name: string;
      eventType?: string | null;
      startDate: string;
      endDate?: string | null;
      venue?: string | null;
      city?: string | null;
      state?: string | null;
      notes?: string | null;
      linkUrl?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const name = str(data?.name);
    const startDate = nullable(data?.startDate);
    if (!name) throw new Error("Give the event a name");
    if (!startDate) throw new Error("Pick a start date");

    const eventType = EVENT_TYPES.includes(str(data?.eventType) as never)
      ? str(data?.eventType)
      : "tournament";

    const fields = {
      name,
      event_type: eventType,
      start_date: startDate,
      end_date: nullable(data?.endDate),
      venue: nullable(data?.venue),
      city: nullable(data?.city),
      state: nullable(data?.state),
      notes: nullable(data?.notes),
      link_url: nullable(data?.linkUrl),
    };

    if (nullable(data?.id)) {
      const { error } = await context.supabase
        .from("schedule_events")
        .update(fields)
        .eq("id", str(data?.id));
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // A team event belongs to the club; anything else is the athlete's own
    // addition — guest play, a showcase the club never posted.
    const teamId = nullable(data?.teamId);
    const { error } = await context.supabase.from("schedule_events").insert({
      ...fields,
      team_id: teamId,
      season_id: nullable(data?.seasonId),
      organization_id: nullable(data?.organizationId),
      org_athlete_id: teamId ? null : nullable(data?.athleteId),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScheduleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("schedule_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Team schedules (staff)                                              */
/* ------------------------------------------------------------------ */

export const getTeamSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) => ({ teamId: str(input?.teamId) }))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("schedule_events")
      .select("id, name, event_type, start_date, end_date, venue, city, state, notes, link_url")
      .eq("team_id", data.teamId)
      .order("start_date", { ascending: true });
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as Record<string, any>[] };
  });

/**
 * A team event, added by staff. Every athlete assigned to the team sees it on
 * their own player card without anyone copying it across.
 */
export const saveTeamEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      teamId: string;
      name: string;
      eventType?: string | null;
      startDate: string;
      endDate?: string | null;
      venue?: string | null;
      city?: string | null;
      state?: string | null;
      linkUrl?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const teamId = str(data?.teamId);
    if (!teamId) throw new Error("Missing team");
    const { data: team, error: teamError } = await context.supabase
      .from("teams")
      .select("id, season_id, organization_id")
      .eq("id", teamId)
      .maybeSingle();
    if (teamError) throw new Error(teamError.message);
    if (!team) throw new Error("Team not found");

    return saveScheduleEvent({
      data: {
        ...data,
        teamId,
        seasonId: (team as any).season_id ?? null,
        organizationId: (team as any).organization_id ?? null,
      },
    });
  });

/* ------------------------------------------------------------------ */
/* Shareable scout card                                                */
/* ------------------------------------------------------------------ */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Turns the public card on or off and mints the link. The slug is derived from
 * the athlete's name plus grad year, with a short suffix if it is taken.
 */
export const setAthleteSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { athleteId: string; enabled: boolean; shareContact?: boolean }) => ({
      athleteId: str(input?.athleteId),
      enabled: Boolean(input?.enabled),
      shareContact: input?.shareContact === undefined ? true : Boolean(input.shareContact),
    }),
  )
  .handler(async ({ context, data }) => {
    if (!data.athleteId) throw new Error("Missing athlete");
    const { data: athlete, error: readError } = await context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, share_slug")
      .eq("id", data.athleteId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!athlete) throw new Error("Athlete not found");

    const row = athlete as { name: string; grad_year: number | null; share_slug: string | null };
    let slug = row.share_slug;
    if (!slug) {
      const base = slugify(`${row.name}-${row.grad_year ?? ""}`) || "player";
      slug = base;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: taken } = await context.supabase
          .from("org_athletes")
          .select("id")
          .eq("share_slug", slug)
          .maybeSingle();
        if (!taken) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }
    }

    const { error } = await context.supabase
      .from("org_athletes")
      .update({
        share_enabled: data.enabled,
        share_contact: data.shareContact,
        share_slug: slug,
      } as never)
      .eq("id", data.athleteId);
    if (error) throw new Error(error.message);
    return { slug, enabled: data.enabled, shareContact: data.shareContact };
  });

/** Public read for the scout card. No session: the card is the shared link. */
export const getScoutCard = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: str(input?.slug) }))
  .handler(async ({ data }) => {
    if (!data.slug) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const url = process.env['SUPABASE_URL']!;
    const client = createClient(url, key, {
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
    const { data: card, error } = await client.rpc("athlete_scout_card", { _slug: data.slug });
    if (error) throw new Error(error.message);
    const out = (card ?? null) as Record<string, any> | null;
    // Uploaded clips live in private storage; only a card that is switched on
    // to share comes back from the read above, so signing its clips is safe.
    const videos = (out?.['videos'] ?? []) as { storage_path: string }[];
    if (out && videos.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("athlete-videos")
        .createSignedUrls(videos.map((v) => v.storage_path), 60 * 60 * 6);
      out['videos'] = videos.map((v, i) => ({ ...v, url: signed?.[i]?.signedUrl ?? null }));
    }
    return out;
  });
