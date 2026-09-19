import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTIVITY_CHIP_IDS } from "@/lib/athlete-activity";

const str = (value: unknown) => String(value ?? "").trim();

/**
 * Reading and writing the activity on one saved school. Access rules already
 * limit this to the club's staff and the athlete's own family, so there is no
 * extra role gate here — only the chip names are checked.
 */
export const getSchoolActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string }) => ({ entryId: str(input?.entryId) }))
  .handler(async ({ context, data }) => {
    if (!data.entryId) return { chips: [] as string[], notes: {} as Record<string, string> };
    const { data: row, error } = await context.supabase
      .from("athlete_saved_schools")
      .select("activity_chips, activity_notes")
      .eq("id", data.entryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      chips: ((row as any)?.activity_chips ?? []) as string[],
      notes: ((row as any)?.activity_notes ?? {}) as Record<string, string>,
    };
  });

export const toggleActivityChip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string; chipId: string; on: boolean }) => ({
    entryId: str(input?.entryId),
    chipId: str(input?.chipId),
    on: Boolean(input?.on),
  }))
  .handler(async ({ context, data }) => {
    if (!data.entryId) throw new Error("Add this school to the list first");
    if (!ACTIVITY_CHIP_IDS.includes(data.chipId)) throw new Error("Unknown activity");

    const { data: row, error: readError } = await context.supabase
      .from("athlete_saved_schools")
      .select("activity_chips, activity_notes")
      .eq("id", data.entryId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("That school is no longer on the list");

    const current = new Set(((row as any).activity_chips ?? []) as string[]);
    const notes = { ...(((row as any).activity_notes ?? {}) as Record<string, string>) };
    if (data.on) current.add(data.chipId);
    else {
      current.delete(data.chipId);
      // Un-tapping clears its note too, so nothing lingers invisibly.
      delete notes[data.chipId];
    }

    const chips = ACTIVITY_CHIP_IDS.filter((id) => current.has(id));
    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .update({ activity_chips: chips, activity_notes: notes })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { chips, notes };
  });

export const setActivityNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string; chipId: string; note: string | null }) => ({
    entryId: str(input?.entryId),
    chipId: str(input?.chipId),
    note: str(input?.note),
  }))
  .handler(async ({ context, data }) => {
    if (!data.entryId) throw new Error("Add this school to the list first");
    if (!ACTIVITY_CHIP_IDS.includes(data.chipId)) throw new Error("Unknown activity");

    const { data: row, error: readError } = await context.supabase
      .from("athlete_saved_schools")
      .select("activity_chips, activity_notes")
      .eq("id", data.entryId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("That school is no longer on the list");

    const chips = new Set(((row as any).activity_chips ?? []) as string[]);
    // Writing a note about something implies it happened.
    chips.add(data.chipId);
    const notes = { ...(((row as any).activity_notes ?? {}) as Record<string, string>) };
    if (data.note) notes[data.chipId] = data.note;
    else delete notes[data.chipId];

    const nextChips = ACTIVITY_CHIP_IDS.filter((id) => chips.has(id));
    const { error } = await context.supabase
      .from("athlete_saved_schools")
      .update({ activity_chips: nextChips, activity_notes: notes })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { chips: nextChips, notes };
  });
