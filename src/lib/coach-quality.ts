/**
 * Guards for the highest-visibility field we store: who coaches a program.
 *
 * A coach name is only ever accepted when the page it came from is *provably*
 * about this school and this sport. A homepage, a whole-department staff
 * directory, one assistant's bio page or a news story can never set a head
 * coach — that is exactly how a soccer coach ended up on a baseball program.
 * Each guard blocks the write and says why, instead of asking a person to
 * notice the problem in a queue of thousands.
 */

import {
  archiveSeasonPath,
  hostOf,
  junkHost,
  matchesProgramSport,
  newsPath,
  wrongSportPath,
} from "@/lib/link-quality";

export const COACH_FIELDS = new Set(["head_coach_name", "recruiting_coordinator_name"]);

/** Words that mean we read a title, a department or a placeholder — not a person. */
const NOT_A_PERSON = [
  "coach",
  "staff",
  "director",
  "athletic",
  "athletics",
  "department",
  "vacant",
  "tba",
  "tbd",
  "interim",
  "position",
  "open",
  "unknown",
  "n/a",
  "none",
  "assistant",
  "coordinator",
  "university",
  "college",
  "baseball",
  "softball",
  "contact",
  "email",
  "phone",
  "twitter",
  "roster",
  "schedule",
];

/**
 * Does this read like a real person's name? Two to four words, letters only,
 * no titles, no contact details, no shouting headline.
 */
export function coachNameSane(value: unknown): { ok: boolean; reason: string | null } {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, reason: "no name was read" };
  if (raw.length < 5 || raw.length > 60) return { ok: false, reason: "that is not a person's name" };
  if (/[@0-9()]|https?:|\bwww\./i.test(raw)) {
    return { ok: false, reason: "that looks like contact details, not a name" };
  }
  if (!/^[A-Za-z][A-Za-z .'’-]+$/.test(raw)) {
    return { ok: false, reason: "that is not a person's name" };
  }
  const words = raw.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) {
    return { ok: false, reason: "a head coach name should be a first and last name" };
  }
  const lowered = raw.toLowerCase();
  if (NOT_A_PERSON.some((word) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(lowered))) {
    return { ok: false, reason: "that reads like a job title or a department, not a person" };
  }
  // "JOHN SMITH BASEBALL HEAD COACH" style headings are caught above; an
  // all-caps two-word heading is still suspect enough to hold back.
  if (raw === raw.toUpperCase() && words.length > 2) {
    return { ok: false, reason: "that looks like a page heading, not a name" };
  }
  return { ok: true, reason: null };
}

/** The part of a host that identifies the organisation: athletics.x.edu -> x.edu. */
function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  // Handles x.edu and x.co.uk style hosts alike.
  const tail = parts.slice(-2).join(".");
  return /^(co|ac|org|net|gov|edu)\.[a-z]{2}$/.test(tail) ? parts.slice(-3).join(".") : tail;
}

export type CoachEvidence = {
  ok: boolean;
  reason: string | null;
  /** "reject" = discard the value outright; "flag" = a person decides. */
  severity: "ok" | "reject" | "flag";
};

/** Is this page proven to be the staff page for THIS sport at THIS school? */
export function coachPageProven(input: {
  sourceUrl: string | null | undefined;
  sport: string | null | undefined;
  athleticWebsite?: string | null;
  coachingStaffUrl?: string | null;
  schoolWebsite?: string | null;
}): CoachEvidence {
  const reject = (reason: string): CoachEvidence => ({ ok: false, reason, severity: "reject" });
  const url = String(input.sourceUrl ?? "").trim();
  if (!url) return reject("no source page was recorded for this name");
  if (junkHost(url)) return reject("not from the school's own site");
  if (newsPath(url)) return reject("read from a news story, not a staff page");
  if (archiveSeasonPath(url)) return reject("read from a past season's page");
  if (wrongSportPath(url)) return reject("that page belongs to a different sport");

  // Sport proof: the address must name this sport, or be a staff directory
  // filtered to it (…/staff-directory/department/baseball, ?path=softball).
  if (!matchesProgramSport(url, input.sport ?? null)) {
    return reject("that page is not the sport's own staff page");
  }

  // A single person's bio page names one staff member; it cannot tell us who
  // holds the head coach title for the program.
  if (/\/(staff|coaches|roster)\/[a-z]+[-/][a-z-]+\/?$/i.test(url) && !/directory|department/i.test(url)) {
    return reject("that is one staff member's page, not the staff list");
  }

  // School proof: the page should live on the same organisation's site as this
  // program's athletics site, its staff page, or the school's own site. A
  // nickname athletics domain (rhodeslynx.com) can't be proved that way, so it
  // is flagged for a person rather than trusted or thrown away.
  const domain = registrableDomain(hostOf(url));
  const known = [input.athleticWebsite, input.coachingStaffUrl, input.schoolWebsite]
    .map((value) => registrableDomain(hostOf(value)))
    .filter(Boolean);
  if (known.length && !known.includes(domain)) {
    return {
      ok: false,
      reason: "that page is on a site we haven't tied to this school yet",
      severity: "flag",
    };
  }

  return { ok: true, reason: null, severity: "ok" };
}

/** Both guards together: the only path by which a coach name may be stored. */
export function coachEvidenceVerdict(input: {
  value: unknown;
  sourceUrl: string | null | undefined;
  sport: string | null | undefined;
  athleticWebsite?: string | null;
  coachingStaffUrl?: string | null;
  schoolWebsite?: string | null;
}): CoachEvidence {
  const name = coachNameSane(input.value);
  if (!name.ok) return { ...name, severity: "reject" };
  return coachPageProven(input);
}

