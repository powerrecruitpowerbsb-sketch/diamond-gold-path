import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((row: { role: string }) => row.role === "superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const FIELD_FOR_TYPE: Record<string, string> = {
  athletic_website: "athletic_website",
  roster_page: "roster_url",
  coaching_staff_page: "coaching_staff_url",
};

/** Headline counts for the alert bar: how many teams are missing what. */
export const countMissingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const base = () =>
      (context.supabase as any)
        .from("programs")
        .select("id", { count: "exact", head: true })
        .neq("offering_status", "not_offered");

    const [roster, staff, coach, site] = await Promise.all([
      base().is("roster_url", null),
      base().is("coaching_staff_url", null),
      base().is("head_coach_name", null),
      base().is("athletic_website", null),
    ]);
    for (const result of [roster, staff, coach, site]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      roster: roster.count ?? 0,
      staff: staff.count ?? 0,
      coach: coach.count ?? 0,
      site: site.count ?? 0,
    };
  });

/**
 * Every team with something missing, handed over as a list — no searching
 * required. Newest gaps first is meaningless here, so we sort by school name.
 */
export const listMissingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { gap?: string; sport?: string; search?: string; level?: string }) => ({
      gap: String(input?.gap ?? "any"),
      sport: String(input?.sport ?? ""),
      level: String(input?.level ?? ""),
      search: String(input?.search ?? "").trim().toLowerCase(),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    let query = (context.supabase as any)
      .from("programs")
      .select(
        "id, sport, governing_body, division, conference, athletic_website, roster_url, coaching_staff_url, head_coach_name, last_roster_pull_at, university_id, universities(name, state, retired_at)",
      )
      .neq("offering_status", "not_offered");

    if (data.gap === "roster") query = query.is("roster_url", null);
    else if (data.gap === "staff") query = query.is("coaching_staff_url", null);
    else if (data.gap === "coach") query = query.is("head_coach_name", null);
    else if (data.gap === "site") query = query.is("athletic_website", null);
    else if (data.gap === "quickwin")
      query = query.is("head_coach_name", null).not("coaching_staff_url", "is", null);
    else if (data.gap === "zero")
      query = query
        .is("head_coach_name", null)
        .is("roster_url", null)
        .is("coaching_staff_url", null);
    else
      query = query.or(
        "roster_url.is.null,coaching_staff_url.is.null,head_coach_name.is.null,athletic_website.is.null",
      );

    if (data.sport) query = query.eq("sport", data.sport);
    if (data.level) query = query.eq("governing_body", data.level.split(" ")[0]);

    const { data: rows, error } = await query.limit(4000);
    if (error) throw new Error(error.message);

    const list = ((rows ?? []) as any[])
      .filter((row) => !row.universities?.retired_at)
      .filter((row) =>
        data.search
          ? `${row.universities?.name ?? ""} ${row.universities?.state ?? ""} ${row.conference ?? ""}`
              .toLowerCase()
              .includes(data.search)
          : true,
      )
      .map((row) => ({
        id: row.id,
        sport: row.sport,
        universityId: row.university_id,
        school: row.universities?.name ?? "—",
        state: row.universities?.state ?? "",
        level: [row.governing_body, row.division].filter(Boolean).join(" "),
        conference: row.conference ?? null,
        athleticWebsite: row.athletic_website ?? null,
        rosterUrl: row.roster_url ?? null,
        coachingStaffUrl: row.coaching_staff_url ?? null,
        headCoachName: row.head_coach_name ?? null,
        lastRosterPullAt: row.last_roster_pull_at ?? null,
      }))
      .sort((a, b) => a.school.localeCompare(b.school) || a.sport.localeCompare(b.sport));

    return clean({ rows: list.slice(0, 500), total: list.length });
  });

/**
 * Old "couldn't find this page" rows where the address has since been saved.
 * Dry run by default so the count can be shown before anything changes.
 */
export const clearResolvedDiscoveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { apply?: boolean }) => ({ apply: Boolean(input?.apply) }))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);

    const { data: rows, error } = await (context.supabase as any)
      .from("url_discovery_queue")
      .select("id, program_id, discovery_type")
      .eq("status", "pending_review")
      .is("discovered_url", null)
      .limit(2000);
    if (error) throw new Error(error.message);

    const queue = ((rows ?? []) as any[]).filter((row) => row.program_id);
    const programIds = [...new Set(queue.map((row) => row.program_id))];
    if (programIds.length === 0) return { resolved: 0, applied: data.apply };

    const { data: programs, error: programError } = await (context.supabase as any)
      .from("programs")
      .select("id, athletic_website, roster_url, coaching_staff_url")
      .in("id", programIds);
    if (programError) throw new Error(programError.message);

    const byId = new Map(((programs ?? []) as any[]).map((row) => [row.id, row]));
    const resolvedIds = queue
      .filter((row) => {
        const field = FIELD_FOR_TYPE[row.discovery_type];
        const program = byId.get(row.program_id);
        return Boolean(field && program && program[field]);
      })
      .map((row) => row.id);

    if (data.apply && resolvedIds.length) {
      const { error: updateError } = await (context.supabase as any)
        .from("url_discovery_queue")
        .update({
          status: "rejected",
          notes: "Cleared automatically — the address is already saved on the team.",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .in("id", resolvedIds);
      if (updateError) throw new Error(updateError.message);
    }

    return { resolved: resolvedIds.length, applied: data.apply };
  });
