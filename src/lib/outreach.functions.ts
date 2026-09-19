import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatHeight, formatMetric, latestByMetric, metricLabel } from "@/lib/athlete-metrics";

const str = (value: unknown) => String(value ?? "").trim();

type Ctx = { supabase: any; userId: string };

/** Which club this person is working inside, and whether they may edit it. */
async function actor(context: Ctx) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    context.supabase
      .from("users")
      .select("id, organization_id")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperadmin = roleList.includes("superadmin");
  const { actingOrgId } = await import("@/lib/acting-org");
  const acting = await actingOrgId(context, isSuperadmin);
  const organizationId =
    acting ?? ((profile as { organization_id?: string | null } | null)?.organization_id ?? null);
  const canEdit =
    isSuperadmin ||
    roleList.includes("org_owner") ||
    roleList.includes("org_admin") ||
    roleList.includes("org_staff");
  return { organizationId, isSuperadmin, canEdit };
}

/* ------------------------------------------------------------------ */
/* Coach contacts a club has gathered for one college program          */
/* ------------------------------------------------------------------ */

export const getCoachContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({ programId: str(input?.programId) }))
  .handler(async ({ context, data }) => {
    if (!data.programId) return { contacts: [] as any[], canEdit: false };
    const who = await actor(context as any);
    const { data: rows, error } = await context.supabase
      .from("program_coach_contacts")
      .select("id, coach_name, coach_role, email, phone, notes")
      .eq("program_id", data.programId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { contacts: (rows ?? []) as any[], canEdit: who.canEdit };
  });

export const saveCoachContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      programId: string;
      coachName: string;
      coachRole?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
    }) => ({
      id: str(input?.id) || null,
      programId: str(input?.programId),
      coachName: str(input?.coachName),
      coachRole: str(input?.coachRole) || null,
      email: str(input?.email).toLowerCase() || null,
      phone: str(input?.phone) || null,
      notes: str(input?.notes) || null,
    }),
  )
  .handler(async ({ context, data }) => {
    if (!data.programId) throw new Error("Pick a school first");
    if (!data.coachName) throw new Error("A coach needs a name");
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("That email address doesn't look right");
    }
    const who = await actor(context as any);
    if (!who.canEdit) throw new Error("Only club staff can save coach contacts");
    if (!who.organizationId && !who.isSuperadmin) throw new Error("No organization on this account");

    const fields = {
      coach_name: data.coachName,
      coach_role: data.coachRole,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("program_coach_contacts")
        .update(fields as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("program_coach_contacts")
      .insert({
        ...fields,
        program_id: data.programId,
        organization_id: who.organizationId,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteCoachContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: str(input?.id) }))
  .handler(async ({ context, data }) => {
    const who = await actor(context as any);
    if (!who.canEdit) throw new Error("Only club staff can remove coach contacts");
    const { error } = await context.supabase
      .from("program_coach_contacts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Everything the composer needs about the athlete, in one read        */
/* ------------------------------------------------------------------ */

export const getOutreachAthlete = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { athleteId: string }) => ({ athleteId: str(input?.athleteId) }))
  .handler(async ({ context, data }) => {
    if (!data.athleteId) return null;

    const { data: athlete, error } = await context.supabase
      .from("org_athletes")
      .select(
        "id, name, sport, grad_year, primary_position, secondary_position, bats, throws, height_inches, weight_lbs, high_school, club_team, home_city, home_state, gpa, sat_score, act_score, athlete_email, athlete_phone, parent_name, parent_email, parent_phone, video_links, share_slug, share_enabled",
      )
      .eq("id", data.athleteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!athlete) return null;
    const a = athlete as Record<string, any>;

    const [{ data: metrics }, { data: teamLinks }] = await Promise.all([
      context.supabase
        .from("athlete_metrics")
        .select("metric_key, value, unit, recorded_on, source")
        .eq("org_athlete_id", data.athleteId)
        .order("recorded_on", { ascending: false }),
      context.supabase.from("team_athletes").select("team_id").eq("org_athlete_id", data.athleteId),
    ]);

    const teamIds = ((teamLinks ?? []) as { team_id: string }[]).map((row) => row.team_id);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let events: any[] = [];
    {
      const { data: own } = await context.supabase
        .from("schedule_events")
        .select("name, event_type, start_date, end_date, city, state, venue")
        .eq("org_athlete_id", data.athleteId)
        .gte("start_date", since)
        .order("start_date", { ascending: true })
        .limit(12);
      events = (own ?? []) as any[];
      if (teamIds.length) {
        const { data: team } = await context.supabase
          .from("schedule_events")
          .select("name, event_type, start_date, end_date, city, state, venue")
          .in("team_id", teamIds)
          .is("org_athlete_id", null)
          .gte("start_date", since)
          .order("start_date", { ascending: true })
          .limit(12);
        events = [...events, ...((team ?? []) as any[])].sort((x, y) =>
          String(x.start_date).localeCompare(String(y.start_date)),
        );
      }
    }

    const latest = latestByMetric((metrics ?? []) as any[]);
    const facts: { label: string; value: string }[] = [];
    if (a['height_inches']) facts.push({ label: "Height", value: formatHeight(a['height_inches']) });
    if (a['weight_lbs']) facts.push({ label: "Weight", value: `${a['weight_lbs']} lb` });
    if (a['bats'] || a['throws']) {
      facts.push({
        label: "B/T",
        value: `${a['bats'] ?? "—"}/${a['throws'] ?? "—"}`,
      });
    }
    for (const row of latest) {
      if (row.metric_key === "height" || row.metric_key === "weight") continue;
      facts.push({
        label: metricLabel(row.metric_key),
        value: formatMetric(row.value, row.metric_key),
      });
    }

    return {
      athlete: a,
      facts,
      events: events.slice(0, 8).map((event) => ({
        name: String(event.name ?? ""),
        startDate: String(event.start_date ?? ""),
        endDate: event.end_date ? String(event.end_date) : null,
        place: [event.venue, event.city, event.state].filter(Boolean).join(", "),
      })),
    };
  });
