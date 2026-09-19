import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  academicFit,
  depthFit,
  footprintFit,
  type DepthPlayer,
} from "./true-fit";

/**
 * The true-fit read for one athlete against one program.
 *
 * Reads go through the caller's own session, so RLS decides which athletes a
 * family or staff member may compare. A program with no roster still returns a
 * full answer — the depth and footprint sections simply say the data is pending.
 */
export const getTrueFit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { programId: string; athleteId: string }) => data)
  .handler(async ({ data, context }) => {
    const [athleteRow, programRow] = await Promise.all([
      context.supabase
        .from("org_athletes")
        .select("id, name, sport, grad_year, primary_position, secondary_position, gpa, sat_score, act_score, home_state")
        .eq("id", data.athleteId)
        .maybeSingle(),
      context.supabase
        .from("programs")
        .select(
          "id, sport, governing_body, division, conference, universities(name, state, avg_gpa, avg_sat, avg_act, sat_total_25, sat_total_75, act_25, act_75, acceptance_rate, test_optional)",
        )
        .eq("id", data.programId)
        .maybeSingle(),
    ]);

    if (athleteRow.error) throw new Error(athleteRow.error.message);
    if (programRow.error) throw new Error(programRow.error.message);

    const athlete = athleteRow.data;
    const program = programRow.data as Record<string, any> | null;
    if (!athlete || !program) throw new Error("We could not find that athlete or program.");

    const university = (program['universities'] ?? {}) as Record<string, any>;

    // The most recent season we hold for this program, and only that season's
    // players — depth is a statement about who is there now.
    const { data: seasonRows, error: seasonError } = await context.supabase
      .from("roster_players")
      .select("season_year")
      .eq("program_id", data.programId)
      .not("season_year", "is", null)
      .order("season_year", { ascending: false })
      .limit(1);
    if (seasonError) throw new Error(seasonError.message);

    const seasonYear = (seasonRows?.[0]?.season_year as number | undefined) ?? null;

    let players: DepthPlayer[] = [];
    if (seasonYear != null) {
      const { data: rosterRows, error: rosterError } = await context.supabase
        .from("roster_players")
        .select("position, class_year, home_state, two_way")
        .eq("program_id", data.programId)
        .eq("season_year", seasonYear);
      if (rosterError) throw new Error(rosterError.message);
      players = (rosterRows ?? []).map((row) => ({
        position: row.position ?? null,
        classYear: row.class_year ?? null,
        homeState: row.home_state ?? null,
        twoWay: row.two_way ?? null,
      }));
    }

    const academic = academicFit(
      {
        avgGpa: university['avg_gpa'] != null ? Number(university['avg_gpa']) : null,
        satTotal25: university['sat_total_25'] ?? null,
        satTotal75: university['sat_total_75'] ?? null,
        act25: university['act_25'] ?? null,
        act75: university['act_75'] ?? null,
        acceptanceRate:
          university['acceptance_rate'] != null ? Number(university['acceptance_rate']) : null,
        testOptional: university['test_optional'] ?? null,
      },
      {
        gpa: athlete.gpa != null ? Number(athlete.gpa) : null,
        sat: athlete.sat_score ?? null,
        act: athlete.act_score ?? null,
      },
    );

    const depth = depthFit(players, athlete.primary_position ?? null, seasonYear);
    const footprint = footprintFit(players, athlete.home_state ?? null);

    return {
      athlete: {
        id: athlete.id,
        name: athlete.name,
        gradYear: athlete.grad_year,
        primaryPosition: athlete.primary_position ?? null,
        gpa: athlete.gpa != null ? Number(athlete.gpa) : null,
        sat: athlete.sat_score ?? null,
        act: athlete.act_score ?? null,
        homeState: athlete.home_state ?? null,
      },
      school: {
        name: (university['name'] as string | undefined) ?? null,
        state: (university['state'] as string | undefined) ?? null,
        division: (program['division'] as string | undefined) ?? null,
        governingBody: (program['governing_body'] as string | undefined) ?? null,
        testOptional: university['test_optional'] ?? null,
      },
      academic,
      depth,
      footprint,
    };
  });
