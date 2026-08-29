import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Current signed-in user's profile + authoritative role. */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("users")
      .select("id, email, name, user_type, organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(rolesError.message);

    const roleList = (roles ?? []).map((row) => row.role);

    return {
      profile: profile ?? null,
      roles: roleList,
      isSuperadmin: roleList.includes("superadmin"),
    };
  });

/** Internal confirmation read: universities + programs, RLS-scoped to the caller. */
export const getCollegeDataSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [universities, programs] = await Promise.all([
      context.supabase
        .from("universities")
        .select(
          "id, name, city, state, region, campus_setting, school_size_bucket, public_private, undergrad_enrollment, avg_gpa, avg_sat, acceptance_rate, tuition_out_state, est_cost_of_attendance, est_net_price, tuition_source_url, updated_at",
        )
        .order("name"),
      context.supabase
        .from("programs")
        .select(
          "id, sport, governing_body, division, conference, head_coach_name, recruiting_coordinator_name, scholarships_available, scholarship_details, coaching_staff_url, last_verified_at, universities(name, state)",
        )
        .order("sport"),
    ]);

    if (universities.error) throw new Error(universities.error.message);
    if (programs.error) throw new Error(programs.error.message);

    return {
      universities: universities.data ?? [],
      programs: programs.data ?? [],
    };
  });
