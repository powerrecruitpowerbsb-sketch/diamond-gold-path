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

/** The full federal list, fetched once per server instance and reused. */
export async function loadDirectory(): Promise<DirectoryEntry[]> {
  if (cached) return cached;
  const first = await page(0);
  const entries = first.rows.map(entryOf);
  const pages = Math.ceil(first.total / 100);
  for (let index = 1; index < pages; index += 1) {
    const next = await page(index);
    for (const row of next.rows) entries.push(entryOf(row));
    if (!next.rows.length) break;
  }
  cached = entries.filter((entry) => entry.unitid && entry.name);
  return cached;
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

  const directory = await loadDirectory();
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
        outcome.errorMessage = failure instanceof Error ? failure.message : "Could not save this match";
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
