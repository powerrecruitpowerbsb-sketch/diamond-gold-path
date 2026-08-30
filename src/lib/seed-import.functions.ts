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

export type RawSeedRow = {
  index: number;
  universityName: string;
  state: string;
  sport: string;
  governingBody: string;
  division: string;
  conference: string;
};

function coerceRows(input: { rows: RawSeedRow[] }): { rows: RawSeedRow[] } {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  return {
    rows: rows.slice(0, 5000).map((row, i) => ({
      index: Number(row?.index ?? i),
      universityName: String(row?.universityName ?? ""),
      state: String(row?.state ?? ""),
      sport: String(row?.sport ?? ""),
      governingBody: String(row?.governingBody ?? ""),
      division: String(row?.division ?? ""),
      conference: String(row?.conference ?? ""),
    })),
  };
}

/** Dry run: what each parsed row would do, plus any row-level problems. */
export const previewSeedRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(coerceRows)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { loadSchoolIndex, findSchool, validateSeedRow, normalizeSchoolName } = await import(
      "@/lib/seed-import.server"
    );

    const index = await loadSchoolIndex(context.supabase);
    const seenInBatch = new Map<string, number>();

    const programKeys = new Set<string>();
    const { data: programs, error } = await context.supabase
      .from("programs")
      .select("university_id, sport");
    if (error) throw new Error(error.message);
    for (const row of (programs ?? []) as { university_id: string; sport: string }[]) {
      programKeys.add(`${row.university_id}:${row.sport}`);
    }

    const preview = data.rows.map((raw) => {
      const row = validateSeedRow(raw);
      const key = `${normalizeSchoolName(row.universityName)}|${row.state ?? ""}`;
      const match = row.errors.length ? null : findSchool(index, row.universityName, row.state);
      const seenEarlier = seenInBatch.has(key);
      if (!row.errors.length) seenInBatch.set(key, row.index);

      const schoolAction: "new" | "existing" = match || seenEarlier ? "existing" : "new";
      const programAction: "create" | "update" =
        match && programKeys.has(`${match.id}:${row.sport}`) ? "update" : "create";

      return {
        ...row,
        schoolAction,
        programAction,
        matchedSchoolName: match?.name ?? null,
      };
    });

    return JSON.parse(JSON.stringify(preview));
  });

/** Commit the batch. Bad rows are skipped with a reason; the rest still import. */
export const importSeedRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(coerceRows)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context as any);
    const { loadSchoolIndex, validateSeedRow, upsertUniversityAndProgram } = await import(
      "@/lib/seed-import.server"
    );

    const index = await loadSchoolIndex(context.supabase);
    let schoolsCreated = 0;
    let programsCreated = 0;
    let programsUpdated = 0;
    const skipped: { index: number; label: string; reason: string }[] = [];
    const universityIds: string[] = [];

    for (const raw of data.rows) {
      const row = validateSeedRow(raw);
      const label = row.universityName || `Row ${row.index + 1}`;
      if (row.errors.length) {
        skipped.push({ index: row.index, label, reason: row.errors.join("; ") });
        continue;
      }
      try {
        const outcome = await upsertUniversityAndProgram(
          context.supabase,
          {
            universityName: row.universityName,
            state: row.state,
            sport: row.sport!,
            governingBody: row.governingBody,
            division: row.division,
            conference: row.conference,
          },
          index,
        );
        if (outcome.universityCreated) schoolsCreated += 1;
        if (outcome.programCreated) programsCreated += 1;
        if (outcome.programUpdated) programsUpdated += 1;
        if (!universityIds.includes(outcome.universityId)) universityIds.push(outcome.universityId);
      } catch (failure) {
        skipped.push({
          index: row.index,
          label,
          reason: failure instanceof Error ? failure.message : "Could not save this row",
        });
      }
    }

    return JSON.parse(
      JSON.stringify({
        schoolsCreated,
        programsCreated,
        programsUpdated,
        skipped,
        universityIds,
        imported: data.rows.length - skipped.length,
      }),
    );
  });
