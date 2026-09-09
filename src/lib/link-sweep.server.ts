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

import { classifyLink, hostOf, type LinkKind, type LinkVerdict } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";

export type SweepCounts = {
  scanned: number;
  approve: number;
  reject: number;
  ask: number;
  byReason: Record<string, number>;
  requeuedSchools: number;
  failures: number;
  /** Waiting rows with no address at all — nothing here can be judged. */
  skippedNoUrl: number;
  /** True when more pending links remain than this pass looked at. */
  moreWaiting: boolean;
};

type Row = {
  id: string;
  university_id: string;
  program_id: string | null;
  discovery_type: LinkKind;
  discovered_url: string | null;
  universities: { name: string | null; website_url: string | null } | null;
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
  options: { apply: boolean; limit?: number; offset?: number } = { apply: false },
): Promise<SweepCounts> {
  const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
  const offset = Math.max(options.offset ?? 0, 0);

  const { count: pendingTotal } = await supabase
    .from("url_discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .not("discovered_url", "is", null);

  // Rows where the search came back empty can't be judged here; they belong to
  // the "couldn't find" list. Counted so the report explains itself.
  const { count: noUrlTotal } = await supabase
    .from("url_discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .is("discovered_url", null);


  const { data, error } = await supabase
    .from("url_discovery_queue")
    .select(
      "id, university_id, program_id, discovery_type, discovered_url, universities(name, website_url), programs(sport, athletic_website)",
    )
    .eq("status", "pending_review")
    .not("discovered_url", "is", null)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
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
    skippedNoUrl: noUrlTotal ?? 0,
    moreWaiting: (pendingTotal ?? 0) > offset + rows.length,
  };

  // Every athletics site already confirmed for these schools, so a roster or
  // coaching page on a sibling program's site is recognised too.
  const schoolIds = [...new Set(rows.map((row) => row.university_id))];
  const hostsBySchool = new Map<string, string[]>();
  for (const ids of chunk(schoolIds, 100)) {
    const { data: programs } = await supabase
      .from("programs")
      .select("university_id, athletic_website")
      .in("university_id", ids)
      .not("athletic_website", "is", null);
    for (const program of (programs ?? []) as any[]) {
      const list = hostsBySchool.get(program.university_id) ?? [];
      list.push(program.athletic_website);
      hostsBySchool.set(program.university_id, list);
    }
  }

  // Ownership is an ID question, not a string-similarity question.
  //
  // Two things settle it: the federal record of the institution that owns the
  // domain, and the institution ID already holding it in our own data. Names are
  // only used to say who, in the message a person reads.
  const linkDomains = [
    ...new Set(rows.map((row) => registrableDomain(hostOf(row.discovered_url))).filter(Boolean)),
  ];

  const platformDomains = new Set<string>();
  {
    const { data: platforms } = await supabase.from("link_platform_hosts").select("host");
    for (const entry of (platforms ?? []) as { host: string }[]) platformDomains.add(entry.host);
  }

  /** Institution IDs (ours) already holding each domain, with a name for display. */
  const holdersByDomain = new Map<string, { universityId: string; name: string | null }[]>();
  for (const domains of chunk(linkDomains, 40)) {
    const filter = domains.map((domain) => `athletic_website.ilike.%${domain}%`).join(",");
    const { data: rivals } = await supabase
      .from("programs")
      .select("university_id, athletic_website, universities(name)")
      .or(filter)
      .limit(2000);
    for (const entry of (rivals ?? []) as any[]) {
      const domain = registrableDomain(hostOf(entry.athletic_website));
      if (!domain || !domains.includes(domain)) continue;
      const list = holdersByDomain.get(domain) ?? [];
      if (!list.some((claim) => claim.universityId === entry.university_id)) {
        list.push({ universityId: entry.university_id, name: entry.universities?.name ?? null });
      }
      holdersByDomain.set(domain, list);
    }
  }

  /** Which institution does the federal directory say owns each domain? */
  const federalOwner = new Map<string, { unitid: number; name: string; state: string | null }>();
  for (const domains of chunk(linkDomains, 20)) {
    for (const domain of domains) {
      if (platformDomains.has(domain)) continue;
      const { data } = await supabase
        .from("federal_directory")
        .select("unitid, name, state, website")
        .not("website", "is", null)
        .ilike("website", `%${domain}%`)
        .limit(10);
      const hit = ((data ?? []) as any[]).find(
        (entry) => registrableDomain(hostOf(String(entry.website))) === domain,
      );
      if (hit) {
        federalOwner.set(domain, {
          unitid: Number(hit.unitid),
          name: String(hit.name ?? ""),
          state: hit.state ?? null,
        });
      }
    }
  }

  /** Institution IDs for the schools in this batch. */
  const unitidBySchool = new Map<string, number | null>();
  for (const ids of chunk(schoolIds, 200)) {
    const { data } = await supabase.from("universities").select("id, ipeds_unitid").in("id", ids);
    for (const entry of (data ?? []) as any[]) {
      unitidBySchool.set(entry.id, entry.ipeds_unitid ? Number(entry.ipeds_unitid) : null);
    }
  }

  /** The other school this domain belongs to, decided on institution IDs. */
  function belongsToAnotherSchool(row: Row): string | null {
    const domain = registrableDomain(hostOf(row.discovered_url));
    if (!domain || platformDomains.has(domain)) return null;

    // Federal record first: it is the authority on who owns a domain.
    const owner = federalOwner.get(domain);
    const ourUnitid = unitidBySchool.get(row.university_id) ?? null;
    if (owner) {
      if (ourUnitid && owner.unitid === ourUnitid) return null;
      return owner.state ? `${owner.name} (${owner.state})` : owner.name;
    }

    // Otherwise: is another institution ID already holding it?
    const holders = (holdersByDomain.get(domain) ?? []).filter(
      (claim) => claim.universityId !== row.university_id,
    );
    if (!holders.length) return null;
    return holders[0]!.name ?? "another school";
  }

  const toApprove: Row[] = [];
  const toReject: { row: Row; verdict: LinkVerdict }[] = [];

  for (const row of rows) {
    const verdict = classifyLink({
      kind: row.discovery_type,
      url: row.discovered_url,
      sport: row.programs?.sport ?? null,
      schoolWebsite: row.universities?.website_url ?? null,
      athleticWebsite: row.programs?.athletic_website ?? null,
      athleticHosts: hostsBySchool.get(row.university_id) ?? [],
    });
    if (verdict.action === "ask") {
      const otherSchool = belongsToAnotherSchool(row);
      if (otherSchool) {
        const owned: LinkVerdict = {
          action: "reject",
          reason: `This page belongs to ${otherSchool}, not this school.`,
          code: "wrong_school",
        };
        counts.byReason[owned.code] = (counts.byReason[owned.code] ?? 0) + 1;
        counts.reject += 1;
        toReject.push({ row, verdict: owned });
        continue;
      }
      counts.ask += 1;
      continue;
    }
    counts.byReason[verdict.code] = (counts.byReason[verdict.code] ?? 0) + 1;
    if (verdict.action === "approve") {
      counts.approve += 1;
      // A single team's page proves the athletics site; keep the site's home page.
      toApprove.push(
        verdict.normalizedUrl
          ? ({ ...row, discovered_url: verdict.normalizedUrl } as Row)
          : row,
      );
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
        .update({
          status: "confirmed",
          reviewed_by: actorId,
          reviewed_at: now,
          discovered_url: row.discovered_url,
        })
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
    if ((rejectedSoFar ?? 0) >= REJECT_RESEARCH_LIMIT) continue;
    const outcome = await requeueSchoolForDiscovery(supabase, universityId, kind);
    if (outcome.requeued) counts.requeuedSchools += 1;
    tried.add(universityId);
  }

  return counts;
}

/**
 * Work the whole pile rather than one batch: repeat passes until nothing is
 * waiting, a pass decides nothing new, or the time budget runs out. The caller
 * can run it again to pick up where this left off.
 */
export async function sweepLinksUntilDone(
  supabase: any,
  actorId: string,
  options: { apply: boolean; maxPasses?: number; budgetMs?: number } = { apply: false },
): Promise<SweepCounts & { passes: number }> {
  const maxPasses = Math.min(Math.max(options.maxPasses ?? 8, 1), 20);
  const budgetMs = options.budgetMs ?? 45_000;
  const startedAt = Date.now();

  const total: SweepCounts & { passes: number } = {
    scanned: 0,
    approve: 0,
    reject: 0,
    ask: 0,
    byReason: {},
    requeuedSchools: 0,
    failures: 0,
    skippedNoUrl: 0,
    moreWaiting: false,
    passes: 0,
  };

  // Items left for a person stay in the queue, so each pass steps past the ones
  // the last pass already decided to leave alone.
  let offset = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const counts = await sweepDiscoveredLinks(supabase, actorId, {
      apply: options.apply,
      limit: 1000,
      offset,
    });
    total.passes += 1;
    total.scanned += counts.scanned;
    total.approve += counts.approve;
    total.reject += counts.reject;
    total.ask += counts.ask;
    total.requeuedSchools += counts.requeuedSchools;
    total.failures += counts.failures;
    total.moreWaiting = counts.moreWaiting;
    total.skippedNoUrl = counts.skippedNoUrl;
    for (const [code, count] of Object.entries(counts.byReason)) {
      total.byReason[code] = (total.byReason[code] ?? 0) + count;
    }
    offset += counts.ask;

    // A preview never changes anything, so one pass is all it can tell us.
    if (!options.apply) break;
    if (!counts.moreWaiting || counts.scanned === 0) break;
    if (Date.now() - startedAt > budgetMs) break;
  }


  return total;
}

export type RetireEmptyResult = {
  found: number;
  retired: number;
  programsQueued: number;
  moreWaiting: boolean;
  /** Rows closed because the page they were looking for is already on file. */
  alreadyOnFile: number;
};

/** Which saved column answers a given kind of search. */
const SATISFIED_BY: Partial<Record<LinkKind, "roster_url" | "coaching_staff_url">> = {
  roster_page: "roster_url",
  coaching_staff_page: "coaching_staff_url",
};

/**
 * A waiting row with no address at all is a search that came back empty — there
 * is nothing for a person to decide. Retire those rows and put the team back in
 * line for a fresh search instead of leaving them in the review list.
 *
 * A search recorded as empty for a page the team already has on file is not a
 * gap at all — somebody, or an earlier pass, already answered it. Those rows are
 * closed quietly so they never show up as work.
 */
export async function retireEmptyDiscoveryRows(
  supabase: any,
  actorId: string,
  options: { apply?: boolean; limit?: number } = {},
): Promise<RetireEmptyResult> {
  const limit = Math.min(Math.max(options.limit ?? 2000, 1), 5000);

  // The Data API caps a single read at 1,000 rows, so walk the pile in pages.
  const rows: {
    id: string;
    university_id: string;
    program_id: string | null;
    discovery_type: LinkKind;
    programs: { roster_url: string | null; coaching_staff_url: string | null } | null;
  }[] = [];
  for (let page = 0; page <= limit; page += 500) {
    const { data, error } = await supabase
      .from("url_discovery_queue")
      .select("id, university_id, program_id, discovery_type, programs(roster_url, coaching_staff_url)")
      .eq("status", "pending_review")
      .is("discovered_url", null)
      .order("created_at", { ascending: true })
      .range(page, page + 499);
    if (error) throw new Error(error.message);
    const chunkRows = (data ?? []) as typeof rows;
    rows.push(...chunkRows);
    if (chunkRows.length < 500 || rows.length > limit) break;
  }

  const moreWaiting = rows.length > limit;
  const all = rows.slice(0, limit);

  const satisfied = all.filter((row) => {
    const column = SATISFIED_BY[row.discovery_type];
    return Boolean(column && row.programs?.[column]);
  });
  const batch = all.filter((row) => !satisfied.includes(row));

  const result: RetireEmptyResult = {
    found: batch.length,
    retired: 0,
    programsQueued: 0,
    moreWaiting,
    alreadyOnFile: satisfied.length,
  };
  if (!options.apply) return result;

  if (satisfied.length) {
    const closedAt = new Date().toISOString();
    for (const ids of chunk(satisfied.map((row) => row.id), 200)) {
      const { error: closeError } = await supabase
        .from("url_discovery_queue")
        .update({
          status: "confirmed",
          reviewed_by: actorId,
          reviewed_at: closedAt,
          notes: "This page is already saved on the team — nothing to decide.",
        })
        .in("id", ids)
        .eq("status", "pending_review");
      if (closeError) throw new Error(closeError.message);
    }
  }

  if (!batch.length) return result;


  const now = new Date().toISOString();
  for (const ids of chunk(batch.map((row) => row.id), 200)) {
    const { error: updateError } = await supabase
      .from("url_discovery_queue")
      .update({
        status: "rejected",
        reviewed_by: actorId,
        reviewed_at: now,
        notes: "Search came back with no address — retired and queued for a fresh search.",
      })
      .in("id", ids)
      .eq("status", "pending_review");
    if (updateError) throw new Error(updateError.message);
    result.retired += ids.length;
  }

  // Put the affected teams back in line for another look at their links. The
  // queue's uniqueness is a partial index, which the Data API can't use for an
  // upsert, so existing jobs are reset and only the missing ones inserted.
  const jobs = new Map<string, { university_id: string; program_id: string }>();
  for (const row of batch) {
    if (!row.program_id) continue;
    jobs.set(row.program_id, { university_id: row.university_id, program_id: row.program_id });
  }
  const wanted = [...jobs.values()];

  const existing = new Set<string>();
  for (const group of chunk(wanted, 200)) {
    const { data: found, error: findError } = await supabase
      .from("ingest_queue")
      .select("program_id")
      .eq("stage", "url_discovery")
      .in("program_id", group.map((job) => job.program_id));
    if (findError) throw new Error(findError.message);
    for (const row of (found ?? []) as any[]) existing.add(row.program_id);
  }

  const reset = wanted.filter((job) => existing.has(job.program_id));
  for (const group of chunk(reset, 200)) {
    const { error: resetError } = await supabase
      .from("ingest_queue")
      .update({
        status: "pending",
        attempts: 0,
        leased_at: null,
        last_error: null,
        updated_at: now,
      })
      .eq("stage", "url_discovery")
      .in("program_id", group.map((job) => job.program_id));
    if (resetError) throw new Error(resetError.message);
    result.programsQueued += group.length;
  }

  const fresh = wanted.filter((job) => !existing.has(job.program_id));
  for (const group of chunk(fresh, 300)) {
    const { error: insertError } = await supabase.from("ingest_queue").insert(
      group.map((job) => ({
        university_id: job.university_id,
        program_id: job.program_id,
        stage: "url_discovery",
        status: "pending",
        attempts: 0,
      })),
    );
    if (insertError) throw new Error(insertError.message);
    result.programsQueued += group.length;
  }

  return result;
}


