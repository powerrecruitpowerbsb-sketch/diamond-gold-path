/**
 * The quarantine list for websites whose own firewall refuses automated reads.
 *
 * Behaviour, deliberately narrow:
 *   - a confirmed signature is written down once and re-confirmed on later sights;
 *   - a quarantined host is never fetched or rendered again by the sweep;
 *   - each sweep sends exactly ONE cheap probe per quarantined host to ask
 *     whether the protection has lifted, and lifts the quarantine if it has;
 *   - pages on a quarantined host are reported as "blocked by the site", which
 *     never changes a link's status and never touches a stored address.
 */

import {
  safeFetch,
  setProtectedHosts,
  setProtectionReporter,
  isHostProtected,
} from "@/lib/safe-fetch.server";
import { protectionLabel, type ProtectionSignal } from "@/lib/host-protection";

export type ProtectedHostRow = {
  host: string;
  protection_kind: string;
  evidence: string | null;
  detections: number;
  first_detected_at: string;
  last_confirmed_at: string;
  last_probe_at: string | null;
  probe_status: string | null;
  lifted_at: string | null;
};

/** Load the live quarantine list into the reader. Call once per run. */
export async function loadProtectedHosts(supabase: any): Promise<ProtectedHostRow[]> {
  const { data, error } = await supabase
    .from("host_protection")
    .select("host, protection_kind, evidence, detections, first_detected_at, last_confirmed_at, last_probe_at, probe_status, lifted_at")
    .is("lifted_at", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProtectedHostRow[];
  setProtectedHosts(rows);
  return rows;
}

/** Write a newly seen firewall down, or re-confirm one we already knew about. */
export async function recordProtection(supabase: any, host: string, signal: ProtectionSignal): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("host_protection")
    .select("host, detections")
    .eq("host", host)
    .maybeSingle();
  if (data?.host) {
    await supabase
      .from("host_protection")
      .update({
        protection_kind: signal.kind,
        evidence: signal.evidence.slice(0, 300),
        detections: (data.detections ?? 1) + 1,
        last_confirmed_at: now,
        lifted_at: null,
      })
      .eq("host", host);
    return;
  }
  await supabase.from("host_protection").insert({
    host,
    protection_kind: signal.kind,
    evidence: signal.evidence.slice(0, 300),
    first_detected_at: now,
    last_confirmed_at: now,
  });
}

/**
 * Wire the reader up so any firewall it meets during this run is written down
 * without the reader itself knowing anything about the database.
 */
export function watchForProtection(supabase: any): void {
  const seen = new Set<string>();
  setProtectionReporter((host, signal) => {
    if (seen.has(host)) return;
    seen.add(host);
    void recordProtection(supabase, host, signal).catch((failure) => {
      console.error(`Could not record bot protection for ${host}: ${(failure as Error).message}`);
    });
  });
}

/**
 * One cheap probe per quarantined host: has the protection lifted? A single
 * plain request, no rendering, no retries.
 */
export async function probeProtectedHosts(
  supabase: any,
  options: { limit?: number } = {},
): Promise<{ probed: number; lifted: string[]; stillBlocked: string[] }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const { data } = await supabase
    .from("host_protection")
    .select("host, protection_kind, last_probe_at")
    .is("lifted_at", null)
    .order("last_probe_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  const lifted: string[] = [];
  const stillBlocked: string[] = [];
  const now = new Date().toISOString();

  for (const row of ((data ?? []) as { host: string; protection_kind: string }[])) {
    const page = await safeFetch(`https://${row.host}/`, { tries: 1, ignoreProtection: true });
    const clear = page.ok;
    await supabase
      .from("host_protection")
      .update({
        last_probe_at: now,
        probe_status: clear ? "clear" : (page.failure_category ?? "blocked"),
        ...(clear ? { lifted_at: now } : {}),
      })
      .eq("host", row.host);
    if (clear) lifted.push(row.host);
    else stillBlocked.push(row.host);
  }

  await loadProtectedHosts(supabase);
  return { probed: (data ?? []).length, lifted, stillBlocked };
}

/** How much of the database sits behind a firewall right now. */
export async function protectionCoverage(supabase: any) {
  const hosts = await loadProtectedHosts(supabase);
  const hostSet = new Set(hosts.map((row) => row.host));
  const programs = new Set<string>();
  const schools = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("programs")
      .select("id, university_id, athletic_website, roster_url, coaching_staff_url")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (const row of rows) {
      const urls = [row.athletic_website, row.roster_url, row.coaching_staff_url].filter(Boolean) as string[];
      const blocked = urls.some((url) => {
        try {
          return hostSet.has(new URL(url).hostname.toLowerCase().replace(/^www\./, ""));
        } catch {
          return false;
        }
      });
      if (blocked) {
        programs.add(row.id);
        schools.add(row.university_id);
      }
    }
    if (rows.length < pageSize) break;
  }

  return {
    hosts: hosts.map((row) => ({ host: row.host, kind: protectionLabel(row.protection_kind), evidence: row.evidence })),
    hostCount: hosts.length,
    programCount: programs.size,
    schoolCount: schools.size,
  };
}

export { isHostProtected };
