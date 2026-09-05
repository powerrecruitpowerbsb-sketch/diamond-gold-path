/**
 * Fill in school facts from the schools' own websites.
 *
 * The national list simply does not contain every school we track — small
 * junior colleges and a handful of private schools are missing outright. For
 * those, the school's own admissions and tuition pages are the best available
 * source, so we read them and route every fact through the normal review queue.
 */

import {
  UNIVERSITY_EXTRACTABLE,
  buildFieldProposals,
  extractUniversityFields,
  isAutoApplicable,
  mergeFieldProposals,
  scrape,
  type ProposalRow,
} from "@/lib/ingest.server";

const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";

const SCHOOL_COLUMNS =
  "id, name, city, state, website_url, admissions_url, federal_match_status, avg_gpa, avg_sat, avg_act, acceptance_rate, graduation_rate, test_optional, student_faculty_ratio, undergrad_enrollment, tuition_in_state, tuition_out_state, room_board, est_cost_of_attendance, est_net_price, campus_setting, public_private";

export type WebFillOutcome = {
  universityId: string;
  schoolName: string;
  websiteUrl: string | null;
  pagesRead: number;
  factsFound: number;
  factsApplied: number;
  factsQueued: number;
  status: "filled" | "nothing_found" | "no_website" | "failed";
  errorMessage: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/**
 * Look up the school's own pages that state cost and admissions figures. A
 * homepage rarely lists tuition, so we search for the pages that do and keep
 * only results on the school's own .edu domain.
 */
async function findSchoolPages(name: string, state: string | null): Promise<string[]> {
  const response = await fetch(`${GATEWAY_FIRECRAWL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": requireEnv("FIRECRAWL_API_KEY_1"),
    },
    body: JSON.stringify({
      query: `${name}${state ? ` ${state}` : ""} tuition and fees cost of attendance admissions requirements`,
      limit: 8,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Website search failed [${response.status}] ${name}: ${body}`);
    return [];
  }

  const payload = (await response.json()) as any;
  const raw = payload?.data?.web ?? payload?.data ?? payload?.results ?? [];
  const results: any[] = Array.isArray(raw) ? raw : [];

  const urls: string[] = [];
  const domains = new Set<string>();
  for (const result of results) {
    const url = String(result?.url ?? "");
    // Directory and ranking sites describe schools; only the school's own
    // domain counts as an official source, and .edu is the reliable signal.
    if (!url || !/^https?:\/\/[^/]*\.edu(\/|$|:)/i.test(url)) continue;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    // Two pages from one school is plenty; more than that mostly repeats itself.
    if (domains.size && !domains.has(host)) continue;
    domains.add(host);
    if (!urls.includes(url)) urls.push(url);
    if (urls.length >= 2) break;
  }
  return urls;
}

/** Read one school's own pages and turn what they say into review items. */
export async function webFillSchool(
  supabase: any,
  userId: string,
  universityId: string,
): Promise<WebFillOutcome> {
  const { data: school, error } = await supabase
    .from("universities")
    .select(SCHOOL_COLUMNS)
    .eq("id", universityId)
    .single();
  if (error) throw new Error(error.message);

  const record = school as Record<string, any>;
  const outcome: WebFillOutcome = {
    universityId,
    schoolName: String(record["name"] ?? ""),
    websiteUrl: record["website_url"] ?? null,
    pagesRead: 0,
    factsFound: 0,
    factsApplied: 0,
    factsQueued: 0,
    status: "nothing_found",
    errorMessage: null,
  };

  const found = await findSchoolPages(outcome.schoolName, record["state"] ?? null);
  const targets = [record["admissions_url"] ?? null, ...found].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
  );

  if (!targets.length) {
    outcome.status = "no_website";
    outcome.errorMessage = "Couldn't find this school's own cost or admissions pages";
    return outcome;
  }

  if (!record["website_url"] && found[0]) {
    // The address itself is worth keeping so later runs start from it.
    try {
      const home = new URL(found[0]).origin;
      outcome.websiteUrl = home;
      await supabase.from("universities").update({ website_url: home }).eq("id", universityId);
    } catch {
      /* a malformed address simply isn't stored */
    }
  }


  const proposals: ProposalRow[] = [];
  const failures: string[] = [];

  for (const url of targets) {
    try {
      const markdown = await scrape(url);
      outcome.pagesRead += 1;
      const extracted = await extractUniversityFields(markdown);
      proposals.push(
        ...buildFieldProposals("universities", universityId, record, UNIVERSITY_EXTRACTABLE, extracted, url),
      );
    } catch (failure) {
      failures.push(failure instanceof Error ? failure.message : "page could not be read");
    }
  }

  if (!outcome.pagesRead) {
    outcome.status = "failed";
    outcome.errorMessage = failures[0] ?? "None of this school's pages could be read";
    return outcome;
  }

  const merged = mergeFieldProposals(proposals);
  outcome.factsFound = merged.length;

  if (merged.length) {
    // Never queue a field twice: an untouched review item already covers it.
    const { data: pending } = await supabase
      .from("pending_data_changes")
      .select("field_name")
      .eq("status", "pending")
      .eq("table_name", "universities")
      .eq("record_id", universityId);
    const already = new Set(((pending ?? []) as any[]).map((row) => String(row.field_name)));
    const fresh = merged.filter((row) => !already.has(String(row.field_name)));

    const toInsert = fresh.map((row) => {
      const { gap_fill: _gapFill, ...rest } = row;
      return { ...rest, decided_via: isAutoApplicable(row) ? "auto" : "human" };
    });

    if (toInsert.length) {
      const { data: inserted, error: insertError } = await supabase
        .from("pending_data_changes")
        .insert(toInsert)
        .select(
          "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
        );
      if (insertError) throw new Error(insertError.message);

      const autoKeys = new Set(fresh.filter(isAutoApplicable).map((row) => String(row.field_name)));
      const { approvePending } = await import("@/lib/review.server");
      for (const row of (inserted ?? []) as any[]) {
        if (!autoKeys.has(String(row.field_name))) continue;
        try {
          await approvePending(supabase, userId, row);
          outcome.factsApplied += 1;
        } catch (failure) {
          console.error(`Web-fill auto-apply failed for ${row.field_name}: ${(failure as Error).message}`);
        }
      }
      outcome.factsQueued = Math.max(((inserted ?? []) as any[]).length - outcome.factsApplied, 0);
    }
  }

  if (outcome.factsApplied || outcome.factsQueued) outcome.status = "filled";

  // Marking the school as filled in by hand takes it out of the decision list;
  // parked schools stay parked so an earlier human call isn't overwritten.
  if (outcome.status === "filled" && record["federal_match_status"] !== "not_in_federal") {
    await supabase
      .from("universities")
      .update({
        federal_match_status: "manual",
        federal_match_name: "Filled in from the school's own website",
        federal_synced_at: new Date().toISOString(),
      })
      .eq("id", universityId);
    await supabase
      .from("ingest_queue")
      .update({ status: "done", last_error: null, updated_at: new Date().toISOString() })
      .eq("university_id", universityId)
      .eq("stage", "federal_data");
  }

  if (failures.length) outcome.errorMessage = failures[0] ?? null;
  return outcome;
}

/**
 * Work through a bounded batch of schools that have no national record. Bounded
 * on purpose: each school costs scraping and AI credits, so a small test batch
 * can be eyed before the rest are run.
 */
export async function webFillBatch(
  supabase: any,
  userId: string,
  options: { limit: number; includeParked?: boolean },
): Promise<{ examined: number; filled: number; results: WebFillOutcome[] }> {
  const statuses = options.includeParked
    ? ["unmatched", "ambiguous", "not_in_federal"]
    : ["unmatched", "ambiguous"];

  const { data, error } = await supabase
    .from("universities")
    .select("id, name, tuition_in_state, undergrad_enrollment")
    .in("federal_match_status", statuses)
    .is("ipeds_unitid", null)
    .is("tuition_in_state", null)
    .order("name")
    .limit(Math.max(1, Math.min(options.limit, 50)));
  if (error) throw new Error(error.message);

  const results: WebFillOutcome[] = [];
  for (const school of (data ?? []) as any[]) {
    try {
      results.push(await webFillSchool(supabase, userId, school.id));
    } catch (failure) {
      results.push({
        universityId: school.id,
        schoolName: String(school.name ?? ""),
        websiteUrl: null,
        pagesRead: 0,
        factsFound: 0,
        factsApplied: 0,
        factsQueued: 0,
        status: "failed",
        errorMessage: failure instanceof Error ? failure.message : "Something went wrong",
      });
    }
  }

  return {
    examined: results.length,
    filled: results.filter((row) => row.status === "filled").length,
    results,
  };
}
