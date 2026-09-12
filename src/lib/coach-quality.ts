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
import { hasNonPersonWord } from "@/lib/person-words";

export const COACH_FIELDS = new Set(["head_coach_name", "recruiting_coordinator_name"]);

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
  // "Interim" is deliberately not a name word: an interim head coach is a real
  // person, and the word belongs to the title. It is handled there.
  if (hasNonPersonWord(raw)) {
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

/**
 * Does the page itself say, in its own words, that this person is the head coach?
 *
 * The address can prove a page is the right team's staff list, but only the text
 * can prove which of the people on it holds the job. We require the name and a
 * head-coach title to sit within the same short stretch of text, so a pitching
 * coach listed two rows below can never be promoted by accident.
 */
export function headCoachStated(pageText: string | null | undefined, value: unknown): boolean {
  const text = String(pageText ?? "").replace(/\s+/g, " ");
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text || name.length < 4) return false;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Interim counts; associate and assistant heads do not.
  const title = /\b(?<!associate\s)(?<!assistant\s)(interim\s+)?head\s+(baseball\s+|softball\s+|women'?s\s+|men'?s\s+)?coach/i;
  const nameHits = [...text.matchAll(new RegExp(escaped, "gi"))];
  if (!nameHits.length) return false;

  for (const hit of nameHits) {
    const start = Math.max(0, (hit.index ?? 0) - 120);
    const window = text.slice(start, (hit.index ?? 0) + name.length + 120);
    if (title.test(window)) return true;
  }
  return false;
}

/** Both guards together: the only path by which a coach name may be stored. */
export function coachEvidenceVerdict(input: {
  value: unknown;
  sourceUrl: string | null | undefined;
  sport: string | null | undefined;
  athleticWebsite?: string | null;
  coachingStaffUrl?: string | null;
  schoolWebsite?: string | null;
  /**
   * The page's own text, when the caller has it. Given text, the head-coach
   * title must be stated next to the name; without it the address checks stand
   * alone (used by the audit, which re-reads pages separately).
   */
  pageText?: string | null;
  /** Which field this is — only the head coach needs the title stated. */
  field?: string;
}): CoachEvidence {
  const name = coachNameSane(input.value);
  if (!name.ok) return { ...name, severity: "reject" };
  const page = coachPageProven(input);
  if (!page.ok) return page;

  const needsTitle = !input.field || input.field === "head_coach_name";
  if (needsTitle && input.pageText != null && !headCoachStated(input.pageText, input.value)) {
    return {
      ok: false,
      reason: "the page doesn't say this person is the head coach",
      severity: "reject",
    };
  }

  return { ok: true, reason: null, severity: "ok" };
}


