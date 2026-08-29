import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UNIVERSITY_COLS } from "@/lib/search-schema";

export const MAX_COMPARE = 4;

/** Side-by-side comparison data for 2-4 programs. RLS applies as the signed-in user. */
export const getComparePrograms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: unknown }) => {
    const raw = Array.isArray(input?.ids) ? input.ids : [];
    const ids = Array.from(new Set(raw.map((v) => String(v)).filter(Boolean))).slice(
      0,
      MAX_COMPARE,
    );
    return { ids };
  })
  .handler(async ({ context, data }) => {
    if (data.ids.length === 0) return { programs: [] as any[] };
    const supabase = context.supabase as any;

    const { data: programs, error } = await supabase
      .from("programs")
      .select(
        `id, university_id, sport, governing_body, division, conference,
         scholarships_available, last_verified_at,
         universities!inner(${UNIVERSITY_COLS})`,
      )
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const rows = (programs ?? []) as any[];
    const universityIds = rows.map((r) => r.university_id);

    const [roster, classifications] = await Promise.all([
      supabase
        .from("roster_players")
        .select("program_id, season_year")
        .in("program_id", data.ids),
      supabase
        .from("classifications")
        .select("university_id, classification_type, value, ai_suggested_value")
        .in("university_id", universityIds),
    ]);

    const rosterRows = ((roster.data ?? []) as any[]).filter((r) => r.season_year !== null);
    const classRows = (classifications.data ?? []) as any[];

    const shaped = rows.map((row) => {
      const mine = rosterRows.filter((r) => r.program_id === row.id);
      const latestSeason = mine.length
        ? Math.max(...mine.map((r) => Number(r.season_year)))
        : null;
      const academic = classRows.find(
        (c) =>
          c.university_id === row.university_id && c.classification_type === "academic_bucket",
      );
      const { universities, ...program } = row;
      return {
        program,
        university: universities,
        rosterSize: latestSeason
          ? mine.filter((r) => Number(r.season_year) === latestSeason).length
          : 0,
        latestSeason,
        academicBucket: academic?.value ?? academic?.ai_suggested_value ?? null,
      };
    });

    // Preserve the caller's column order.
    shaped.sort((a, b) => data.ids.indexOf(a.program.id) - data.ids.indexOf(b.program.id));
    return { programs: shaped };
  });
