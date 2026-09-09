/**
 * A page sweep that survives being stopped.
 *
 * Every page the run intends to read is written down first, grouped by the
 * website it lives on. The run then works one website at a time and saves its
 * progress after each one, so a run that hits a time limit reports exactly where
 * it stopped and the next call carries on from there instead of starting over.
 *
 * Websites known to block automated reading are settled without a request: their
 * pages are marked blocked, which leaves both the link and its status alone.
 */

import { auditStoredLinks, type AuditRow, type LinkField } from "@/lib/link-audit.server";
import { isHostProtected, loadProtectedHosts, watchForProtection } from "@/lib/host-protection.server";

export type SweepPlan = {
  runKey: string;
  targets: number;
  hosts: number;
  blockedTargets: number;
  alreadyDone: number;
};

export type SweepProgress = {
  runKey: string;
  status: string;
  pending: number;
  done: number;
  blocked: number;
  failed: number;
  hostsRemaining: number;
  lastHost: string | null;
  rows: AuditRow[];
};

const FIELDS: LinkField[] = ["roster_url", "coaching_staff_url"];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

/**
 * Write down every page this run owes. Safe to call again: existing targets are
 * left as they are, so re-planning never loses finished work.
 */
export async function planSweep(
  supabase: any,
  input: {
    runKey: string;
    label?: string;
    schoolIds: string[];
    /** Only pages currently sitting in the couldn't-be-read log. */
    onlyPreviouslyFailed?: boolean;
  },
): Promise<SweepPlan> {
  if (!input.schoolIds.length) {
    throw new Error("A sweep needs a list of schools. There is no setting that means every school.");
  }
  await loadProtectedHosts(supabase);

  let failedOnly: Set<string> | null = null;
  if (input.onlyPreviouslyFailed) {
    failedOnly = new Set<string>();
    const { data } = await supabase
      .from("unreadable_pages")
      .select("program_id, field")
      .is("resolved_at", null)
      .in("university_id", input.schoolIds);
    for (const row of ((data ?? []) as any[])) failedOnly.add(`${row.program_id}:${row.field}`);
  }

  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("programs")
      .select("id, university_id, roster_url, coaching_staff_url")
      .in("university_id", input.schoolIds)
      .eq("offering_status", "verified")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const programs = (data ?? []) as any[];
    for (const program of programs) {
      for (const field of FIELDS) {
        const url = String(program[field] ?? "").trim();
        if (!url) continue;
        if (failedOnly && !failedOnly.has(`${program.id}:${field}`)) continue;
        rows.push({
          run_key: input.runKey,
          host: hostOf(url),
          program_id: program.id,
          university_id: program.university_id,
          field,
          url,
          status: "pending",
        });
      }
    }
    if (programs.length < pageSize) break;
  }

  await supabase
    .from("sweep_runs")
    .upsert(
      { run_key: input.runKey, label: input.label ?? input.runKey, status: "planned", started_at: new Date().toISOString() },
      { onConflict: "run_key" },
    );

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from("sweep_targets")
      .upsert(rows.slice(index, index + 500), { onConflict: "run_key,program_id,field", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const { data: stored } = await supabase
    .from("sweep_targets")
    .select("host, status")
    .eq("run_key", input.runKey);
  const all = (stored ?? []) as { host: string; status: string }[];

  return {
    runKey: input.runKey,
    targets: all.length,
    hosts: new Set(all.map((row) => row.host)).size,
    blockedTargets: all.filter((row) => isHostProtected(`https://${row.host}/`)).length,
    alreadyDone: all.filter((row) => row.status !== "pending").length,
  };
}

/** Read one website's worth of pages, then save progress. Repeat until the budget runs out. */
export async function runSweep(
  supabase: any,
  input: { runKey: string; budgetMs?: number; actorId?: string | null; apply?: boolean },
): Promise<SweepProgress> {
  const budgetMs = input.budgetMs ?? 240_000;
  const startedAt = Date.now();
  await loadProtectedHosts(supabase);
  watchForProtection(supabase);

  await supabase
    .from("sweep_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("run_key", input.runKey);

  const rows: AuditRow[] = [];
  let lastHost: string | null = null;

  for (;;) {
    const { data: pending } = await supabase
      .from("sweep_targets")
      .select("host")
      .eq("run_key", input.runKey)
      .eq("status", "pending")
      .limit(1);
    const host = ((pending ?? []) as any[])[0]?.host as string | undefined;
    if (!host) break;
    if (Date.now() - startedAt > budgetMs) break;

    const { data: hostTargets } = await supabase
      .from("sweep_targets")
      .select("id, program_id, university_id, field, url")
      .eq("run_key", input.runKey)
      .eq("status", "pending")
      .eq("host", host);
    const targets = (hostTargets ?? []) as any[];
    lastHost = host;

    // A website that refuses machines is settled on the spot — no request at all.
    if (isHostProtected(`https://${host}/`)) {
      for (const target of targets) {
        await supabase
          .from("sweep_targets")
          .update({
            status: "blocked",
            outcome: "blocked_by_host",
            detail: "this site blocks automated reading — page left untouched",
            checked_at: new Date().toISOString(),
          })
          .eq("id", target.id);
      }
      await supabase
        .from("sweep_runs")
        .update({ last_host: host, last_message: `${host}: blocked by the site, ${targets.length} page(s) skipped` })
        .eq("run_key", input.runKey);
      continue;
    }

    const schoolIds = [...new Set(targets.map((target) => target.university_id).filter(Boolean))] as string[];
    const result = await auditStoredLinks(supabase, {
      apply: input.apply ?? true,
      schoolIds,
      targets: targets.map((target) => ({ programId: target.program_id, field: target.field as LinkField })),
      limit: 200,
      budgetMs: Math.max(budgetMs - (Date.now() - startedAt), 20_000),
      actorId: input.actorId ?? null,
    });

    const byKey = new Map(result.rows.map((row) => [`${row.programId}:${row.field}`, row]));
    for (const target of targets) {
      const row = byKey.get(`${target.program_id}:${target.field}`);
      const status = !row
        ? "pending"
        : row.failureCategory === "blocked_by_host"
          ? "blocked"
          : row.verdict === "failed"
            ? "failed"
            : "done";
      if (status === "pending") continue;
      await supabase
        .from("sweep_targets")
        .update({
          status,
          outcome: row?.failureCategory ?? row?.verdict ?? null,
          detail: (row?.reason ?? "").slice(0, 400),
          checked_at: new Date().toISOString(),
        })
        .eq("id", target.id);
    }
    rows.push(...result.rows);

    await supabase
      .from("sweep_runs")
      .update({
        last_host: host,
        last_message: `${host}: ${result.confirmed} confirmed, ${result.cleared} cleared, ${result.unclear} unclear, ${result.blocked} blocked, ${result.failed} failed`,
      })
      .eq("run_key", input.runKey);
  }

  const { data: tally } = await supabase
    .from("sweep_targets")
    .select("host, status")
    .eq("run_key", input.runKey);
  const all = (tally ?? []) as { host: string; status: string }[];
  const pending = all.filter((row) => row.status === "pending");
  const status = pending.length ? "paused" : "finished";

  await supabase
    .from("sweep_runs")
    .update({
      status,
      totals: {
        targets: all.length,
        done: all.filter((row) => row.status === "done").length,
        blocked: all.filter((row) => row.status === "blocked").length,
        failed: all.filter((row) => row.status === "failed").length,
        pending: pending.length,
      },
      ...(status === "finished" ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("run_key", input.runKey);

  return {
    runKey: input.runKey,
    status,
    pending: pending.length,
    done: all.filter((row) => row.status === "done").length,
    blocked: all.filter((row) => row.status === "blocked").length,
    failed: all.filter((row) => row.status === "failed").length,
    hostsRemaining: new Set(pending.map((row) => row.host)).size,
    lastHost,
    rows,
  };
}
