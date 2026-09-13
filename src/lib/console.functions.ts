import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read-only readers for the staff console.
 *
 * Every function here only SELECTs. Nothing in this file writes, and it calls
 * no write path: these exist so screens can show state the pipeline already
 * records (quarantined hosts, withheld links, permanent blocks, archive runs,
 * retired schools, not-offered programs).
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

async function count(supabase: any, table: string, apply?: (q: any) => any) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count: total, error } = await query;
  if (error) throw new Error(error.message);
  return total ?? 0;
}

/** The one line of counts every console header carries. */
export const getConsoleCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const supabase = context.supabase;
    const [schools, programs, players, lastSweep] = await Promise.all([
      count(supabase, "universities"),
      count(supabase, "programs"),
      count(supabase, "roster_players"),
      supabase
        .from("sweep_runs")
        .select("finished_at, started_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const sweep = (lastSweep as any)?.data ?? null;
    return {
      schools,
      programs,
      players,
      lastSweepAt: (sweep?.finished_at ?? sweep?.started_at ?? null) as string | null,
    };
  });

/** Everything waiting on a person, for the "Needs you" landing page. */
export const getNeedsYou = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const supabase = context.supabase;
    const [withheld, blocks, identity, discovered, review] = await Promise.all([
      count(supabase, "link_conflicts", (q) => q.eq("status", "withheld")),
      count(supabase, "rejected_values"),
      count(supabase, "universities", (q) => q.is("ipeds_unitid", null).is("retired_at", null)),
      count(supabase, "url_discovery_queue", (q) =>
        q.eq("status", "pending_review").not("discovered_url", "is", null),
      ),
      count(supabase, "pending_data_changes", (q) => q.eq("status", "pending")),
    ]);
    return { withheld, blocks, identity, discovered, review };
  });

/** Hosts a bot firewall has locked us out of. */
export const listQuarantinedHosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("host_protection")
      .select(
        "host, protection_kind, evidence, detections, first_detected_at, last_confirmed_at, last_probe_at, probe_status, lifted_at",
      )
      .is("lifted_at", null)
      .order("detections", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

/** Addresses withheld from the product because two schools claim the domain. */
export const listWithheldLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("link_conflicts")
      .select(
        "id, field, attempted_url, detail, created_at, program_id, university_id, holder_university_id, programs!link_conflicts_program_id_fkey(sport, universities(name, state)), universities!link_conflicts_university_id_fkey(name, state)",
      )
      .eq("status", "withheld")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const holderIds = Array.from(
      new Set(rows.map((row) => row.holder_university_id).filter(Boolean)),
    );
    let holders: Record<string, string> = {};
    if (holderIds.length) {
      const { data: holderRows } = await context.supabase
        .from("universities")
        .select("id, name")
        .in("id", holderIds);
      holders = Object.fromEntries(
        ((holderRows ?? []) as any[]).map((row) => [row.id, row.name as string]),
      );
    }

    return rows.map((row) => ({
      id: row.id as string,
      field: row.field as string,
      url: row.attempted_url as string,
      detail: (row.detail ?? null) as string | null,
      createdAt: row.created_at as string,
      schoolName: (row.universities?.name ?? row.programs?.universities?.name ?? null) as
        | string
        | null,
      state: (row.universities?.state ?? row.programs?.universities?.state ?? null) as
        | string
        | null,
      sport: (row.programs?.sport ?? null) as string | null,
      holderName: (row.holder_university_id ? holders[row.holder_university_id] : null) ?? null,
    }));
  });

/** Values a person or a check blocked from ever being proposed again. */
export const listPermanentBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("rejected_values")
      .select("id, table_name, record_id, field_name, normalized_value, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

/** Reversible runs, newest first, with what each one touched. */
export const listArchiveRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("link_clear_archive")
      .select("run_id, determination, field, created_at, restored_at, university_id")
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);

    const runs = new Map<
      string,
      {
        runId: string;
        rows: number;
        schools: Set<string>;
        fields: Set<string>;
        determinations: Set<string>;
        restored: number;
        firstAt: string;
      }
    >();
    for (const row of (data ?? []) as any[]) {
      const key = row.run_id as string;
      const entry =
        runs.get(key) ??
        {
          runId: key,
          rows: 0,
          schools: new Set<string>(),
          fields: new Set<string>(),
          determinations: new Set<string>(),
          restored: 0,
          firstAt: row.created_at as string,
        };
      entry.rows += 1;
      if (row.university_id) entry.schools.add(row.university_id);
      if (row.field) entry.fields.add(row.field);
      if (row.determination) entry.determinations.add(row.determination);
      if (row.restored_at) entry.restored += 1;
      if ((row.created_at as string) < entry.firstAt) entry.firstAt = row.created_at as string;
      runs.set(key, entry);
    }

    return Array.from(runs.values())
      .map((entry) => ({
        runId: entry.runId,
        rows: entry.rows,
        schools: entry.schools.size,
        fields: Array.from(entry.fields).sort(),
        determinations: Array.from(entry.determinations).sort(),
        restored: entry.restored,
        startedAt: entry.firstAt,
      }))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  });

/** Schools taken out of the recruitable set. */
export const listRetiredSchools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("universities")
      .select("id, name, state, city, retired_at, retired_reason, ipeds_unitid")
      .not("retired_at", "is", null)
      .order("retired_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

/** Teams a league list says the school does not field. */
export const listNotOfferedPrograms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context as any);
    const { data, error } = await context.supabase
      .from("programs")
      .select(
        "id, sport, governing_body, offering_source, updated_at, universities(name, state)",
      )
      .eq("offering_status", "not_offered")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((row) => ({
      id: row.id as string,
      sport: row.sport as string,
      governingBody: (row.governing_body ?? null) as string | null,
      source: (row.offering_source ?? null) as string | null,
      updatedAt: row.updated_at as string,
      schoolName: (row.universities?.name ?? null) as string | null,
      state: (row.universities?.state ?? null) as string | null,
    }));
  });

/** Counts for the public home page. Deliberately unauthenticated. */
export const getPublicStats = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [schools, programs, players, sourced] = await Promise.all([
    supabase.from("universities").select("id", { count: "exact", head: true }),
    supabase.from("programs").select("id", { count: "exact", head: true }),
    supabase.from("roster_players").select("id", { count: "exact", head: true }),
    supabase.from("field_sources").select("id", { count: "exact", head: true }),
  ]);

  return {
    schools: schools.count ?? 0,
    programs: programs.count ?? 0,
    players: players.count ?? 0,
    sourcedFields: sourced.count ?? 0,
  };
});
