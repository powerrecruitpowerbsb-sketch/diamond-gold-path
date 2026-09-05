/**
 * Layer 2 of the collection pipeline: authoritative school facts from the U.S.
 * Department of Education College Scorecard API (IPEDS-backed).
 *
 * Nothing here is guessed by a model — every value is a federal figure, so it
 * carries maximum confidence and gap-fills apply without human review through
 * the same writer a manual approval uses.
 */

import { isEmptyValue, valuesEquivalent } from "@/lib/data-quality";
import { normalizeSchoolName } from "@/lib/seed-import.server";


const SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools";

/** Public dataset landing page, cited as the source for every field we write. */
export const SCORECARD_SOURCE_URL = "https://collegescorecard.ed.gov/data/";

function apiKey(): string {
  // A free api.data.gov key lifts the limit from ~30/hour to 1,000/hour.
  return process.env["COLLEGE_SCORECARD_API_KEY"] || "DEMO_KEY";
}

export function usingDemoKey(): boolean {
  return !process.env["COLLEGE_SCORECARD_API_KEY"];
}

const FIELDS = [
  "id",
  "school.name",
  "school.alias",
  "school.city",
  "school.state",
  "school.zip",
  "school.ownership",
  "school.religious_affiliation",
  "school.locale",
  "school.school_url",
  "school.price_calculator_url",
  "latest.student.size",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.average.overall",
  "latest.admissions.act_scores.midpoint.cumulative",
  "latest.completion.completion_rate_4yr_150nt",
  "latest.completion.completion_rate_less_than_4yr_150nt",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.roomboard.oncampus",
  "latest.cost.attendance.academic_year",
  "latest.cost.avg_net_price.public",
  "latest.cost.avg_net_price.private",
].join(",");

/**
 * The 38 federal degree-field flags (bachelor's level). A 1 means the school
 * awards degrees in that field, which is how we build a real majors catalog
 * without scraping a single course catalog.
 */
export const FEDERAL_MAJOR_FIELDS: Record<string, string> = {
  agriculture: "Agriculture",
  resources: "Natural Resources & Conservation",
  architecture: "Architecture",
  ethnic_cultural_gender: "Ethnic, Cultural & Gender Studies",
  communication: "Communication & Journalism",
  communications_technology: "Communications Technology",
  computer: "Computer & Information Sciences",
  personal_culinary: "Culinary & Personal Services",
  education: "Education",
  engineering: "Engineering",
  engineering_technology: "Engineering Technology",
  language: "Foreign Languages & Linguistics",
  family_consumer_science: "Family & Consumer Sciences",
  legal: "Legal Studies",
  english: "English Language & Literature",
  humanities: "Liberal Arts & Humanities",
  library: "Library Science",
  biological: "Biological & Biomedical Sciences",
  mathematics: "Mathematics & Statistics",
  military: "Military Science",
  multidiscipline: "Multi/Interdisciplinary Studies",
  parks_recreation_fitness: "Parks, Recreation & Fitness (incl. Sport Management)",
  philosophy_religious: "Philosophy & Religious Studies",
  theology_religious_vocation: "Theology & Religious Vocations",
  physical_science: "Physical Sciences",
  science_technology: "Science Technologies",
  psychology: "Psychology",
  security_law_enforcement: "Criminal Justice & Law Enforcement",
  public_administration_social_service: "Public Administration & Social Services",
  social_science: "Social Sciences",
  construction: "Construction Trades",
  mechanic_repair_technology: "Mechanic & Repair Technologies",
  precision_production: "Precision Production",
  transportation: "Transportation",
  visual_performing: "Visual & Performing Arts",
  health: "Health Professions & Nursing",
  business_marketing: "Business, Management & Marketing",
  history: "History",
};

const MAJOR_FIELD_KEYS = Object.keys(FEDERAL_MAJOR_FIELDS).map(
  (key) => `latest.academics.program.bachelors.${key}`,
);

const FIELDS_WITH_MAJORS = [FIELDS, ...MAJOR_FIELD_KEYS].join(",");

export type ScorecardRow = Record<string, unknown>;


export type MatchStatus = "confirmed" | "ambiguous" | "unmatched";

export type MatchResult = {
  status: MatchStatus;
  row: ScorecardRow | null;
  candidates: { unitid: number; name: string; city: string | null; state: string | null }[];
};

/** Religious-affiliation codes in IPEDS; -2/-1/0 mean "not applicable". */
function religiousTradition(code: unknown): { affiliated: boolean; tradition: string | null } {
  const value = Number(code);
  if (!Number.isFinite(value) || value <= 0) return { affiliated: false, tradition: null };
  const known: Record<number, string> = {
    22: "Roman Catholic",
    24: "Baptist",
    27: "Christian (unspecified)",
    30: "Churches of Christ",
    33: "Evangelical Lutheran",
    34: "Episcopal",
    35: "Friends (Quaker)",
    37: "Presbyterian",
    41: "Lutheran (other)",
    45: "Methodist",
    51: "Presbyterian Church (USA)",
    54: "Seventh Day Adventist",
    57: "Church of Christ",
    58: "United Methodist",
    64: "Jewish",
    66: "Mennonite",
    71: "Wesleyan",
    73: "Nazarene",
    74: "Assemblies of God",
    80: "Latter Day Saints",
    81: "Other Protestant",
  };
  return { affiliated: true, tradition: known[value] ?? "Religiously affiliated" };
}

/** IPEDS locale codes: 1x city, 2x suburb, 3x town, 4x rural. */
function campusSetting(code: unknown): string | null {
  const value = Number(code);
  if (!Number.isFinite(value)) return null;
  const bucket = Math.floor(value / 10);
  if (bucket === 1) return "urban";
  if (bucket === 2) return "suburban";
  if (bucket === 3 || bucket === 4) return "rural";
  return null;
}

function sizeBucket(enrollment: unknown): string | null {
  const value = Number(enrollment);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 3000) return "small";
  if (value < 10000) return "medium";
  return "large";
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pct(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // Scorecard reports rates as 0–1.
  return Math.round(parsed * 1000) / 10;
}

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed && trimmed !== "NULL" ? trimmed : null;
}

/** Turn one Scorecard record into our `universities` column values. */
export function mapScorecardRow(row: ScorecardRow): Record<string, unknown> {
  const religion = religiousTradition(row["school.religious_affiliation"]);
  const enrollment = num(row["latest.student.size"]);
  const ownership = Number(row["school.ownership"]);

  const fields: Record<string, unknown> = {
    city: text(row["school.city"]),
    state: text(row["school.state"]),
    public_private: ownership === 1 ? "public" : ownership === 2 || ownership === 3 ? "private" : null,
    undergrad_enrollment: enrollment,
    school_size_bucket: sizeBucket(enrollment),
    campus_setting: campusSetting(row["school.locale"]),
    religious_affiliation: religion.affiliated,
    religious_tradition: religion.tradition,
    website_url: normalizeUrl(row["school.school_url"]),
    financial_aid_url: normalizeUrl(row["school.price_calculator_url"]),
    acceptance_rate: pct(row["latest.admissions.admission_rate.overall"]),
    avg_sat: num(row["latest.admissions.sat_scores.average.overall"]),
    avg_act: num(row["latest.admissions.act_scores.midpoint.cumulative"]),
    graduation_rate:
      pct(row["latest.completion.completion_rate_4yr_150nt"]) ??
      pct(row["latest.completion.completion_rate_less_than_4yr_150nt"]),
    tuition_in_state: num(row["latest.cost.tuition.in_state"]),
    tuition_out_state: num(row["latest.cost.tuition.out_of_state"]),
    room_board: num(row["latest.cost.roomboard.oncampus"]),
    est_cost_of_attendance: num(row["latest.cost.attendance.academic_year"]),
    est_net_price:
      num(row["latest.cost.avg_net_price.public"]) ?? num(row["latest.cost.avg_net_price.private"]),
    tuition_source_url: SCORECARD_SOURCE_URL,
  };

  // religious_affiliation is NOT NULL with a default; only send it when true so
  // an unaffiliated school doesn't generate a pointless "false" proposal.
  if (!religion.affiliated) delete fields["religious_affiliation"];

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) delete fields[key];
  }
  return fields;
}

function normalizeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * One federal API call. The service returns intermittent 5xx errors under load,
 * which would otherwise fail a school that is perfectly matchable, so transient
 * failures are retried with a short backoff.
 */
async function scorecardFetch(params: URLSearchParams): Promise<ScorecardRow[]> {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    let response: Response;
    try {
      response = await fetch(`${SCORECARD_URL}?${params.toString()}`);
    } catch (failure) {
      lastError = (failure as Error).message;
      continue;
    }
    if (response.ok) {
      const payload = (await response.json()) as { results?: ScorecardRow[] };
      return Array.isArray(payload.results) ? payload.results : [];
    }
    const body = await response.text();
    if (response.status === 429) {
      throw new Error(
        "The federal data API is rate limiting us. Add a free api.data.gov key to raise the limit.",
      );
    }
    lastError = `[${response.status}] ${body.slice(0, 200)}`;
    if (response.status < 500) break;
  }
  throw new Error(`Federal data request failed ${lastError}`);
}

/** Ask the federal API for candidate records for one school name. */
export async function searchScorecard(name: string, state: string | null): Promise<ScorecardRow[]> {
  const params = new URLSearchParams({
    api_key: apiKey(),
    fields: FIELDS_WITH_MAJORS,
    per_page: "20",
    "school.operating": "1",
  });
  // A comma in the name is read by the federal API as a list separator and
  // makes the whole request fail, so "University of California, Berkeley"
  // is searched as "University of California Berkeley".
  params.set("school.name", name.replace(/,/g, " ").replace(/\s+/g, " ").trim());

  if (state) params.set("school.state", state);

  return scorecardFetch(params);
}


/** Same-name-same-state is a confirmed match; anything looser needs a human. */
export function matchScorecard(
  schoolName: string,
  state: string | null,
  rows: ScorecardRow[],
): MatchResult {
  const candidates = rows.map((row) => ({
    unitid: Number(row["id"]),
    name: text(row["school.name"]) ?? "",
    city: text(row["school.city"]),
    state: text(row["school.state"]),
    row,
  }));

  if (!candidates.length) return { status: "unmatched", row: null, candidates: [] };

  const key = normalizeSchoolName(schoolName);
  const exact = candidates.filter((c) => {
    if (normalizeSchoolName(c.name) !== key) return false;
    return !state || (c.state ?? "").toUpperCase() === state.toUpperCase();
  });

  if (exact.length === 1) {
    return { status: "confirmed", row: exact[0]!.row, candidates: strip(exact) };
  }
  if (exact.length > 1) {
    return { status: "ambiguous", row: null, candidates: strip(exact) };
  }

  const inState = state
    ? candidates.filter((c) => (c.state ?? "").toUpperCase() === state.toUpperCase())
    : candidates;
  const pool = inState.length ? inState : candidates;
  if (pool.length === 1) {
    // One operating school in the right state whose name merely differs in
    // wording ("Univ of X" vs "University of X") — still needs eyes.
    return { status: "ambiguous", row: null, candidates: strip(pool) };
  }
  return { status: "ambiguous", row: null, candidates: strip(pool.slice(0, 8)) };
}

function strip(list: { unitid: number; name: string; city: string | null; state: string | null }[]) {
  return list.map(({ unitid, name, city, state }) => ({ unitid, name, city, state }));
}

export type FederalSyncResult = {
  universityId: string;
  schoolName: string;
  status: MatchStatus;
  unitid: number | null;
  matchedName: string | null;
  fieldsApplied: number;
  fieldsQueued: number;
  majorsLinked: number;
  candidates: MatchResult["candidates"];
};

/**
 * Build the majors catalog from the federal degree-field flags and link the
 * school to every field it awards bachelor's degrees in. Idempotent: re-running
 * adds new fields and leaves existing links alone.
 */
export async function syncFederalMajors(
  supabase: any,
  universityId: string,
  row: ScorecardRow,
): Promise<number> {
  const names: string[] = [];
  for (const [key, label] of Object.entries(FEDERAL_MAJOR_FIELDS)) {
    if (Number(row[`latest.academics.program.bachelors.${key}`]) === 1) names.push(label);
  }
  if (!names.length) return 0;

  const { data: existing, error: readError } = await supabase
    .from("majors")
    .select("id, name")
    .in("name", names);
  if (readError) throw new Error(readError.message);

  const byName = new Map<string, string>(
    ((existing ?? []) as { id: string; name: string }[]).map((m) => [m.name, m.id]),
  );
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length) {
    const { data: created, error: createError } = await supabase
      .from("majors")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (createError) throw new Error(createError.message);
    for (const m of (created ?? []) as { id: string; name: string }[]) byName.set(m.name, m.id);
  }

  const links = names
    .map((name) => byName.get(name))
    .filter((id): id is string => Boolean(id))
    .map((major_id) => ({ university_id: universityId, major_id }));

  const { error: linkError } = await supabase
    .from("university_majors")
    .upsert(links, { onConflict: "university_id,major_id", ignoreDuplicates: true });
  if (linkError) throw new Error(linkError.message);
  return links.length;
}


/**
 * Match one school to its federal record and write the facts. Gap-fills land
 * immediately; anything that would overwrite an existing value goes to the
 * review queue so a human decides.
 */
export async function syncUniversityFromFederal(
  supabase: any,
  userId: string,
  universityId: string,
): Promise<FederalSyncResult> {
  const { data: school, error } = await supabase
    .from("universities")
    .select("*")
    .eq("id", universityId)
    .single();
  if (error) throw new Error(error.message);

  const record = school as Record<string, unknown>;
  const schoolName = String(record["name"] ?? "");
  const state = record["state"] ? String(record["state"]) : null;

  let match: MatchResult;
  const knownUnitid = Number(record["ipeds_unitid"]);
  if (Number.isFinite(knownUnitid) && knownUnitid > 0) {
    // Already matched once — refresh straight off the unit id.
    const rows = await searchScorecardById(knownUnitid);
    match = rows.length
      ? { status: "confirmed", row: rows[0]!, candidates: [] }
      : { status: "unmatched", row: null, candidates: [] };
  } else {
    match = matchScorecard(schoolName, state, await searchScorecard(schoolName, state));
  }

  if (match.status !== "confirmed" || !match.row) {
    await supabase
      .from("universities")
      .update({ federal_match_status: match.status, federal_synced_at: new Date().toISOString() })
      .eq("id", universityId);
    return {
      universityId,
      schoolName,
      status: match.status,
      unitid: null,
      matchedName: null,
      fieldsApplied: 0,
      majorsLinked: 0,

      fieldsQueued: 0,
      candidates: match.candidates,
    };
  }

  const unitid = Number(match.row["id"]);
  const matchedName = text(match.row["school.name"]);
  const mapped = mapScorecardRow(match.row);

  const { allowedFields, approvePending } = await import("@/lib/review.server");
  const writable = new Set(allowedFields("universities"));

  const proposals: any[] = [];
  for (const [field, value] of Object.entries(mapped)) {
    if (!writable.has(field)) continue;
    const current = record[field];
    if (sameValue(field, current, value)) continue;
    const gapFill = isEmptyValue(field, current);
    proposals.push({
      table_name: "universities",
      record_id: universityId,
      field_name: field,
      proposed_value: { [field]: value },
      source_url: SCORECARD_SOURCE_URL,
      source_type: "official",
      ai_confidence: 1,
      decided_via: gapFill ? "auto" : "human",
      _gapFill: gapFill,
    });
  }


  let fieldsApplied = 0;
  let fieldsQueued = 0;

  if (proposals.length) {
    // A field can only have one open proposal at a time; the freshest federal
    // read replaces whatever an earlier run left waiting.
    const { error: clearError } = await supabase
      .from("pending_data_changes")
      .delete()
      .eq("table_name", "universities")
      .eq("record_id", universityId)
      .eq("status", "pending")
      .in(
        "field_name",
        proposals.map((p) => p.field_name),
      );
    if (clearError) throw new Error(clearError.message);

    const { data: inserted, error: insertError } = await supabase
      .from("pending_data_changes")
      .insert(proposals.map(({ _gapFill: _ignored, ...rest }) => rest))
      .select(
        "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
      );
    if (insertError) throw new Error(insertError.message);

    const autoFields = new Set(proposals.filter((p) => p._gapFill).map((p) => p.field_name));
    for (const row of (inserted ?? []) as any[]) {
      if (!autoFields.has(row.field_name)) {
        fieldsQueued += 1;
        continue;
      }
      try {
        await approvePending(supabase, userId, row);
        fieldsApplied += 1;
      } catch (failure) {
        console.error(`Federal auto-apply failed for ${row.field_name}: ${(failure as Error).message}`);
        fieldsQueued += 1;
      }
    }
  }

  // Degree fields are federal facts too, so they land directly rather than
  // waiting in the review queue.
  let majorsLinked = 0;
  try {
    majorsLinked = await syncFederalMajors(supabase, universityId, match.row);
  } catch (failure) {
    console.error(`Majors sync failed for ${schoolName}: ${(failure as Error).message}`);
  }

  const { error: stampError } = await supabase
    .from("universities")
    .update({
      ipeds_unitid: unitid,
      federal_match_status: "confirmed",
      federal_match_name: matchedName,
      federal_synced_at: new Date().toISOString(),
    })
    .eq("id", universityId);
  if (stampError) throw new Error(`Could not stamp the federal match: ${stampError.message}`);

  return {
    universityId,
    schoolName,
    status: "confirmed",
    unitid,
    matchedName,
    fieldsApplied,
    fieldsQueued,
    majorsLinked,
    candidates: [],
  };

}

async function searchScorecardById(unitid: number): Promise<ScorecardRow[]> {
  const params = new URLSearchParams({ api_key: apiKey(), fields: FIELDS_WITH_MAJORS, id: String(unitid) });
  return scorecardFetch(params);
}


function sameValue(field: string, current: unknown, next: unknown): boolean {
  return valuesEquivalent(field, current, next);
}


/** Pin a school to a federal record a human picked, then pull its facts. */
export async function confirmFederalMatch(
  supabase: any,
  userId: string,
  universityId: string,
  unitid: number,
): Promise<FederalSyncResult> {
  const { error } = await supabase
    .from("universities")
    .update({ ipeds_unitid: unitid, federal_match_status: "confirmed" })
    .eq("id", universityId);
  if (error) throw new Error(error.message);
  return syncUniversityFromFederal(supabase, userId, universityId);
}
