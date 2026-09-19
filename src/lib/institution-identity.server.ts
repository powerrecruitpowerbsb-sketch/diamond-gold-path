/**
 * Identity-bound link checks.
 *
 * A school is its federal institution record, not its name. Franklin College
 * and Benjamin Franklin Institute of Technology share name words and nothing
 * else; Butler County Community College in Kansas and Butler County Community
 * College in Pennsylvania are identical on name words and differ on state and
 * on two-year/four-year level. So before any domain or page address is written
 * to a school, it has to be tied back to that school's institution record.
 *
 * Nothing here writes anything. It answers one question: may this address be
 * attached to this institution, and which check proves it?
 */

import { US_STATE_NAMES } from "@/lib/data-quality";
import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";
import { safeFetch } from "@/lib/safe-fetch.server";

const NAME_TO_CODE = new Map<string, string>(
  Object.entries(US_STATE_NAMES).map(([code, name]) => [name, code]),
);

/** "Minnesota", "Minn.", "MN" → "MN". Unknown text stays null. */
export function stateCode(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const flat = raw.toLowerCase().replace(/\./g, "").trim();
  if (/^[a-z]{2}$/.test(flat)) return flat.toUpperCase();
  const exact = NAME_TO_CODE.get(flat);
  if (exact) return exact;
  // "Ill", "Tenn", "Calif" — federal-style abbreviations.
  for (const [name, code] of NAME_TO_CODE) {
    if (name.startsWith(flat) && flat.length >= 3) return code;
  }
  return null;
}

export type Institution = {
  universityId: string;
  unitid: number | null;
  storedName: string;
  storedState: string | null;
  /** Authoritative for schools that have an institution ID. */
  federalName: string | null;
  federalState: string | null;
  federalWebsite: string | null;
  federalTwoYear: boolean | null;
  /** Two-year from our own side: NJCAA/CCCAA/NWAC programs. */
  ourTwoYear: boolean | null;
};

const TWO_YEAR_BODIES = new Set(["NJCAA", "CCCAA", "NWAC"]);

/** Everything needed to judge a candidate address for one school. */
export async function loadInstitution(supabase: any, universityId: string): Promise<Institution> {
  const { data: school, error } = await supabase
    .from("universities")
    .select("id, name, state, ipeds_unitid")
    .eq("id", universityId)
    .single();
  if (error) throw new Error(error.message);

  const unitid = (school as any).ipeds_unitid ? Number((school as any).ipeds_unitid) : null;

  let federal: any = null;
  if (unitid) {
    const { data } = await supabase
      .from("federal_directory")
      .select("unitid, name, state, website, two_year")
      .eq("unitid", unitid)
      .maybeSingle();
    federal = data ?? null;
  }

  const { data: bodies } = await supabase
    .from("programs")
    .select("governing_body")
    .eq("university_id", universityId);
  const list = ((bodies ?? []) as { governing_body: string | null }[])
    .map((row) => row.governing_body)
    .filter(Boolean) as string[];

  return {
    universityId,
    unitid,
    storedName: String((school as any).name ?? ""),
    storedState: ((school as any).state ?? null) as string | null,
    federalName: federal?.name ?? null,
    federalState: federal?.state ?? null,
    federalWebsite: federal?.website ?? null,
    federalTwoYear: federal?.two_year ?? null,
    ourTwoYear: list.length ? list.some((body) => TWO_YEAR_BODIES.has(body)) : null,
  };
}

export type MatchEvidence = {
  /** Which check justified the address, or which one refused it. */
  check:
    | "federal_domain"
    | "federal_subdomain"
    | "reachable_from_institution_site"
    | "no_institution_id"
    | "no_federal_website"
    | "domain_belongs_to_other_institution"
    | "state_disagrees"
    | "lost_tiebreak_to_other_institution"
    | "unproven";
  passed: boolean;
  detail: string;
  unitid: number | null;
  candidateDomain: string | null;
  institutionDomain: string | null;
  checkedAt: string;
};

export type CandidateVerdict = { ok: boolean; evidence: MatchEvidence };

function evidence(
  check: MatchEvidence["check"],
  passed: boolean,
  detail: string,
  inst: Institution,
  candidateDomain: string | null,
): CandidateVerdict {
  return {
    ok: passed,
    evidence: {
      check,
      passed,
      detail,
      unitid: inst.unitid,
      candidateDomain,
      institutionDomain: inst.federalWebsite ? registrableDomain(hostOf(inst.federalWebsite)) : null,
      checkedAt: new Date().toISOString(),
    },
  };
}

/**
 * Hard filters first — a candidate that names a different state, or belongs to a
 * school of the other level (two-year vs four-year), is refused outright rather
 * than scored down. Then the positive proof: the address must sit on the
 * institution's own registrable domain, or be reachable from it.
 */
export async function verifyCandidateForInstitution(
  supabase: any,
  inst: Institution,
  url: string,
  context: { title?: string | null } = {},
): Promise<CandidateVerdict> {
  const candidateDomain = registrableDomain(hostOf(url)) || null;

  if (!inst.unitid) {
    return evidence(
      "no_institution_id",
      false,
      "This school has no federal institution ID yet, so no address can be tied to it.",
      inst,
      candidateDomain,
    );
  }
  if (!candidateDomain) {
    return evidence("unproven", false, "The address has no readable domain.", inst, null);
  }

  // Does this domain already belong to a different institution, federally?
  const { data: owners } = await supabase
    .from("federal_directory")
    .select("unitid, name, state, two_year, website")
    .not("website", "is", null)
    .ilike("website", `%${candidateDomain}%`)
    .limit(20);
  const other = ((owners ?? []) as any[]).find(
    (row) => registrableDomain(hostOf(String(row.website))) === candidateDomain && Number(row.unitid) !== inst.unitid,
  );
  if (other) {
    return evidence(
      "domain_belongs_to_other_institution",
      false,
      `This domain is the official site of ${other.name} (${other.state}), a different institution.`,
      inst,
      candidateDomain,
    );
  }

  // Hard filter: state. The federal state is authoritative here.
  const ourState = stateCode(inst.federalState ?? inst.storedState);
  const claimed = new Set<string>();
  const haystack = `${context.title ?? ""} ${url}`.toLowerCase();
  for (const [name, code] of NAME_TO_CODE) {
    if (haystack.includes(name)) claimed.add(code);
  }
  if (ourState && claimed.size && !claimed.has(ourState)) {
    return evidence(
      "state_disagrees",
      false,
      `The candidate names ${[...claimed].join(", ")} but this institution is in ${ourState}.`,
      inst,
      candidateDomain,
    );
  }

  const institutionDomain = inst.federalWebsite
    ? registrableDomain(hostOf(inst.federalWebsite))
    : null;
  if (!institutionDomain) {
    return evidence(
      "no_federal_website",
      false,
      "The federal record for this institution has no website on file yet, so nothing can be verified against it.",
      inst,
      candidateDomain,
    );
  }

  // Level is NOT a pass/fail gate. The federal two-year flag counts any
  // bachelor's-granting school as four-year, and many community colleges now
  // grant a BAS, so comparing a school's league to its own federal level
  // rejects perfectly correct NJCAA/CCCAA records. Level is only useful as a
  // tiebreaker between two institutions contending for the same address —
  // see pickOwnerAmongCandidates below.


  if (candidateDomain === institutionDomain) {
    const host = hostOf(url);
    const exact = host === institutionDomain || host === `www.${institutionDomain}`;
    return evidence(
      exact ? "federal_domain" : "federal_subdomain",
      true,
      `Address sits on the institution's own domain (${institutionDomain}).`,
      inst,
      candidateDomain,
    );
  }

  // Many schools run athletics on a separate domain. That is fine — as long as
  // the institution's own site links to it.
  const reachable = await institutionLinksTo(inst.federalWebsite!, candidateDomain);
  if (reachable) {
    return evidence(
      "reachable_from_institution_site",
      true,
      `${institutionDomain} links out to ${candidateDomain}.`,
      inst,
      candidateDomain,
    );
  }

  return evidence(
    "unproven",
    false,
    `${candidateDomain} cannot be tied back to ${institutionDomain} — not the same domain and not linked from it.`,
    inst,
    candidateDomain,
  );
}

/** Does the institution's own website link out to this domain? */
export async function institutionLinksTo(
  institutionWebsite: string,
  candidateDomain: string,
): Promise<boolean> {
  try {
    const result = await safeFetch(institutionWebsite);
    // The rendered fallback returns html: null and only fills markdown, so
    // reading html alone saw nothing for every school whose homepage needs
    // rendering and refused its correct athletics address.
    const body = `${result?.html ?? ""}\n${result?.markdown ?? ""}`.trim();
    if (!body) return false;
    return String(body).toLowerCase().includes(candidateDomain.toLowerCase());
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Tiebreaking between institutions that contend for the same address  *
 * ------------------------------------------------------------------ */

export type Contender = {
  universityId: string;
  unitid: number | null;
  name: string;
  storedState: string | null;
  storedCity: string | null;
  federalState: string | null;
  federalCity: string | null;
  federalWebsite: string | null;
  federalTwoYear: boolean | null;
  /** Whether the school's leagues are two-year (NJCAA/CCCAA/NWAC). */
  leagueTwoYear: boolean | null;
};

export type OwnerDecision = {
  ownerUniversityId: string | null;
  confidence: "resolved" | "ambiguous";
  evidence: string;
};

const norm = (v: string | null | undefined) =>
  String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Two or more institutions hold the same domain or page address; at most one
 * can be right. Decide by, in order: the address sitting on a candidate's own
 * federal website domain; then state agreement between the address text and
 * the candidate; then city; then level (two-year vs four-year) as the last
 * separator. If nothing separates them, say so instead of guessing.
 */
export function pickOwnerAmongCandidates(
  url: string,
  candidates: Contender[],
  context: { title?: string | null } = {},
): OwnerDecision {
  if (candidates.length === 0) return { ownerUniversityId: null, confidence: "ambiguous", evidence: "No candidates." };
  if (candidates.length === 1)
    return { ownerUniversityId: candidates[0]!.universityId, confidence: "resolved", evidence: "Only one school attached." };

  const candidateDomain = registrableDomain(hostOf(url)) || "";

  // 1. Federal website domain match — the strongest signal there is.
  const onOwnDomain = candidates.filter(
    (c) => c.federalWebsite && registrableDomain(hostOf(c.federalWebsite)) === candidateDomain && candidateDomain,
  );
  if (onOwnDomain.length === 1)
    return {
      ownerUniversityId: onOwnDomain[0]!.universityId,
      confidence: "resolved",
      evidence: `${candidateDomain} is the institution's own federal website domain.`,
    };

  const pool = onOwnDomain.length > 1 ? onOwnDomain : candidates;

  // 2. State named in the address or page title.
  const haystack = `${context.title ?? ""} ${url}`.toLowerCase();
  const claimed = new Set<string>();
  for (const [name, code] of NAME_TO_CODE) if (haystack.includes(name)) claimed.add(code);
  for (const code of Object.keys(US_STATE_NAMES)) if (new RegExp(`(^|[^a-z])${code.toLowerCase()}([^a-z]|$)`).test(haystack)) claimed.add(code);
  if (claimed.size) {
    const stateHits = pool.filter((c) => {
      const code = stateCode(c.federalState ?? c.storedState);
      return code ? claimed.has(code) : false;
    });
    if (stateHits.length === 1)
      return {
        ownerUniversityId: stateHits[0]!.universityId,
        confidence: "resolved",
        evidence: `The address names ${[...claimed].join(", ")}, matching only this school's state.`,
      };
  }

  // 3. City named in the address.
  const cityHits = pool.filter((c) => {
    const city = norm(c.federalCity ?? c.storedCity);
    return city.length >= 4 && haystack.replace(/[^a-z0-9]+/g, " ").includes(city);
  });
  if (cityHits.length === 1)
    return {
      ownerUniversityId: cityHits[0]!.universityId,
      confidence: "resolved",
      evidence: `The address names this school's city (${cityHits[0]!.federalCity ?? cityHits[0]!.storedCity}).`,
    };

  // 4. Level, last: only separates when the address itself reads as a
  //    community/junior college and exactly one candidate is two-year.
  const readsTwoYear = /(community|junior|\bcc\b|jc)/.test(haystack);
  if (readsTwoYear) {
    const levelHits = pool.filter((c) => c.leagueTwoYear === true || c.federalTwoYear === true);
    if (levelHits.length === 1)
      return {
        ownerUniversityId: levelHits[0]!.universityId,
        confidence: "resolved",
        evidence: "The address reads as a two-year college and only this candidate is one.",
      };
  }

  return {
    ownerUniversityId: null,
    confidence: "ambiguous",
    evidence: `${pool.length} schools remain indistinguishable on website, state, city and level.`,
  };
}
