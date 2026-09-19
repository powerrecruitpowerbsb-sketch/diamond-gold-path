import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { METRIC_KEYS, METRIC_SOURCES } from "@/lib/athlete-metrics";

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
  "twitter_handle, instagram_handle, video_links";

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
      twitter_handle: nullable(data.twitterHandle)?.replace(/^@/, "") ?? null,
      instagram_handle: nullable(data.instagramHandle)?.replace(/^@/, "") ?? null,
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

    const { error } = await context.supabase
      .from("org_athletes")
      .update(fields)
      .eq("id", athleteId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

    const source = METRIC_SOURCES.includes(str(data?.source) as never)
      ? str(data?.source)
      : "manual";

    const { error } = await context.supabase.from("athlete_metrics").insert({
      org_athlete_id: athleteId,
      metric_key: metricKey,
      value,
      unit: nullable(data?.unit),
      recorded_on: nullable(data?.recordedOn),
      source,
      source_ref: nullable(data?.sourceRef),
      verified: source !== "manual",
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
