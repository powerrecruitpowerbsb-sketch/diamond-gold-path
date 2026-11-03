import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/paginate";
import campusLocations from "@/data/campus-locations.json";
import type { CollegeMapProgram } from "@/lib/college-map";

/** Public college facts only; no organization intelligence is mixed into this map. */
export const getCollegeMapPrograms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CollegeMapProgram[]> => {
    const [programs, universities] = await Promise.all([
      fetchAllRows(async (from, to) => await context.supabase.from("programs")
        .select("id, university_id, sport, governing_body, division, conference")
        .eq("offering_status", "verified").order("id").range(from, to)),
      fetchAllRows(async (from, to) => await context.supabase.from("universities")
        .select("id, name, city, state, ipeds_unitid").is("retired_at", null).order("id").range(from, to)),
    ]);
    const schools = new Map(universities.map((u) => [u.id, u]));
    const locations = campusLocations as Record<string, number[]>;
    return programs.flatMap((p) => {
      const u = schools.get(p.university_id);
      if (!u) return [];
      const point = u.ipeds_unitid ? locations[String(u.ipeds_unitid)] : undefined;
      return [{ id: p.id, school: u.name, city: u.city, state: u.state, sport: p.sport,
        body: p.governing_body, division: p.division, conference: p.conference,
        coordinates: point && point.length === 2 ? [Number(point[0]), Number(point[1])] as [number, number] : null }];
    }).sort((a, b) => a.school.localeCompare(b.school));
  });