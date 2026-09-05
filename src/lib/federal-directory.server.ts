/**
 * Whole-directory matching pass.
 *
 * The per-school federal search only sees what a name query returns, so a
 * school whose official federal name barely resembles ours never shows up at
 * all. This module downloads the entire federal list of operating schools once
 * and matches the leftovers against it offline, which is both far more thorough
 * and far cheaper than another round of per-school queries.
 */

import { CONSIDER_SCORE, scoreCandidates, verdictFor, type ScoredCandidate, type Verdict } from "@/lib/federal-match";

const SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools";

const DIRECTORY_FIELDS = [
  "id",
  "school.name",
  "school.alias",
  "school.city",
  "school.state",
  "school.main_campus",
  "latest.student.size",
].join(",");

type DirectoryRow = Record<string, unknown>;
type DirectoryEntry = Omit<ScoredCandidate, "score">;

let cached: DirectoryEntry[] | null = null;

function apiKey(): string {
  return process.env["COLLEGE_SCORECARD_API_KEY"] || "DEMO_KEY";
}

function text(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function entryOf(row: DirectoryRow): DirectoryEntry {
  const main = row["school.main_campus"];
  return {
    unitid: Number(row["id"]),
    name: text(row["school.name"]) ?? "",
    alias: text(row["school.alias"]),
    city: text(row["school.city"]),
    state: text(row["school.state"]),
    mainCampus: main === null || main === undefined ? null : Number(main) === 1,
    enrollment: Number(row["latest.student.size"]) || null,
  };
}

async function page(index: number): Promise<{ rows: DirectoryRow[]; total: number }> {
  const params = new URLSearchParams({
    api_key: apiKey(),
    fields: DIRECTORY_FIELDS,
    "school.operating": "1",
    per_page: "100",
    page: String(index),
  });
  const response = await fetch(`${SCORECARD_URL}?${params.toString()}`);
  if (response.status === 429) throw new Error("Federal rate limit reached — try again shortly");
  if (!response.ok) throw new Error(`Federal directory request failed (${response.status})`);
  const body = (await response.json()) as { results?: DirectoryRow[]; metadata?: { total?: number } };
  return { rows: body.results ?? [], total: Number(body.metadata?.total) || 0 };
}

/**
 * The full federal list, straight from the source. 63 sequential pages take
 * about a minute and a half, which is far too slow for a page load — this is
 * only used to refill our own stored copy.
 */
export async function loadDirectory(): Promise<DirectoryEntry[]> {
  if (cached) return cached;
  const first = await page(0);
  const entries = first.rows.map(entryOf);
  const pages = Math.ceil(first.total / 100);

  // Fetched in parallel batches so a refresh takes seconds, not minutes, while
  // staying gentle enough on the federal API to avoid its rate limit.
  const BATCH = 8;
  for (let start = 1; start < pages; start += BATCH) {
    const indexes = [];
    for (let index = start; index < Math.min(start + BATCH, pages); index += 1) indexes.push(index);
    const results = await Promise.all(indexes.map((index) => page(index)));
    for (const result of results) for (const row of result.rows) entries.push(entryOf(row));
  }

  cached = entries.filter((entry) => entry.unitid && entry.name);
  return cached;
}

/**
 * Refill our stored copy of the national list. Everything downstream reads the
 * stored copy, so this is the only place that talks to the federal API.
 */
export async function refreshDirectoryTable(): Promise<{ stored: number }> {
  const entries = await loadDirectory();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  for (let index = 0; index < entries.length; index += 500) {
    const chunk = entries.slice(index, index + 500).map((entry) => ({
      unitid: entry.unitid,
      name: entry.name,
      alias: entry.alias ?? null,
      city: entry.city ?? null,
      state: entry.state ?? null,
      main_campus: entry.mainCampus ?? null,
      enrollment: entry.enrollment ?? null,

      updated_at: now,
    }));
    const { error } = await supabaseAdmin.from("federal_directory").upsert(chunk, { onConflict: "unitid" });
    if (error) throw new Error(error.message);
  }

  return { stored: entries.length };
}

/** Read the stored copy of the national list, page by page past the row cap. */
export async function loadStoredDirectory(supabase: any): Promise<DirectoryEntry[]> {
  const entries: DirectoryEntry[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("federal_directory")
      .select("unitid, name, alias, city, state, main_campus, enrollment")
      .order("unitid")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (const row of rows) {
      entries.push({
        unitid: Number(row.unitid),
        name: String(row.name ?? ""),
        alias: row.alias ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        mainCampus: row.main_campus ?? null,
        enrollment: row.enrollment ?? null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return entries;
}


export type DirectoryMatch = {
  status: Verdict;
  unitid: number | null;
  matchedName: string | null;
  candidates: { unitid: number; name: string; city: string | null; state: string | null }[];
};

/** Score one of our schools against the whole directory, no network calls. */
export function matchAgainstDirectory(
  directory: DirectoryEntry[],
  schoolName: string,
  state: string | null,
  city: string | null,
): DirectoryMatch {
  const scored = scoreCandidates(schoolName, state, directory, city).filter(
    (candidate) => candidate.score >= CONSIDER_SCORE,
  );
  const status = verdictFor(scored);
  const best = scored[0] ?? null;
  return {
    status,
    unitid: status === "confirmed" && best ? best.unitid : null,
    matchedName: status === "confirmed" && best ? best.name : null,
    candidates: scored.slice(0, 8).map(({ unitid, name, city: candidateCity, state: candidateState }) => ({
      unitid,
      name,
      city: candidateCity,
      state: candidateState,
    })),
  };
}

export type SweepOutcome = {
  universityId: string;
  schoolName: string;
  state: string | null;
  status: Verdict;
  matchedName: string | null;
  unitid: number | null;
  applied: boolean;
  errorMessage?: string;
};

/**
 * Run the directory pass over every school still waiting on a federal match.
 * With `apply` off this only reports what it would do, so a sample can be eyed
 * before anything is written.
 */
export async function sweepUnresolvedSchools(
  supabase: any,
  userId: string,
  options: { apply: boolean; limit: number },
): Promise<{ examined: number; matched: number; applied: number; results: SweepOutcome[] }> {
  const { data, error } = await supabase
    .from("universities")
    .select("id, name, state, city")
    .in("federal_match_status", ["unmatched", "ambiguous"])
    .is("ipeds_unitid", null)
    .order("name")
    .limit(Math.max(1, Math.min(options.limit, 400)));
  if (error) throw new Error(error.message);

  const schools = (data ?? []) as { id: string; name: string; state: string | null; city: string | null }[];
  if (!schools.length) return { examined: 0, matched: 0, applied: 0, results: [] };

  const stored = await loadStoredDirectory(supabase);
  const directory = stored.length >= 1000 ? stored : await loadDirectory();

  const { confirmFederalMatch } = await import("@/lib/federal-data.server");
  const results: SweepOutcome[] = [];

  for (const school of schools) {
    const match = matchAgainstDirectory(directory, school.name, school.state, school.city);
    const outcome: SweepOutcome = {
      universityId: school.id,
      schoolName: school.name,
      state: school.state,
      status: match.status,
      matchedName: match.matchedName,
      unitid: match.unitid,
      applied: false,
    };

    if (options.apply && match.status === "confirmed" && match.unitid) {
      try {
        await confirmFederalMatch(supabase, userId, school.id, match.unitid);
        await supabase
          .from("ingest_queue")
          .update({ status: "done", last_error: null, attempts: 0, updated_at: new Date().toISOString() })
          .eq("university_id", school.id)
          .eq("stage", "federal_data");
        outcome.applied = true;
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : "Could not save this match";
        if (/unique constraint/i.test(message) && /ipeds_unitid/i.test(message)) {
          // A campus of a school we already hold: the federal list keeps one
          // record for the whole institution, so this campus has no record of
          // its own. Park it against its parent instead of failing.
          const { data: owner } = await supabase
            .from("universities")
            .select("name")
            .eq("ipeds_unitid", match.unitid)
            .maybeSingle();
          const parentName = (owner as { name?: string } | null)?.name ?? match.matchedName;
          await supabase
            .from("universities")
            .update({
              federal_match_status: "not_in_federal",
              federal_match_name: `Shares a national record with ${parentName}`,
              federal_synced_at: new Date().toISOString(),
            })
            .eq("id", school.id);
          await supabase
            .from("ingest_queue")
            .update({ status: "done", last_error: null, attempts: 0, updated_at: new Date().toISOString() })
            .eq("university_id", school.id)
            .eq("stage", "federal_data");
          outcome.status = "unmatched";
          outcome.matchedName = `Shares a national record with ${parentName}`;
          outcome.applied = true;
        } else {
          outcome.errorMessage = message;
        }
      }
    }
    results.push(outcome);
  }

  return {
    examined: results.length,
    matched: results.filter((r) => r.status === "confirmed").length,
    applied: results.filter((r) => r.applied).length,
    results,
  };
}

export type FederalSuggestion = {
  unitid: number;
  name: string;
  city: string | null;
  state: string | null;
  mainCampus: boolean | null;
  enrollment: number | null;
  score: number;
  confident: boolean;
};

export type SchoolDecision = {
  universityId: string;
  schoolName: string;
  city: string | null;
  state: string | null;
  status: string;
  hasFacts: boolean;
  websiteUrl: string | null;
  suggestions: FederalSuggestion[];
};

export type SuggestionResult = {
  directoryReady: boolean;
  directoryCount: number;
  schools: SchoolDecision[];
};

/**
 * Prepare a shortlist of likely federal records for every school still
 * waiting on a decision. This reads our stored copy of the national list, so
 * the screen never waits on an outside download.
 */
export async function suggestFederalMatches(
  supabase: any,
  options: { limit: number },
): Promise<SuggestionResult> {
  const directory = await loadStoredDirectory(supabase);
  if (directory.length < 1000) {
    return { directoryReady: false, directoryCount: directory.length, schools: [] };
  }

  const { data, error } = await supabase
    .from("universities")
    .select(
      "id, name, state, city, federal_match_status, website_url, est_cost_of_attendance, tuition_in_state, undergrad_enrollment, avg_gpa",
    )
    .in("federal_match_status", ["unmatched", "ambiguous"])
    .is("ipeds_unitid", null)
    .order("name")
    .limit(Math.max(1, Math.min(options.limit, 400)));
  if (error) throw new Error(error.message);

  const schools = (data ?? []) as any[];
  if (!schools.length) {
    return { directoryReady: true, directoryCount: directory.length, schools: [] };
  }

  const decisions = schools.map((school) => {

    const scored = scoreCandidates(school.name, school.state ?? null, directory, school.city ?? null)
      .filter((candidate) => candidate.score >= CONSIDER_SCORE)
      .slice(0, 3);
    const verdict = verdictFor(scored);
    return {
      universityId: school.id,
      schoolName: school.name,
      city: school.city ?? null,
      state: school.state ?? null,
      status: String(school.federal_match_status ?? ""),
      hasFacts: Boolean(
        school.est_cost_of_attendance ||
          school.tuition_in_state ||
          school.undergrad_enrollment ||
          school.avg_gpa,
      ),
      websiteUrl: school.website_url ?? null,
      suggestions: scored.map((candidate, index) => ({
        unitid: candidate.unitid,
        name: candidate.name,
        city: candidate.city,
        state: candidate.state,
        mainCampus: candidate.mainCampus ?? null,
        enrollment: candidate.enrollment ?? null,
        score: candidate.score,
        confident: index === 0 && verdict === "confirmed",
      })),
    };
  });

  return { directoryReady: true, directoryCount: directory.length, schools: decisions };
}

