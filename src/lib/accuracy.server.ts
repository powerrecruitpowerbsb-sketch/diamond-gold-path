/**
 * Accuracy sampling.
 *
 * Coverage tells us how much is filled in; it says nothing about whether the
 * filled-in values are still true. This module takes a small random sample of
 * stored coach names, re-reads the exact page each name came from, and records
 * whether the name is still on that page. The result is a score we can watch
 * over time rather than a feeling about quality.
 *
 * It only ever writes to accuracy_checks — sampling never edits program data.
 */

import { coachEvidenceVerdict } from "@/lib/coach-quality";

export type AccuracyVerdict = "match" | "mismatch" | "unproven" | "unreachable";

export type SampleResult = {
  checked: number;
  match: number;
  mismatch: number;
  unproven: number;
  unreachable: number;
};

const COACH_FIELD = "head_coach_name";

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does the page text still name this person? */
function pageNamesPerson(markdown: string, name: string): boolean {
  const haystack = normalizeName(markdown);
  const needle = normalizeName(name);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  // "Ryan Smith" also counts when the page writes "Smith, Ryan".
  const parts = needle.split(" ");
  if (parts.length >= 2) {
    const reversed = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
    if (haystack.includes(reversed)) return true;
  }
  return false;
}

/**
 * Sample stored head coaches and re-check each one against its own source page.
 * Oldest-checked programs come first, so repeated runs sweep the whole set.
 */
export async function sampleCoachAccuracy(supabase: any, limit = 12): Promise<SampleResult> {
  const size = Math.min(Math.max(limit, 1), 40);

  const { data: programs, error } = await supabase
    .from("programs")
    .select(
      "id, sport, head_coach_name, athletic_website, coaching_staff_url, university_id, universities(name, website_url)",
    )
    .not("head_coach_name", "is", null)
    .limit(size * 4);
  if (error) throw new Error(error.message);

  const rows = (programs ?? []) as any[];
  if (!rows.length) {
    return { checked: 0, match: 0, mismatch: 0, unproven: 0, unreachable: 0 };
  }

  // Prefer the ones we have checked least recently.
  const { data: recent } = await supabase
    .from("accuracy_checks")
    .select("program_id, checked_at")
    .eq("field_name", COACH_FIELD)
    .order("checked_at", { ascending: false })
    .limit(500);
  const lastChecked = new Map<string, string>();
  for (const row of (recent ?? []) as any[]) {
    if (row.program_id && !lastChecked.has(row.program_id)) lastChecked.set(row.program_id, row.checked_at);
  }
  rows.sort((a, b) => (lastChecked.get(a.id) ?? "").localeCompare(lastChecked.get(b.id) ?? ""));
  const sample = rows.slice(0, size);

  const { data: sources } = await supabase
    .from("data_field_sources")
    .select("record_id, source_url")
    .eq("table_name", "programs")
    .eq("field_name", COACH_FIELD)
    .in(
      "record_id",
      sample.map((row) => row.id),
    );
  const sourceUrls = new Map<string, string | null>();
  for (const row of (sources ?? []) as any[]) sourceUrls.set(row.record_id, row.source_url ?? null);

  const { scrape } = await import("@/lib/ingest.server");
  const checks: any[] = [];
  const tally: SampleResult = { checked: 0, match: 0, mismatch: 0, unproven: 0, unreachable: 0 };

  for (const program of sample) {
    const stored = String(program.head_coach_name ?? "").trim();
    const sourceUrl = sourceUrls.get(program.id) ?? program.coaching_staff_url ?? null;
    let verdict: AccuracyVerdict = "unproven";
    let detail = "no source page is recorded for this name";
    let fresh: string | null = null;

    const evidence = coachEvidenceVerdict({
      value: stored,
      sourceUrl,
      sport: program.sport,
      athleticWebsite: program.athletic_website,
      coachingStaffUrl: program.coaching_staff_url,
      schoolWebsite: program.universities?.website_url ?? null,
    });

    if (!sourceUrl) {
      verdict = "unproven";
    } else if (!evidence.ok) {
      verdict = "unproven";
      detail = evidence.reason ?? "the source page does not prove this name";
    } else {
      try {
        const markdown = await scrape(sourceUrl);
        if (!markdown || markdown.length < 200) {
          verdict = "unreachable";
          detail = "the source page could not be read this time";
        } else if (pageNamesPerson(markdown, stored)) {
          verdict = "match";
          detail = "the source page still names this coach";
          fresh = stored;
        } else {
          verdict = "mismatch";
          detail = "the source page no longer names this coach";
        }
      } catch (cause) {
        verdict = "unreachable";
        detail = cause instanceof Error ? cause.message : "the source page could not be read";
      }
    }

    tally.checked += 1;
    tally[verdict] += 1;
    checks.push({
      program_id: program.id,
      university_id: program.university_id,
      field_name: COACH_FIELD,
      stored_value: stored,
      fresh_value: fresh,
      verdict,
      detail,
    });
  }

  if (checks.length) {
    const { error: insertError } = await supabase.from("accuracy_checks").insert(checks);
    if (insertError) throw new Error(insertError.message);
  }
  return tally;
}

export type AccuracySummary = {
  windowDays: number;
  total: number;
  match: number;
  mismatch: number;
  unproven: number;
  unreachable: number;
  /** Share of checks where the stored value was confirmed on its own source. */
  score: number | null;
  lastCheckedAt: string | null;
  recentProblems: Array<{
    programId: string | null;
    schoolName: string | null;
    sport: string | null;
    storedValue: string | null;
    verdict: string;
    detail: string | null;
    checkedAt: string;
  }>;
};

/** The current accuracy picture over a rolling window. */
export async function accuracySummary(supabase: any, windowDays = 30): Promise<AccuracySummary> {
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("accuracy_checks")
    .select("program_id, verdict, detail, stored_value, checked_at, programs(sport, universities(name))")
    .gte("checked_at", since)
    .order("checked_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  const count = (verdict: string) => rows.filter((row) => row.verdict === verdict).length;
  const match = count("match");
  const mismatch = count("mismatch");
  const unproven = count("unproven");
  const unreachable = count("unreachable");
  const decided = match + mismatch + unproven;

  return {
    windowDays,
    total: rows.length,
    match,
    mismatch,
    unproven,
    unreachable,
    score: decided ? Math.round((match / decided) * 1000) / 10 : null,
    lastCheckedAt: rows[0]?.checked_at ?? null,
    recentProblems: rows
      .filter((row) => row.verdict === "mismatch" || row.verdict === "unproven")
      .slice(0, 25)
      .map((row) => ({
        programId: row.program_id ?? null,
        schoolName: row.programs?.universities?.name ?? null,
        sport: row.programs?.sport ?? null,
        storedValue: row.stored_value ?? null,
        verdict: row.verdict,
        detail: row.detail ?? null,
        checkedAt: row.checked_at,
      })),
  };
}
