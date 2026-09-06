import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/paginate";
import {
  UNIVERSITY_COLS,
  normalizeSearchInput,
  type SearchFilters,
} from "@/lib/search-schema";

/** Distinct values available for the secondary filters. */
export const getSearchFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Paged reads: both tables hold more rows than one request can return, and a
    // truncated read would quietly drop states and conferences from the filters.
    const [universities, programs, majors] = await Promise.all([
      fetchAllRows((from, to) =>
        context.supabase.from("universities").select("state, region").order("id").range(from, to) as any,
      ),
      fetchAllRows((from, to) =>
        context.supabase.from("programs").select("conference, division").order("id").range(from, to) as any,
      ),
      context.supabase.from("majors").select("id, name").order("name"),
    ]);

    const uniq = (values: (string | null)[]) =>
      Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())))).sort();

    return {
      states: uniq((universities as any[]).map((r) => r.state)),
      regions: uniq((universities as any[]).map((r) => r.region)),
      conferences: uniq((programs as any[]).map((r) => r.conference)),
      divisions: uniq((programs as any[]).map((r) => r.division)),
      majors: (((majors as any).data ?? []) as any[]).map((m) => ({ id: m.id, name: m.name })),
    };
  });


/** Filtered program search. RLS applies as the signed-in user. */
export const searchPrograms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): SearchFilters => normalizeSearchInput(input))
  .handler(async ({ context, data: f }) => {
    const supabase = context.supabase as any;

    // Pre-resolve university-id restrictions that need a join table.
    const restrict: { ids: string[] | null } = { ids: null };
    const intersect = (ids: string[]) => {
      restrict.ids = restrict.ids === null ? ids : restrict.ids.filter((id) => ids.includes(id));
    };

    if (f.majorId) {
      const { data } = await supabase
        .from("university_majors")
        .select("university_id")
        .eq("major_id", f.majorId);
      intersect(((data ?? []) as any[]).map((r) => r.university_id));
    }

    if (f.academicBucket) {
      const { data } = await supabase
        .from("classifications")
        .select("university_id, value")
        .eq("classification_type", "academic_bucket")
        .eq("value", f.academicBucket);
      intersect(
        ((data ?? []) as any[]).map((r) => r.university_id).filter((id: string | null) => !!id),
      );
    }

    if (restrict.ids !== null && restrict.ids.length === 0) {
      return { results: [], total: 0 };
    }

    let query = supabase
      .from("programs")
      .select(
        `id, sport, governing_body, division, conference, scholarships_available, scholarship_details,
         athletic_website, roster_url, coaching_staff_url, head_coach_name, last_verified_at,
         universities!inner(${UNIVERSITY_COLS})`,
        { count: "exact" },
      )

      .eq("sport", f.sport)
      .eq("offering_status", "verified");

    if (f.governingBody) query = query.eq("governing_body", f.governingBody);
    if (f.division) query = query.eq("division", f.division);
    if (f.conference) query = query.eq("conference", f.conference);
    if (f.scholarships !== null) query = query.eq("scholarships_available", f.scholarships);
    if (restrict.ids !== null) query = query.in("university_id", restrict.ids);

    if (f.q) query = query.ilike("universities.name", `%${f.q}%`);
    if (f.state) query = query.eq("universities.state", f.state);
    if (f.region) query = query.eq("universities.region", f.region);
    if (f.publicPrivate) query = query.eq("universities.public_private", f.publicPrivate);
    if (f.schoolSize) query = query.eq("universities.school_size_bucket", f.schoolSize);
    if (f.campusSetting) query = query.eq("universities.campus_setting", f.campusSetting);
    if (f.religious !== null) query = query.eq("universities.religious_affiliation", f.religious);

    const range = (
      column: string,
      min: number | null,
      max: number | null,
      scale = 1,
    ) => {
      if (min !== null) query = query.gte(column, min * scale);
      if (max !== null) query = query.lte(column, max * scale);
    };
    range("universities.est_cost_of_attendance", f.tuitionMin, f.tuitionMax);
    range("universities.avg_gpa", f.gpaMin, f.gpaMax);
    range("universities.avg_sat", f.satMin, f.satMax);
    range("universities.avg_act", f.actMin, f.actMax);
    // Acceptance rate is stored 0-100, the same scale the filter uses.
    range("universities.acceptance_rate", f.acceptanceMin, f.acceptanceMax);

    // Ordered by school name so the cap always takes the same, alphabetical slice
    // instead of an arbitrary 400 rows.
    const LIMIT = 400;
    const { data, error, count } = await query
      .order("name", { referencedTable: "universities" })
      .limit(LIMIT);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const capped = rows.length >= LIMIT;
    const programIds = rows.map((r) => r.id);


    // Roster size = player count for the most recent season on file per program.
    const rosterSizes = new Map<string, { seasonYear: number | null; size: number }>();
    if (programIds.length > 0) {
      const { data: roster } = await supabase
        .from("roster_players")
        .select("program_id, season_year")
        .in("program_id", programIds);
      const byProgram = new Map<string, Map<number, number>>();
      for (const row of (roster ?? []) as any[]) {
        const seasons = byProgram.get(row.program_id) ?? new Map<number, number>();
        const year = Number(row.season_year ?? 0);
        seasons.set(year, (seasons.get(year) ?? 0) + 1);
        byProgram.set(row.program_id, seasons);
      }
      for (const [programId, seasons] of byProgram) {
        const latest = Math.max(...seasons.keys());
        rosterSizes.set(programId, {
          seasonYear: latest || null,
          size: seasons.get(latest) ?? 0,
        });
      }
    }

    let results = rows.map((row) => {
      const roster = rosterSizes.get(row.id) ?? { seasonYear: null, size: 0 };
      const { universities, ...program } = row;
      return { ...program, university: universities, roster };
    });

    if (f.rosterMin !== null) results = results.filter((r) => r.roster.size >= f.rosterMin!);
    if (f.rosterMax !== null) results = results.filter((r) => r.roster.size <= f.rosterMax!);

    results.sort((a, b) => String(a.university?.name).localeCompare(String(b.university?.name)));

    return { results, total: results.length };
  });

/** Everything the program profile page renders. */
export const getProgramProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string }) => ({
    programId: String(input?.programId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;

    const { data: program, error } = await supabase
      .from("programs")
      .select(
        `id, university_id, sport, governing_body, division, conference, scholarships_available,
         scholarship_details, athletic_website, roster_url, coaching_staff_url, facility_url,
         head_coach_name, recruiting_coordinator_name, last_verified_at, last_roster_pull_at,
         universities!inner(${UNIVERSITY_COLS})`,
      )
      .eq("id", data.programId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!program) return null;

    const university = (program as any).universities;

    const [intel, roster, sources, classifications] = await Promise.all([
      supabase
        .from("recruiting_intelligence")
        .select("id, field_type, content, updated_at")
        .eq("program_id", data.programId),
      supabase
        .from("roster_players")
        .select("id, season_year, name, class_year, position, home_state, is_transfer, is_juco_transfer")
        .eq("program_id", data.programId),
      supabase
        .from("data_field_sources")
        .select("table_name, record_id, field_name, source_url, source_type, last_verified_at")
        .in("record_id", [data.programId, (program as any).university_id]),
      supabase
        .from("classifications")
        .select("classification_type, value, ai_suggested_value, is_staff_overridden, evidence_text")
        .eq("university_id", (program as any).university_id),
    ]);

    const rosterRows = ((roster.data ?? []) as any[]).filter((r) => r.season_year !== null);
    const years = rosterRows.map((r) => Number(r.season_year));
    const latestSeason = years.length > 0 ? Math.max(...years) : null;
    const currentRoster = latestSeason
      ? rosterRows.filter((r) => Number(r.season_year) === latestSeason)
      : [];

    const { universities: _drop, ...programFields } = program as any;

    return {
      program: programFields,
      university,
      intelligence: ((intel.data ?? []) as any[]).filter((r) => (r.content ?? "").trim().length > 0),
      classifications: (classifications.data ?? []) as any[],
      sources: (sources.data ?? []) as any[],
      roster: currentRoster,
      latestSeason,
    };
  });
