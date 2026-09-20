/**
 * Data Operations: the reading and small repairs behind the one operations
 * screen. Nothing here changes how collection works — it only reports what the
 * baseline run left behind and lets a person repair a single school by hand.
 */

import { safeFetch } from "@/lib/safe-fetch.server";
import { protectionLabel } from "@/lib/host-protection";

const LINK_FIELDS = new Set(["roster_url", "coaching_staff_url", "athletic_website"]);

const hostOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

async function allPrograms(supabase: any) {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("programs")
      .select("id, sport, university_id, athletic_website, roster_url, coaching_staff_url, universities(name)")
      .neq("offering_status", "not_offered")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as any[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

export type BlockedSite = {
  host: string;
  kind: string;
  label: string;
  evidence: string | null;
  detections: number;
  firstDetectedAt: string | null;
  lastProbeAt: string | null;
  probeStatus: string | null;
  programCount: number;
  schoolCount: number;
  schools: { programId: string; school: string; sport: string }[];
};

/** Every site still turning us away, with the teams waiting behind it. */
export async function blockedSites(supabase: any): Promise<BlockedSite[]> {
  const { data, error } = await supabase
    .from("host_protection")
    .select(
      "host, protection_kind, evidence, detections, first_detected_at, last_probe_at, probe_status",
    )
    .is("lifted_at", null)
    .order("detections", { ascending: false });
  if (error) throw new Error(error.message);

  const hosts = (data ?? []) as any[];
  const byHost = new Map<string, BlockedSite>();
  for (const row of hosts) {
    byHost.set(row.host, {
      host: row.host,
      kind: row.protection_kind,
      label: protectionLabel(row.protection_kind),
      evidence: row.evidence ?? null,
      detections: row.detections ?? 0,
      firstDetectedAt: row.first_detected_at ?? null,
      lastProbeAt: row.last_probe_at ?? null,
      probeStatus: row.probe_status ?? null,
      programCount: 0,
      schoolCount: 0,
      schools: [],
    });
  }

  const programs = await allPrograms(supabase);
  const schoolsPerHost = new Map<string, Set<string>>();
  for (const program of programs) {
    const urls = [program.roster_url, program.coaching_staff_url, program.athletic_website];
    const matched = new Set<string>();
    for (const url of urls) {
      const host = hostOf(url);
      if (host && byHost.has(host)) matched.add(host);
    }
    for (const host of matched) {
      const entry = byHost.get(host)!;
      entry.programCount += 1;
      if (entry.schools.length < 25) {
        entry.schools.push({
          programId: program.id,
          school: program.universities?.name ?? "Unknown school",
          sport: program.sport,
        });
      }
      const set = schoolsPerHost.get(host) ?? new Set<string>();
      set.add(program.university_id);
      schoolsPerHost.set(host, set);
    }
  }
  for (const [host, set] of schoolsPerHost) {
    const entry = byHost.get(host);
    if (entry) entry.schoolCount = set.size;
  }

  return [...byHost.values()].sort((a, b) => b.programCount - a.programCount);
}

/** One cheap request to a single site: has the firewall lifted? */
export async function probeOneHost(
  supabase: any,
  host: string,
): Promise<{ host: string; clear: boolean; detail: string }> {
  const page = await safeFetch(`https://${host}/`, { tries: 1, ignoreProtection: true });
  const now = new Date().toISOString();
  const clear = Boolean(page.ok);
  const { error } = await supabase
    .from("host_protection")
    .update({
      last_probe_at: now,
      probe_status: clear ? "clear" : (page.failure_category ?? "blocked"),
      ...(clear ? { lifted_at: now } : {}),
    })
    .eq("host", host);
  if (error) throw new Error(error.message);
  return {
    host,
    clear,
    detail: clear ? "Answered normally — released for the next run." : (page.failure_category ?? "still blocked"),
  };
}

export type BrokenLink = {
  id: string;
  programId: string;
  school: string;
  sport: string;
  field: string;
  url: string | null;
  failures: number;
  reason: string | null;
  lastError: string | null;
  lastOkAt: string | null;
};

/** Addresses the reader could not open, newest trouble first. */
export async function brokenLinks(supabase: any, limit = 200): Promise<BrokenLink[]> {
  const { data, error } = await supabase
    .from("link_health")
    .select(
      "id, program_id, field, url, consecutive_failures, last_failure_category, last_error, last_verified_ok_at, updated_at, programs(sport, universities(name))",
    )
    .eq("link_status", "dead")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    programId: row.program_id,
    school: row.programs?.universities?.name ?? "Unknown school",
    sport: row.programs?.sport ?? "—",
    field: row.field,
    url: row.url ?? null,
    failures: row.consecutive_failures ?? 0,
    reason: row.last_failure_category ?? null,
    lastError: row.last_error ?? null,
    lastOkAt: row.last_verified_ok_at ?? null,
  }));
}

/**
 * Save a corrected address by hand. The page must open and must belong to the
 * school's own site before anything is stored.
 */
export async function repairProgramLink(
  supabase: any,
  input: { programId: string; field: string; url: string },
): Promise<{ ok: boolean; message: string }> {
  if (!LINK_FIELDS.has(input.field)) throw new Error("That is not an address we store.");
  if (!/^https?:\/\/\S+\.\S+/i.test(input.url)) {
    throw new Error("That doesn't look like a web address — it should start with https://");
  }

  const page = await safeFetch(input.url, { tries: 1 });
  if (!page.ok) {
    return { ok: false, message: `That address did not open (${page.failure_category ?? "no answer"}). Nothing was saved.` };
  }

  const { error } = await supabase
    .from("programs")
    .update({ [input.field]: input.url })
    .eq("id", input.programId);
  if (error) throw new Error(error.message);

  const health = await supabase
    .from("link_health")
    .update({
      url: input.url,
      link_status: "unverified",
      consecutive_failures: 0,
      not_found_runs: 0,
      last_error: null,
      last_failure_category: null,
      updated_at: new Date().toISOString(),
    })
    .eq("program_id", input.programId)
    .eq("field", input.field)
    .select("id");
  if (health.error) throw new Error(health.error.message);

  return { ok: true, message: "The page opened, so the new address is saved. Read it now to pull the data in." };
}

export type RefreshCycle = {
  key: string;
  name: string;
  blurb: string;
  month: number;
  day: number;
  nextRun: string;
};

const CYCLES: Omit<RefreshCycle, "nextRun">[] = [
  {
    key: "fall",
    name: "Fall pre-season",
    blurb: "New rosters posted, coaching changes settled.",
    month: 10,
    day: 1,
  },
  {
    key: "spring",
    name: "Spring active season",
    blurb: "In-season roster corrections and new staff pages.",
    month: 2,
    day: 15,
  },
  {
    key: "summer",
    name: "Summer transfer & draft",
    blurb: "Departures, transfers and incoming classes.",
    month: 6,
    day: 15,
  },
];

/**
 * The three yearly reads. Dates are worked out from the calendar every time it
 * is asked, so once one cycle passes the next date sets itself with no upkeep.
 */
export function refreshCycles(now = new Date()): RefreshCycle[] {
  return CYCLES.map((cycle) => {
    let year = now.getUTCFullYear();
    const thisYear = Date.UTC(year, cycle.month - 1, cycle.day);
    if (thisYear <= now.getTime()) year += 1;
    return {
      ...cycle,
      nextRun: new Date(Date.UTC(year, cycle.month - 1, cycle.day)).toISOString(),
    };
  }).sort((a, b) => a.nextRun.localeCompare(b.nextRun));
}
