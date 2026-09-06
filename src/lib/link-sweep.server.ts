/**
 * Tidy-up pass over the discovered-links queue.
 *
 * It only acts where the answer is not a judgement call: links for the wrong
 * sport, old season archives, news stories, junk hosts and "athletics site"
 * guesses that are really the school's homepage all get declined and sent back
 * for a fresh search; roster and coaching pages that name the right sport and
 * sit on the school's already-confirmed athletics site get approved. Everything
 * else is left for a person.
 */

import { classifyLink, type LinkKind, type LinkVerdict } from "@/lib/link-quality";

export type SweepCounts = {
  scanned: number;
  approve: number;
  reject: number;
  ask: number;
  byReason: Record<string, number>;
  requeuedSchools: number;
  failures: number;
  /** True when more pending links remain than this pass looked at. */
  moreWaiting: boolean;
};

type Row = {
  id: string;
  university_id: string;
  program_id: string | null;
  discovery_type: LinkKind;
  discovered_url: string | null;
  universities: { website_url: string | null } | null;
  programs: { sport: string | null; athletic_website: string | null } | null;
};

export { sweepReasonLabel } from "@/lib/link-sweep-labels";

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

export async function sweepDiscoveredLinks(
  supabase: any,
  actorId: string,
  options: { apply: boolean; limit?: number } = { apply: false },
): Promise<SweepCounts> {
  const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);

  const { count: pendingTotal } = await supabase
    .from("url_discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .not("discovered_url", "is", null);

  const { data, error } = await supabase
    .from("url_discovery_queue")
    .select(
      "id, university_id, program_id, discovery_type, discovered_url, universities(website_url), programs(sport, athletic_website)",
    )
    .eq("status", "pending_review")
    .not("discovered_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const counts: SweepCounts = {
    scanned: rows.length,
    approve: 0,
    reject: 0,
    ask: 0,
    byReason: {},
    requeuedSchools: 0,
    failures: 0,
    moreWaiting: (pendingTotal ?? 0) > rows.length,
  };

  const toApprove: Row[] = [];
  const toReject: { row: Row; verdict: LinkVerdict }[] = [];

  for (const row of rows) {
    const verdict = classifyLink({
      kind: row.discovery_type,
      url: row.discovered_url,
      sport: row.programs?.sport ?? null,
      schoolWebsite: row.universities?.website_url ?? null,
      athleticWebsite: row.programs?.athletic_website ?? null,
    });
    if (verdict.action === "ask") {
      counts.ask += 1;
      continue;
    }
    counts.byReason[verdict.code] = (counts.byReason[verdict.code] ?? 0) + 1;
    if (verdict.action === "approve") {
      counts.approve += 1;
      toApprove.push(row);
    } else {
      counts.reject += 1;
      toReject.push({ row, verdict });
    }
  }

  if (!options.apply) return counts;

  const now = new Date().toISOString();
  const { applyDiscoveredUrl, requeueSchoolForDiscovery, REJECT_RESEARCH_LIMIT } = await import(
    "@/lib/discovery.server"
  );

  // --- Approvals: write the link to live data, one at a time ----------------
  for (const row of toApprove) {
    try {
      await applyDiscoveredUrl(supabase, row as any);
      await supabase
        .from("url_discovery_queue")
        .update({ status: "confirmed", reviewed_by: actorId, reviewed_at: now })
        .eq("id", row.id)
        .eq("status", "pending_review");
    } catch {
      counts.failures += 1;
      counts.approve -= 1;
    }
  }

  // --- Declines: mark in bulk, then send each school back once --------------
  const rejectIds = toReject.map((entry) => entry.row.id);
  for (const ids of chunk(rejectIds, 200)) {
    const { error: updateError } = await supabase
      .from("url_discovery_queue")
      .update({ status: "rejected", reviewed_by: actorId, reviewed_at: now })
      .in("id", ids)
      .eq("status", "pending_review");
    if (updateError) counts.failures += ids.length;
  }

  // One fresh search per school + link kind, and only while the school is under
  // the retry cap — otherwise it needs a link typed in by hand.
  const pairs = new Map<string, { universityId: string; kind: LinkKind }>();
  for (const { row } of toReject) {
    pairs.set(`${row.university_id}:${row.discovery_type}`, {
      universityId: row.university_id,
      kind: row.discovery_type,
    });
  }

  const tried = new Set<string>();
  for (const { universityId, kind } of pairs.values()) {
    if (tried.has(universityId)) continue;
    const { count: rejectedSoFar } = await supabase
      .from("url_discovery_queue")
      .select("id", { count: "exact", head: true })
      .eq("university_id", universityId)
      .eq("discovery_type", kind)
      .eq("status", "rejected");
    if ((rejectedSoFar ?? 0) > REJECT_RESEARCH_LIMIT * 4) continue;
    const outcome = await requeueSchoolForDiscovery(supabase, universityId);
    if (outcome.requeued) counts.requeuedSchools += 1;
    tried.add(universityId);
  }

  return counts;
}
