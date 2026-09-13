import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/paginate";
import { isPitcher, positionGroup, type PositionGroup } from "@/lib/position-group";
import {
  UNIVERSITY_COLS,
  compositionActive,
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
        context.supabase.from("universities").select("state").order("id").range(from, to) as any,
      ),
      fetchAllRows((from, to) =>
        context.supabase
          .from("programs")
          .select("conference, division, conference_verification")
          .order("id")
          .range(from, to) as any,
      ),
      context.supabase.from("majors").select("id, name").order("name"),
    ]);

    const uniq = (values: (string | null)[]) =>
      Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())))).sort();

    // A conference counts as confirmed only when every stored row carrying it is
    // verified. One unverified row is enough for the list to flag it.
    const confirmed = new Map<string, boolean>();
    for (const row of programs as any[]) {
      const name = String(row.conference ?? "").trim();
      if (!name) continue;
      const verified = row.conference_verification === "verified";
      confirmed.set(name, (confirmed.get(name) ?? true) && verified);
    }

    return {
      states: uniq((universities as any[]).map((r) => r.state)),
      conferences: Array.from(confirmed.entries())
        .map(([name, isConfirmed]) => ({ name, confirmed: isConfirmed }))
        .sort((a, b) => a.name.localeCompare(b.name)),
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

    // Paged: a major can be offered by more schools than one request returns, and a
    // truncated read would silently hide matching schools.
    if (f.majorId) {
      const data = await fetchAllRows((from, to) =>
        supabase
          .from("university_majors")
          .select("university_id")
          .eq("major_id", f.majorId)
          .order("university_id")
          .range(from, to),
      );
      intersect(((data ?? []) as any[]).map((r) => r.university_id));
    }

    if (f.academicBucket) {
      const data = await fetchAllRows((from, to) =>
        supabase
          .from("classifications")
          .select("university_id, value")
          .eq("classification_type", "academic_bucket")
          .eq("value", f.academicBucket)
          .order("university_id")
          .range(from, to),
      );
      intersect(
        ((data ?? []) as any[]).map((r) => r.university_id).filter((id: string | null) => !!id),
      );
    }

    if (restrict.ids !== null && restrict.ids.length === 0) {
      return { results: [], total: 0, matches: 0, capped: false, unpublishedPositions: 0 };
    }


    // A major or academic-bucket restriction can name over a thousand schools. Those
    // ids are sent in chunks: one request carrying them all exceeds the request-line
    // limit and comes back empty, which would look like "no schools match".
    const ID_CHUNK = 150;
    const idChunks: (string[] | null)[] =
      restrict.ids === null
        ? [null]
        : Array.from({ length: Math.ceil(restrict.ids.length / ID_CHUNK) }, (_, i) =>
            restrict.ids!.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK),
          );

    const LIMIT = 400;

    const buildQuery = (ids: string[] | null) => {
      let query = supabase
        .from("programs")
        .select(
          `id, sport, governing_body, division, conference, conference_verification,
           division_verification, scholarships_available, scholarship_details,
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
      if (ids !== null) query = query.in("university_id", ids);

      if (f.q) query = query.ilike("universities.name", `%${f.q}%`);
      // Location: the region is a grouping of states from src/lib/regions.ts, never
      // the stored universities.region column, which is empty for all but 6 schools.
      if (f.states.length > 0) query = query.in("universities.state", f.states);
      if (f.publicPrivate) query = query.eq("universities.public_private", f.publicPrivate);
      if (f.schoolSize) query = query.eq("universities.school_size_bucket", f.schoolSize);
      if (f.campusSetting) query = query.eq("universities.campus_setting", f.campusSetting);
      if (f.religious !== null) query = query.eq("universities.religious_affiliation", f.religious);

      const range = (column: string, min: number | null, max: number | null, scale = 1) => {
        if (min !== null) query = query.gte(column, min * scale);
        if (max !== null) query = query.lte(column, max * scale);
      };
      // Net price is what a family actually pays, and is the primary cost filter.
      range("universities.est_net_price", f.netPriceMin, f.netPriceMax);
      range("universities.tuition_out_state", f.tuitionMin, f.tuitionMax);
      range("universities.est_cost_of_attendance", f.coaMin, f.coaMax);
      range("universities.avg_sat", f.satMin, f.satMax);
      range("universities.avg_act", f.actMin, f.actMax);
      // Acceptance rate is stored 0-100, the same scale the filter uses.
      range("universities.acceptance_rate", f.acceptanceMin, f.acceptanceMax);

      // Ordered by school name so the cap always takes the same, alphabetical slice
      // instead of an arbitrary 400 rows.
      return query.order("name", { referencedTable: "universities" }).limit(LIMIT);
    };

    const responses = await Promise.all(idChunks.map((ids) => buildQuery(ids)));
    for (const r of responses as any[]) if (r.error) throw new Error(r.error.message);

    let rows = (responses as any[]).flatMap((r) => (r.data ?? []) as any[]);
    const count = (responses as any[]).reduce((sum, r) => sum + (r.count ?? 0), 0);
    if (idChunks.length > 1) {
      rows.sort((a, b) =>
        String(a.universities?.name ?? "").localeCompare(String(b.universities?.name ?? "")),
      );
    }
    const capped = rows.length >= LIMIT;
    rows = rows.slice(0, LIMIT);
    const programIds = rows.map((r) => r.id);


    // Roster detail is only read when a composition filter is in use, so an
    // ordinary search stays as fast as it was.
    const detailed = compositionActive(f);
    const rosterCols = detailed
      ? "program_id, season_year, position, class_year, is_transfer, two_way, throws"
      : "program_id, season_year";

    type Composition = {
      seasonYear: number | null;
      size: number;
      /** Null where the school published no positions at all. */
      groupCounts: Record<string, number> | null;
      seniorCounts: Record<string, number> | null;
      transfers: number;
    };

    const compositions = new Map<string, Composition>();
    if (programIds.length > 0) {
      const { data: roster } = await supabase
        .from("roster_players")
        .select(rosterCols)
        .in("program_id", programIds);

      const byProgram = new Map<string, Map<number, any[]>>();
      for (const row of (roster ?? []) as any[]) {
        const seasons = byProgram.get(row.program_id) ?? new Map<number, any[]>();
        const year = Number(row.season_year ?? 0);
        const bucket = seasons.get(year) ?? [];
        bucket.push(row);
        seasons.set(year, bucket);
        byProgram.set(row.program_id, seasons);
      }

      for (const [programId, seasons] of byProgram) {
        const latest = Math.max(...seasons.keys());
        const players = seasons.get(latest) ?? [];
        let groupCounts: Record<string, number> | null = null;
        let seniorCounts: Record<string, number> | null = null;
        let transfers = 0;

        if (detailed) {
          const groups: Record<string, number> = {};
          const seniors: Record<string, number> = {};
          let anyPosition = false;
          for (const player of players) {
            if (player.is_transfer === true) transfers += 1;
            const group: PositionGroup | null = isPitcher(player.position, player.two_way)
              ? "pitcher"
              : positionGroup(player.position);
            if (!group) continue;
            anyPosition = true;
            groups[group] = (groups[group] ?? 0) + 1;
            if (String(player.class_year ?? "").toUpperCase() === "SR") {
              seniors[group] = (seniors[group] ?? 0) + 1;
            }
          }
          groupCounts = anyPosition ? groups : null;
          seniorCounts = anyPosition ? seniors : null;
        }

        compositions.set(programId, {
          seasonYear: latest || null,
          size: players.length,
          groupCounts,
          seniorCounts,
          transfers,
        });
      }
    }

    let results = rows.map((row) => {
      const composition =
        compositions.get(row.id) ??
        ({
          seasonYear: null,
          size: 0,
          groupCounts: null,
          seniorCounts: null,
          transfers: 0,
        } as Composition);
      const { universities, ...program } = row;
      return {
        ...program,
        university: universities,
        roster: { seasonYear: composition.seasonYear, size: composition.size },
        composition,
      };
    });

    // Programs whose school never published a position are excluded from a
    // position filter and counted separately — never treated as zero.
    let unpublishedPositions = 0;

    if (f.rosterMin !== null) results = results.filter((r) => r.roster.size >= f.rosterMin!);
    if (f.rosterMax !== null) results = results.filter((r) => r.roster.size <= f.rosterMax!);

    if (f.positionGroup && (f.positionMin !== null || f.positionMax !== null)) {
      results = results.filter((r) => {
        const counts = r.composition.groupCounts;
        if (!counts) {
          unpublishedPositions += 1;
          return false;
        }
        const n = counts[f.positionGroup] ?? 0;
        if (f.positionMin !== null && n < f.positionMin) return false;
        if (f.positionMax !== null && n > f.positionMax) return false;
        return true;
      });
    }

    if (f.seniorGroup && f.seniorMin !== null) {
      results = results.filter((r) => {
        const counts = r.composition.seniorCounts;
        if (!counts) {
          unpublishedPositions += 1;
          return false;
        }
        return (counts[f.seniorGroup] ?? 0) >= f.seniorMin!;
      });
    }

    if (f.transferPctMin !== null || f.transferPctMax !== null) {
      results = results.filter((r) => {
        if (r.roster.size === 0) return false;
        const share = (r.composition.transfers / r.roster.size) * 100;
        if (f.transferPctMin !== null && share < f.transferPctMin) return false;
        if (f.transferPctMax !== null && share > f.transferPctMax) return false;
        return true;
      });
    }

    results.sort((a, b) => String(a.university?.name).localeCompare(String(b.university?.name)));

    const matches = Number(count ?? results.length);

    return {
      results,
      total: results.length,
      // How many programs match the filters in total, and whether the list was cut
      // off at the display cap (composition filtering happens after the fetch).
      matches: detailed ? results.length : matches,
      capped: capped && !detailed,
      unpublishedPositions,
    };


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

    const [intel, roster, sources, classifications, siblings, majors, links] = await Promise.all([
      supabase
        .from("recruiting_intelligence")
        .select("id, field_type, content, updated_at")
        .eq("program_id", data.programId),
      supabase
        .from("roster_players")
        .select(
          `id, season_year, name, class_year, position, bats, throws, hometown, home_state,
           home_country, is_transfer, is_juco_transfer, two_way`,
        )
        .eq("program_id", data.programId),
      supabase
        .from("data_field_sources")
        .select("table_name, record_id, field_name, source_url, source_type, last_verified_at")
        .in("record_id", [data.programId, (program as any).university_id]),
      supabase
        .from("classifications")
        .select("classification_type, value, ai_suggested_value, is_staff_overridden, evidence_text")
        .eq("university_id", (program as any).university_id),
      // Sibling team at the same school — powers the baseball/softball toggle.
      supabase
        .from("programs")
        .select("id, sport, offering_status, division, governing_body")
        .eq("university_id", (program as any).university_id),
      // Majors on file for the school.
      supabase
        .from("university_majors")
        .select("award_levels, completions, majors!inner(id, name, category, cip_family)")
        .eq("university_id", (program as any).university_id),
      // Link health, so a blocked host reads as blocked instead of blank.
      supabase
        .from("link_health")
        .select("field, url, link_status, last_failure_category, last_verified_ok_at")
        .eq("program_id", data.programId),
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
      siblingPrograms: ((siblings.data ?? []) as any[]).filter((r) => r.id !== data.programId),
      majors: ((majors.data ?? []) as any[]).map((row) => ({
        id: (row as any).majors?.id,
        name: (row as any).majors?.name,
        category: (row as any).majors?.category ?? null,
        awardLevels: row.award_levels ?? null,
        completions: row.completions ?? null,
      })),
      linkHealth: (links.data ?? []) as any[],
    };

  });
