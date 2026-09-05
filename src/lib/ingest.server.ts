/**
 * Server-only data ingestion pipeline: scrape a program's own source pages with
 * Firecrawl, extract structured fields with the Lovable AI Gateway, and file
 * everything into the review queue. Live records are never written here.
 */

import { PROGRAM_FIELD_NAMES, UNIVERSITY_FIELD_NAMES } from "@/lib/admin-schemas";
import {
  canonicalConference,
  contradictsGoverningBody,
  isEmptyValue,
  isUnknownConference,
  normalizePosition,
  plausibleSeasonYear,
  valuesEquivalent,
} from "@/lib/data-quality";


const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

export type UrlResult = {
  url: string;
  purpose: string;
  status: "scraped" | "scrape_failed" | "extract_failed" | "empty";
  detail?: string;
};

export type IngestOutcome = {
  runId: string | null;
  programLabel: string;
  status: "success" | "partial" | "failed";
  urlResults: UrlResult[];
  proposalsCreated: number;
  autoApplied: number;
  snapshotWritten: boolean;
  rosterPlayers: number;
  rosterWarning: string | null;
  errorMessage: string | null;
};

/** Fields the AI is allowed to propose, per table. */
export const UNIVERSITY_EXTRACTABLE = [
  "avg_gpa",
  "avg_sat",
  "avg_act",
  "acceptance_rate",
  "graduation_rate",
  "test_optional",
  "student_faculty_ratio",
  "undergrad_enrollment",
  "tuition_in_state",
  "tuition_out_state",
  "room_board",
  "est_cost_of_attendance",
  "est_net_price",
  "campus_setting",
  "public_private",
  "city",
  "state",
] as const;

const PROGRAM_EXTRACTABLE = [
  "head_coach_name",
  "recruiting_coordinator_name",
  "division",
  "conference",
  "governing_body",
  "scholarships_available",
] as const;

const NUMERIC_FIELDS = new Set([
  "avg_gpa",
  "avg_sat",
  "avg_act",
  "acceptance_rate",
  "graduation_rate",
  "undergrad_enrollment",
  "tuition_in_state",
  "tuition_out_state",
  "room_board",
  "est_cost_of_attendance",
  "est_net_price",
]);

const BOOLEAN_FIELDS = new Set(["test_optional", "scholarships_available"]);

const ENUM_FIELDS: Record<string, readonly string[]> = {
  campus_setting: ["urban", "suburban", "rural"],
  public_private: ["public", "private"],
  governing_body: ["NCAA", "NAIA", "NJCAA", "CCCAA", "NWAC"],
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Scrape a single page to markdown. Throws with a readable reason on failure. */
export async function scrape(url: string): Promise<string> {
  const lovableKey = requireEnv("LOVABLE_API_KEY");
  // Power's own Firecrawl account — scrape credits bill to that plan, not the
  // Lovable-managed allowance. Auth still rides the connector gateway.
  const firecrawlKey = requireEnv("FIRECRAWL_API_KEY_1");

  const response = await fetch(`${GATEWAY_FIRECRAWL}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Firecrawl scrape failed [${response.status}] ${url}: ${body}`);
    if (response.status === 402 || /credit limit reached|not enough credits/i.test(body)) {
      throw new Error(
        "the Firecrawl scraping account is out of credits — top it up before running more pulls",
      );
    }
    throw new Error(`scrape returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as any;
  const markdown: string | undefined = payload?.markdown ?? payload?.data?.markdown;
  if (!markdown || !markdown.trim()) throw new Error("page returned no readable content");
  // Roster tables sit at the BOTTOM of sidearm-style pages, so keep the window
  // wide enough that a 40-player roster is never silently truncated away.
  return markdown.slice(0, 90000);
}

/** Call the AI Gateway and parse a strict-JSON object out of the reply. */
async function extractJson(systemPrompt: string, userContent: string): Promise<any> {
  const lovableKey = requireEnv("LOVABLE_API_KEY");
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`AI Gateway failed [${response.status}]: ${body}`);
    if (response.status === 429) throw new Error("AI rate limit reached — try again shortly");
    if (response.status === 402) throw new Error("AI credits exhausted for this workspace");
    throw new Error(`AI extraction returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as any;
  const text: string = payload?.choices?.[0]?.message?.content ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI returned no JSON object");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("AI returned malformed JSON");
  }
}

const STRICT_RULES = [
  "Return ONLY a single JSON object. No prose, no markdown fences.",
  "Use exactly the field names given. Never invent field names.",
  "OMIT any field the page does not state clearly. A missing field is correct; a guessed field is a failure.",
  "Numbers must be plain numbers with no currency symbols, commas, or percent signs.",
  "Percentages (acceptance_rate, graduation_rate) are 0-100 numbers.",
  'For each field you return, also return a confidence 0-1 in a "confidence" object keyed by the same field name: 0.9+ when the page states it outright, 0.6-0.8 when it needs light interpretation.',
].join(" ");

export async function extractUniversityFields(markdown: string) {
  const prompt = [
    "You extract college admissions and cost data from an official university web page.",
    STRICT_RULES,
    `Allowed fields: ${UNIVERSITY_EXTRACTABLE.join(", ")}.`,
    "campus_setting must be one of urban, suburban, rural. public_private must be public or private.",
    "test_optional is a boolean. student_faculty_ratio is a string like '12:1'.",
    'Shape: { "fields": { ... }, "confidence": { ... } }',
  ].join("\n");
  return extractJson(prompt, markdown);
}

async function extractProgramFields(markdown: string) {
  const prompt = [
    "You extract college athletics program data from an official athletics web page.",
    STRICT_RULES,
    `Allowed fields: ${PROGRAM_EXTRACTABLE.join(", ")}.`,
    "governing_body must be NCAA, NAIA, NJCAA, CCCAA or NWAC. division is a short string like 'D1', 'D2', 'D3' or 'NAIA' — leave it out for bodies that don't use divisions.",
    "head_coach_name is the head coach of THIS sport only. recruiting_coordinator_name is whoever is titled recruiting coordinator.",
    'Shape: { "fields": { ... }, "confidence": { ... } }',
  ].join("\n");
  return extractJson(prompt, markdown);
}

export type ExtractedPlayer = {
  name: string;
  position?: string | null;
  class_year?: string | null;
  bats?: string | null;
  throws?: string | null;
  hometown?: string | null;
  home_state?: string | null;
  is_transfer?: boolean;
  is_juco_transfer?: boolean;
};

const ROSTER_PROMPT = [
  "You extract a college baseball/softball roster from an official roster page.",
  "Return ONLY a single JSON object. No prose, no markdown fences.",
  'Shape: { "season_year": number|null, "players": [ { "name", "position", "class_year", "bats", "throws", "hometown", "home_state", "is_transfer", "is_juco_transfer" } ] }',
  "Include EVERY player listed in the text you are given — a full roster is usually 30-45 players. Do not stop early, do not summarize, do not sample.",
  "name is required; omit any other key you cannot read for that player.",
  "position: copy the page's own wording (e.g. 'INF', 'LF', 'RHP', 'Catcher'). Never guess a position the page doesn't state — omit it instead. Do NOT use UTIL as a catch-all.",
  "class_year must be one of FR, SO, JR, SR, GR (map Freshman/Redshirt Freshman to FR, Sophomore SO, Junior JR, Senior SR, Graduate GR).",
  "bats is R, L or S. throws is R or L. If the page shows 'R/R' that means bats R, throws R.",
  "home_state is the 2-letter US state abbreviation when the hometown is in the US.",
  "is_juco_transfer is true only when a junior/community college is named as a previous school. is_transfer is true for any named previous four-year school.",
  "season_year is the roster's SEASON heading (e.g. 2026 or the later year of '2025-26'), never a jersey number, a stat, a birth year or an archive year. Return null unless the page clearly states the season.",

].join("\n");

/** Split long roster markdown so a single reply size limit can't truncate the roster. */
function chunkMarkdown(markdown: string, size = 14000): string[] {
  if (markdown.length <= size) return [markdown];
  const chunks: string[] = [];
  const lines = markdown.split("\n");
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > size && current.trim()) {
      chunks.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

/**
 * Rough count of "looks like a roster entry" lines, used only to tell whether the
 * AI dropped players that the page clearly listed.
 */
function countLikelyPlayerRows(markdown: string): number {
  const matches = markdown.match(/^\s*\|?\s*#?\s*\d{1,2}\s*[|\t]/gm);
  return matches ? matches.length : 0;
}

async function extractRoster(markdown: string): Promise<{
  players: ExtractedPlayer[];
  season_year: number | null;
  diagnostics: { characters: number; chunks: number; likelyRows: number };
}> {
  const chunks = chunkMarkdown(markdown);
  const byName = new Map<string, ExtractedPlayer>();
  let seasonYear: number | null = null;
  let lastError: Error | null = null;

  for (const chunk of chunks) {
    try {
      const parsed = await extractJson(ROSTER_PROMPT, chunk);
      if (seasonYear === null) {
        // Jersey numbers, career stats and archive years get mistaken for the
        // season; only a year inside the live recruiting window is believable.
        seasonYear = plausibleSeasonYear(parsed?.season_year);
      }
      const players = Array.isArray(parsed?.players) ? parsed.players : [];
      for (const player of players) {
        if (!player || typeof player.name !== "string" || !player.name.trim()) continue;
        const key = player.name.trim().toLowerCase();
        if (byName.has(key)) continue;
        byName.set(key, {
          ...(player as ExtractedPlayer),
          // Unreadable positions stay blank rather than piling into UTIL.
          position: normalizePosition(player.position),
        });
      }
    } catch (failure) {
      lastError = failure as Error;
    }
  }


  if (!byName.size && lastError) throw lastError;

  const diagnostics = {
    characters: markdown.length,
    chunks: chunks.length,
    likelyRows: countLikelyPlayerRows(markdown),
  };
  console.log(
    `Roster extraction: ${byName.size} players from ${diagnostics.characters} chars in ${diagnostics.chunks} chunk(s); ~${diagnostics.likelyRows} roster-looking rows on the page`,
  );

  return { players: [...byName.values()], season_year: seasonYear, diagnostics };
}


/** Coerce an AI value into something the column will accept, or null to skip. */
function coerce(field: string, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return null;
  if (NUMERIC_FIELDS.has(field)) {
    const num = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(num) ? num : null;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof raw === "boolean") return raw;
    const text = String(raw).toLowerCase();
    if (["true", "yes"].includes(text)) return true;
    if (["false", "no"].includes(text)) return false;
    return null;
  }
  const options = ENUM_FIELDS[field];
  if (options) {
    const match = options.find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
    return match ?? null;
  }
  // Conferences arrive as "SEC", "South East Conference", "NWAC"... — store one wording.
  if (field === "conference") return canonicalConference(raw) || null;
  return String(raw).trim();
}

function differs(field: string, current: unknown, proposed: unknown): boolean {
  return !valuesEquivalent(field, current, proposed);
}


export type ProposalRow = {
  table_name: string;
  record_id: string;
  field_name: string | null;
  proposed_value: any;
  source_url: string;
  source_type: "official";
  ai_confidence: number | null;
  /** True when the live field is empty — filling a gap, not overwriting a value. */
  gap_fill?: boolean;
};

/** Trust policy, in one place so it can be tuned without hunting through the pipeline. */
export const INGEST_POLICY = {
  /** Gap-fills from an official source at or above this confidence apply without review. */
  autoApplyConfidence: 0.9,
  /** A four-year roster smaller than this almost certainly means an incomplete scrape. */
  minCredibleRoster: 15,
};

export function buildFieldProposals(
  table: "universities" | "programs",
  recordId: string,
  liveRecord: Record<string, unknown>,
  allowed: readonly string[],
  extracted: any,
  sourceUrl: string,
): ProposalRow[] {
  const fields = (extracted?.fields ?? extracted) as Record<string, unknown>;
  const confidence = (extracted?.confidence ?? {}) as Record<string, unknown>;
  if (!fields || typeof fields !== "object") return [];

  const writable = new Set(
    table === "universities" ? UNIVERSITY_FIELD_NAMES : PROGRAM_FIELD_NAMES,
  );
  const rows: ProposalRow[] = [];

  for (const [key, rawValue] of Object.entries(fields)) {
    if (!allowed.includes(key as any) || !writable.has(key)) continue;
    const value = coerce(key, rawValue);
    if (value === null) continue;
    const current = liveRecord[key];
    if (!differs(key, current, value)) continue;
    const score = Number(confidence[key]);
    let scored = Number.isFinite(score) ? Math.min(Math.max(score, 0), 1) : null;

    // A page that disagrees with the directory about the division or governing
    // body may not even belong to this school — that always gets human eyes.
    const contradiction =
      table === "programs" && contradictsGoverningBody(key, liveRecord["governing_body"], value);
    // An unfamiliar conference wording is worth a glance rather than a silent write.
    const unknownConference = key === "conference" && isUnknownConference(value);
    if (contradiction || unknownConference) scored = Math.min(scored ?? 0.5, 0.5);

    rows.push({
      table_name: table,
      record_id: recordId,
      field_name: key,
      proposed_value: { [key]: value } as any,
      source_url: sourceUrl,
      source_type: "official",
      ai_confidence: scored,
      gap_fill: isEmptyValue(key, current) && !contradiction && !unknownConference,
    });
  }

  return rows;
}

/**
 * Collapse proposals that describe the same field of the same record — two source
 * pages routinely state the same fact. Highest confidence wins; a genuine
 * disagreement is kept as one item that carries both candidate values.
 */
export function mergeFieldProposals(rows: ProposalRow[]): ProposalRow[] {
  const merged = new Map<string, ProposalRow>();

  for (const row of rows) {
    if (!row.field_name) continue;
    const key = `${row.table_name}:${row.record_id}:${row.field_name}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
      continue;
    }

    const field = row.field_name;
    const existingValue = existing.proposed_value?.[field];
    const incomingValue = row.proposed_value?.[field];
    const sameValue = String(existingValue).trim().toLowerCase() === String(incomingValue).trim().toLowerCase();

    const winner =
      (row.ai_confidence ?? -1) > (existing.ai_confidence ?? -1) ? { ...row } : { ...existing };

    if (sameValue) {
      // Two pages agreeing is corroboration, not a second review item.
      winner.ai_confidence = Math.max(existing.ai_confidence ?? 0, row.ai_confidence ?? 0);
    } else {
      const alternates = [
        ...((existing.proposed_value?.["_alternates"] as any[] | undefined) ?? []),
        { value: existingValue, source_url: existing.source_url, confidence: existing.ai_confidence },
        { value: incomingValue, source_url: row.source_url, confidence: row.ai_confidence },
      ].filter(
        (entry, index, all) =>
          all.findIndex((other) => String(other.value) === String(entry.value)) === index,
      );
      winner.proposed_value = { ...winner.proposed_value, _alternates: alternates };
      // A conflict always gets human eyes, whatever the model claimed.
      winner.gap_fill = false;
      winner.ai_confidence = Math.min(winner.ai_confidence ?? 0.5, 0.6);
    }

    merged.set(key, winner);
  }

  return [...merged.values()];
}

/** Gap-fill + official + high confidence = trusted enough to skip the queue. */
export function isAutoApplicable(row: ProposalRow): boolean {
  return Boolean(
    row.field_name &&
      row.gap_fill &&
      row.source_type === "official" &&
      (row.ai_confidence ?? 0) >= INGEST_POLICY.autoApplyConfidence,
  );
}


const POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL", "RHP", "LHP", "TWO_WAY"];
const CLASS_YEARS = ["FR", "SO", "JR", "SR", "GR"];

export function summarizeRoster(players: ExtractedPlayer[]) {
  const positionCounts: Record<string, number> = {};
  const classYearCounts: Record<string, number> = {};
  let transfers = 0;
  let jucoTransfers = 0;

  for (const player of players) {
    const position = String(player.position ?? "").toUpperCase();
    if (POSITIONS.includes(position)) {
      positionCounts[position] = (positionCounts[position] ?? 0) + 1;
    } else {
      positionCounts["UNKNOWN"] = (positionCounts["UNKNOWN"] ?? 0) + 1;
    }
    const classYear = String(player.class_year ?? "").toUpperCase();
    if (CLASS_YEARS.includes(classYear)) {
      classYearCounts[classYear] = (classYearCounts[classYear] ?? 0) + 1;
    } else {
      classYearCounts["UNKNOWN"] = (classYearCounts["UNKNOWN"] ?? 0) + 1;
    }
    if (player.is_juco_transfer) jucoTransfers += 1;
    if (player.is_transfer || player.is_juco_transfer) transfers += 1;
  }

  return { positionCounts, classYearCounts, transfers, jucoTransfers };
}

/** Is a pull already in flight for this program? */
export async function findActiveRun(supabase: any, programId: string) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("ingestion_runs")
    .select("id, started_at")
    .eq("program_id", programId)
    .eq("status", "running")
    .gt("started_at", cutoff)
    .limit(1);
  return (data ?? [])[0] ?? null;
}

/** Run the full pipeline for one program. Never writes live school/program data. */
export async function ingestProgram(
  supabase: any,
  userId: string,
  programId: string,
): Promise<IngestOutcome> {
  const { data: program, error: programError } = await supabase
    .from("programs")
    .select(
      "*, universities(id, name, state, city, website_url, admissions_url, avg_gpa, avg_sat, avg_act, acceptance_rate, graduation_rate, test_optional, student_faculty_ratio, undergrad_enrollment, tuition_in_state, tuition_out_state, room_board, est_cost_of_attendance, est_net_price, campus_setting, public_private)",
    )
    .eq("id", programId)
    .single();
  if (programError) throw new Error(programError.message);

  const university = program.universities as Record<string, any>;
  const programLabel = `${university?.["name"] ?? "Program"} — ${String(program["sport"] ?? "")}`;

  const targets: { url: string; purpose: string; kind: "university" | "program" | "roster" }[] = [];
  const push = (url: unknown, purpose: string, kind: "university" | "program" | "roster") => {
    const value = typeof url === "string" ? url.trim() : "";
    if (value) targets.push({ url: value, purpose, kind });
  };
  push(university?.["website_url"], "School website", "university");
  push(university?.["admissions_url"], "Admissions page", "university");
  push(program["athletic_website"], "Athletics site", "program");
  push(program["coaching_staff_url"], "Coaching staff", "program");
  push(program["roster_url"], "Roster page", "roster");

  if (!targets.length) {
    return {
      runId: null,
      programLabel,
      status: "failed",
      urlResults: [],
      proposalsCreated: 0,
      autoApplied: 0,
      snapshotWritten: false,
      rosterPlayers: 0,
      rosterWarning: null,
      errorMessage:
        "No source URLs on this program yet. Add a school website, admissions, athletics or roster URL first.",
    };
  }

  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ program_id: programId, started_by: userId, status: "running" })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);
  const runId = run.id as string;

  const urlResults: UrlResult[] = [];
  const proposals: ProposalRow[] = [];
  let snapshotWritten = false;
  let rosterPlayers = 0;
  let rosterWarning: string | null = null;


  for (const target of targets) {
    let markdown: string;
    try {
      markdown = await scrape(target.url);
    } catch (failure) {
      urlResults.push({
        url: target.url,
        purpose: target.purpose,
        status: "scrape_failed",
        detail: (failure as Error).message,
      });
      continue;
    }

    try {
      if (target.kind === "university") {
        const extracted = await extractUniversityFields(markdown);
        const rows = buildFieldProposals(
          "universities",
          university["id"],
          university,
          UNIVERSITY_EXTRACTABLE,
          extracted,
          target.url,
        );
        proposals.push(...rows);
        urlResults.push({
          url: target.url,
          purpose: target.purpose,
          status: rows.length ? "scraped" : "empty",
          detail: rows.length ? `${rows.length} field(s) proposed` : "nothing new found on this page",
        });
      } else if (target.kind === "program") {
        const extracted = await extractProgramFields(markdown);
        const rows = buildFieldProposals(
          "programs",
          programId,
          program,
          PROGRAM_EXTRACTABLE,
          extracted,
          target.url,
        );
        proposals.push(...rows);
        urlResults.push({
          url: target.url,
          purpose: target.purpose,
          status: rows.length ? "scraped" : "empty",
          detail: rows.length ? `${rows.length} field(s) proposed` : "nothing new found on this page",
        });
      } else {
        const { players, season_year, diagnostics } = await extractRoster(markdown);
        rosterPlayers = players.length;
        if (!players.length) {
          urlResults.push({
            url: target.url,
            purpose: target.purpose,
            status: "empty",
            detail: `no players could be read from this page (${diagnostics.characters} characters scraped)`,
          });
          continue;
        }

        const summary = summarizeRoster(players);
        const seasonYear = season_year ?? new Date().getFullYear();
        const suspicious = players.length < INGEST_POLICY.minCredibleRoster;
        if (suspicious) {
          rosterWarning = `Only ${players.length} players were read from the roster page — a full four-year roster is usually 30+. This looks like an incomplete scrape, so it is flagged for scrutiny instead of being trusted.`;
        }

        const { error: snapshotError } = await supabase.from("roster_snapshots").insert({
          program_id: programId,
          season_year: seasonYear,
          pulled_at: new Date().toISOString(),
          position_counts: summary.positionCounts,
          class_year_counts: summary.classYearCounts,
          transfer_count: summary.transfers,
          juco_transfer_count: summary.jucoTransfers,
          source_url: target.url,
        });
        if (snapshotError) throw new Error(`snapshot write failed: ${snapshotError.message}`);
        snapshotWritten = true;

        // One whole-roster proposal per pull, reviewed as a single item.
        proposals.push({
          table_name: "roster_players",
          record_id: programId,
          field_name: null,
          proposed_value: {
            program_id: programId,
            season_year: seasonYear,
            players,
            incomplete_scrape: suspicious,
            scrape_diagnostics: diagnostics,
          } as any,
          source_url: target.url,
          source_type: "official",
          ai_confidence: suspicious ? 0.3 : 0.7,
        });

        urlResults.push({
          url: target.url,
          purpose: target.purpose,
          status: "scraped",
          detail: suspicious
            ? `only ${players.length} players read from ${diagnostics.characters} characters — likely incomplete; snapshot saved for ${seasonYear}`
            : `${players.length} players read; snapshot saved for ${seasonYear}`,
        });
      }
    } catch (failure) {
      urlResults.push({
        url: target.url,
        purpose: target.purpose,
        status: "extract_failed",
        detail: (failure as Error).message,
      });
    }
  }

  // --- Dedupe, then split by trust tier -------------------------------------
  const fieldProposals = mergeFieldProposals(proposals.filter((row) => row.field_name));
  const recordProposals = proposals.filter((row) => !row.field_name);

  // Never queue the same field twice: an untouched pending item already covers it.
  const recordIds = [...new Set(proposals.map((row) => row.record_id))];
  const { data: existingPending } = await supabase
    .from("pending_data_changes")
    .select("id, table_name, record_id, field_name")
    .eq("status", "pending")
    .in("record_id", recordIds.length ? recordIds : ["00000000-0000-0000-0000-000000000000"]);

  const alreadyPending = new Set(
    ((existingPending ?? []) as any[])
      .filter((row) => row.field_name)
      .map((row) => `${row.table_name}:${row.record_id}:${row.field_name}`),
  );

  const freshFieldProposals = fieldProposals.filter(
    (row) => !alreadyPending.has(`${row.table_name}:${row.record_id}:${row.field_name}`),
  );

  // A newer whole-record proposal supersedes an unreviewed older one.
  const supersede = ((existingPending ?? []) as any[]).filter(
    (row) =>
      !row.field_name &&
      recordProposals.some(
        (fresh) => fresh.table_name === row.table_name && fresh.record_id === row.record_id,
      ),
  );
  if (supersede.length) {
    await supabase
      .from("pending_data_changes")
      .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .in(
        "id",
        supersede.map((row) => row.id),
      );
  }

  const autoRows = freshFieldProposals.filter(isAutoApplicable);
  const reviewRows = [
    ...freshFieldProposals.filter((row) => !isAutoApplicable(row)),
    ...recordProposals,
  ];

  const toInsert = [
    ...autoRows.map((row) => ({ row, decided_via: "auto" as const })),
    ...reviewRows.map((row) => ({ row, decided_via: "human" as const })),
  ].map(({ row, decided_via }) => {
    const { gap_fill: _gapFill, ...rest } = row;
    return { ...rest, decided_via };
  });


  let inserted: any[] = [];
  if (toInsert.length) {
    const { data: insertedRows, error: insertError } = await supabase
      .from("pending_data_changes")
      .insert(toInsert)
      .select(
        "id, table_name, record_id, field_name, proposed_value, source_url, source_type, ai_confidence, status, created_at",
      );
    if (insertError) throw new Error(insertError.message);
    inserted = (insertedRows ?? []) as any[];
  }

  // Trusted gap-fills apply immediately through the same writer a human approval uses,
  // so live values, source citations and the activity log all stay on one path.
  let autoApplied = 0;
  if (autoRows.length && inserted.length) {
    const { approvePending } = await import("@/lib/review.server");
    const autoKeys = new Set(
      autoRows.map((row) => `${row.table_name}:${row.record_id}:${row.field_name}`),
    );
    for (const row of inserted) {
      if (!row.field_name) continue;
      if (!autoKeys.has(`${row.table_name}:${row.record_id}:${row.field_name}`)) continue;
      try {
        await approvePending(supabase, userId, row);
        autoApplied += 1;
      } catch (failure) {
        console.error(`Auto-apply failed for ${row.field_name}: ${(failure as Error).message}`);
      }
    }
  }

  const queuedForReview = Math.max(inserted.length - autoApplied, 0);


  const anySuccess = urlResults.some((r) => r.status === "scraped" || r.status === "empty");
  const anyFailure = urlResults.some((r) => r.status === "scrape_failed" || r.status === "extract_failed");
  const status: IngestOutcome["status"] = !anySuccess ? "failed" : anyFailure ? "partial" : "success";

  const errorMessage =
    status === "failed"
      ? "Every source page failed. See the per-page reasons below."
      : status === "partial"
        ? "Some source pages failed — the rest went through."
        : null;

  await supabase
    .from("ingestion_runs")
    .update({
      status,
      url_results: urlResults,
      proposals_created: queuedForReview,
      snapshot_written: snapshotWritten,
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (snapshotWritten) {
    await supabase
      .from("programs")
      .update({ last_roster_pull_at: new Date().toISOString() })
      .eq("id", programId);
  }

  return {
    runId,
    programLabel,
    status,
    urlResults,
    proposalsCreated: queuedForReview,
    autoApplied,
    snapshotWritten,
    rosterPlayers,
    rosterWarning,
    errorMessage,
  };
}

