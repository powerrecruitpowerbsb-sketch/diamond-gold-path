import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { splitHometown } from "@/lib/hometown-split";

/**
 * Read-only reader for the "Unrecognised wordings" console screen.
 *
 * Every field we normalise now keeps the page's own text alongside our mapped
 * value. A raw value with no mapped value means the mapper did not recognise
 * that wording — which is exactly the class of bug that previously could only
 * be found by someone spotting it on a screenshot. This counts them, per field,
 * so staff can see what the mapper is missing.
 *
 * Hometown is the one field whose raw text we have always kept, so its
 * unrecognised tails are countable for the whole existing database, not only
 * from the next read onward.
 */

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

type Wording = { field: string; wording: string; count: number };

const PAGE = 1000;
const CAP = 40_000;

/** Every row where the page printed something we stored raw but could not map. */
async function unmapped(
  supabase: any,
  table: string,
  rawColumn: string,
  mappedColumn: string,
): Promise<Map<string, number>> {
  const tally = new Map<string, number>();
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(rawColumn)
      .not(rawColumn, "is", null)
      .is(mappedColumn, null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, string | null>[];
    for (const row of rows) {
      const text = String(row[rawColumn] ?? "").trim();
      if (text) tally.set(text, (tally.get(text) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }
  return tally;
}

/** Hometown tails the splitter could not turn into a state or country. */
async function hometownTails(supabase: any): Promise<Map<string, number>> {
  const tally = new Map<string, number>();
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await supabase
      .from("roster_players")
      .select("hometown")
      .not("hometown", "is", null)
      .is("home_state", null)
      .is("home_country", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { hometown: string | null }[];
    for (const row of rows) {
      const whole = String(row.hometown ?? "").trim();
      if (!whole) continue;
      const parts = splitHometown(whole);
      if (parts.state || parts.country) continue;
      const head = whole.split("/")[0]!.trim();
      const pieces = head.split(",").map((piece) => piece.trim()).filter(Boolean);
      const tail = pieces.length > 1 ? pieces[pieces.length - 1]! : head;
      if (tail) tally.set(tail, (tally.get(tail) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }
  return tally;
}

const flatten = (field: string, tally: Map<string, number>): Wording[] =>
  Array.from(tally.entries())
    .map(([wording, count]) => ({ field, wording, count }))
    .sort((a, b) => b.count - a.count || a.wording.localeCompare(b.wording));

export const listUnrecognisedWordings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const supabase = (context as any).supabase;

    const [position, classYear, bats, throwsHand, division, conference, hometown] =
      await Promise.all([
        unmapped(supabase, "roster_players", "position_raw", "position"),
        unmapped(supabase, "roster_players", "class_year_raw", "class_year"),
        unmapped(supabase, "roster_players", "bats_raw", "bats"),
        unmapped(supabase, "roster_players", "throws_raw", "throws"),
        unmapped(supabase, "programs", "division_raw", "division"),
        unmapped(supabase, "programs", "conference_raw", "conference"),
        hometownTails(supabase),
      ]);

    const groups = [
      { field: "Position", rows: flatten("Position", position) },
      { field: "Class year", rows: flatten("Class year", classYear) },
      { field: "Bats", rows: flatten("Bats", bats) },
      { field: "Throws", rows: flatten("Throws", throwsHand) },
      { field: "Level", rows: flatten("Level", division) },
      { field: "Conference", rows: flatten("Conference", conference) },
      { field: "Hometown tail", rows: flatten("Hometown tail", hometown) },
    ];

    return groups.map((group) => ({
      field: group.field,
      distinct: group.rows.length,
      records: group.rows.reduce((sum, row) => sum + row.count, 0),
      rows: group.rows,
    }));
  });
