import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgActor } from "@/lib/athletes.functions";
import { METRIC_KEYS, METRIC_SOURCE_LABEL, metricUnit } from "@/lib/athlete-metrics";

/** Every active athlete in the org, for matching testing-sheet names. */
export const listMatchableAthletes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await requireOrgActor(context as any);
    let query = context.supabase
      .from("org_athletes")
      .select("id, name, grad_year, primary_position")
      .eq("status", "active")
      .order("name")
      .limit(5000);
    if (actor.organizationId) query = query.eq("organization_id", actor.organizationId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((a: any) => ({
      id: a.id as string,
      name: a.name as string,
      gradYear: a.grad_year as number | null,
      position: a.primary_position as string | null,
    }));
  });

/**
 * Bulk testing-day save. Staff entries are verified by the database itself
 * (guard_metric_verification), so these land as green "Coach verified".
 */
export const importTestingDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entries: { athleteId: string; metricKey: string; value: number }[];
      recordedOn?: string | null;
      eventName?: string | null;
      source?: string | null;
    }) => ({
      source: Object.keys(METRIC_SOURCE_LABEL).includes(String(input?.source)) ? String(input?.source) : "other",
      entries: (Array.isArray(input?.entries) ? input.entries : [])
        .filter(
          (e) =>
            typeof e?.athleteId === "string" &&
            METRIC_KEYS.includes(e.metricKey) &&
            Number.isFinite(Number(e.value)),
        )
        .slice(0, 20000),
      recordedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(input?.recordedOn ?? "")) ? input.recordedOn! : null,
      eventName: String(input?.eventName ?? "").trim().slice(0, 120) || null,
    }),
  )
  .handler(async ({ context, data }) => {
    await requireOrgActor(context as any);
    const rows = data.entries.map((e) => ({
      org_athlete_id: e.athleteId,
      metric_key: e.metricKey,
      value: Number(e.value),
      unit: metricUnit(e.metricKey) || null,
      recorded_on: data.recordedOn,
      source: data.source,
      source_ref: data.eventName,
    }));
    let saved = 0;
    const failures: string[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await context.supabase.from("athlete_metrics").insert(chunk as never);
      if (error) failures.push(error.message);
      else saved += chunk.length;
    }
    return { saved, failures };
  });
