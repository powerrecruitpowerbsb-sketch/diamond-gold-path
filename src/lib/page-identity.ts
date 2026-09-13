/**
 * Whose team is this page, really?
 *
 * A nickname domain (gogriffs, guhoyas, goyeo) tells us nothing about which
 * school owns it, so an address alone can never prove a roster or staff page
 * belongs to the school we filed it under. Florida State ended up holding
 * Florida State College at Jacksonville's roster; Portland State held Penn
 * State's. The only reliable witness is the page itself: it nearly always
 * writes its own school's name at the top.
 *
 * These are pure string tests over already-fetched page text — no network, no
 * database — so they can be unit-tested against real pages.
 */

import { distinctiveWords, registrableDomain, schoolAcronym } from "@/lib/program-ownership";
import { hostOf } from "@/lib/link-quality";

export type IdentityVerdict = "confirmed" | "wrong_school" | "non_varsity" | "unclear";

export type IdentityResult = {
  verdict: IdentityVerdict;
  /** Plain-language reason, safe to show a person. */
  reason: string;
  /** The school the page appears to be about, when it names a different one. */
  pageSchool: string | null;
};

/** Teams that are not the varsity program we track. */
const NON_VARSITY_PHRASES = [
  "junior varsity",
  "jv baseball",
  "jv softball",
  "club baseball",
  "club softball",
  "club sports",
  "clubsports",
  "intramural",
  "developmental team",
  "developmental squad",
  "developmental baseball",
  "developmental softball",
  "student organization",
  "student org",
  "recreational sports",
];

const NON_VARSITY_HOST_HINTS = ["clubsports", "club-sports", "intramural", "rec.", "recsports"];

/**
 * Navigation and accessibility furniture that sits between a page's own name and
 * the next word. "College of the Desert Skip To Main Content" is the school's own
 * name plus a screen-reader link, and reading "Skip" as part of the name refused
 * 197 perfectly correct roster pages. Strip it before any name is derived.
 */
const PAGE_FURNITURE = [
  /skip\s+to\s+(?:main\s+)?(?:content|navigation|nav)\b/gi,
  /\bskip\s+to\b/gi,
  /\bskip\s+navigation\b/gi,
  /\ball\s+rotators\s+playing\b/gi,
  /\brotators\s+playing\b/gi,
  /\ball\s+rotators\b/gi,
  /\brotators\b/gi,
  /\bskip\b/gi,
  /\bmain\s+content\b/gi,
  /\bopen\s+menu\b/gi,
  /\bclose\s+menu\b/gi,
  /\btoggle\s+navigation\b/gi,
  /\bback\s+to\s+top\b/gi,
];

export function stripPageFurniture(text: string): string {
  let out = String(text ?? "");
  for (const pattern of PAGE_FURNITURE) out = out.replace(pattern, " ");
  return out.replace(/[ \t]+/g, " ");
}

/**
 * A page's own identity is written at the very top — the title and header. Further
 * down, a roster lists every player's previous college and high school, and a
 * schedule lists opponents, so any school name found there proves nothing.
 */
function topOfPage(text: string): string {
  return stripPageFurniture(String(text ?? "").slice(0, 900)).slice(0, 600);
}


function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Institution names written on the page, e.g. "University of New Mexico",
 * "Alfred State College", "Chaminade High School", "Penn State".
 */
export function institutionNamesIn(text: string): string[] {
  const window = topOfPage(text);
  const found: string[] = [];
  const patterns = [
    /\b(?:University|College)\s+of\s+(?:the\s+)?[A-Z][A-Za-z’'.-]*(?:\s+[A-Z][A-Za-z’'.-]*){0,3}/g,
    /\b(?:[A-Z][A-Za-z’'.&-]*\s+){1,4}(?:University|College|Institute|Academy|High School)\b/g,
    // Many athletics sites brand themselves without the word "university":
    // "Penn State", "Portland State", "Chicago State".
    /\b[A-Z][A-Za-z’'.-]+\s+State\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of window.match(pattern) ?? []) {
      const cleaned = match.replace(/\s+/g, " ").trim();
      if (cleaned.length > 5 && !found.some((seen) => seen.includes(cleaned))) found.push(cleaned);
    }
  }
  return found;
}

/** university / college / institute / academy / high school — the strict kinds. */
function institutionKind(name: string): string {
  const lowered = normalize(name);
  for (const kind of ["high school", "academy", "institute", "college", "university"]) {
    if (lowered.includes(kind)) return kind;
  }
  return "";
}

/** Does the page text spell out this school's name (or its initials)? */
export function pageNamesSchool(text: string, schoolName: string | null | undefined): boolean {
  // Anywhere on the page counts here: plenty of sites name themselves only in the
  // page footer or a copyright line.
  const window = normalize(String(text ?? "").slice(0, 200_000));
  if (!window) return false;
  const words = distinctiveWords(schoolName);
  if (words.length) {
    // Whole words only, so "Campbell" does not match "Campbellsville", and every
    // distinctive word must appear, so "Florida State" does not match
    // "Florida State College at Jacksonville".
    const present = words.filter((word) => new RegExp(`(^| )${word}( |$)`).test(window));
    if (present.length === words.length) return true;

  }
  const acronym = schoolAcronym(schoolName);
  if (acronym.length >= 3 && new RegExp(`(^| )${acronym}( |$)`).test(window)) return true;
  return false;
}

/**
 * Is a name written on the page the same institution as the record's? Compared on
 * distinctive words plus the kind of institution, so "Georgetown College" is not
 * mistaken for "Georgetown University" and "Alfred State College" is not mistaken
 * for "Alfred University".
 */
function sameInstitution(theirName: string, ourName: string | null | undefined): boolean {
  const ours = new Set(distinctiveWords(ourName));
  const theirs = distinctiveWords(theirName);
  if (!theirs.length || !ours.size) return false;
  const shared = theirs.filter((word) => ours.has(word));
  const extra = theirs.filter((word) => !ours.has(word));
  if (!shared.length || extra.length) return false;
  const theirKind = institutionKind(theirName);
  const ourKind = institutionKind(String(ourName ?? ""));
  if (theirKind && ourKind && theirKind !== ourKind) return false;
  return true;
}

/**
 * What the page says about itself.
 *
 * `other` is only filled in for a look-alike — a name that shares a word with
 * ours, like "Georgetown College" against "Georgetown University". An unrelated
 * school in the header (a former college in a player bio, a visiting team) is
 * reported as `stranger`, which is far weaker evidence and must never outweigh
 * our own school's name appearing on the page.
 */
function institutionCheck(
  text: string,
  schoolName: string | null | undefined,
): { ours: boolean; other: string | null; stranger: string | null } {
  const names = institutionNamesIn(text);

  if (!names.length) return { ours: false, other: null, stranger: null };
  if (names.some((name) => sameInstitution(name, schoolName)))
    return { ours: true, other: null, stranger: null };

  const ourWords = distinctiveWords(schoolName);
  // A look-alike either shares a word with us or contains one of ours inside a
  // longer word: Campbellsville against Campbell, Jacksonville State against
  // Jacksonville.
  const lookAlike = names.find((name) =>
    distinctiveWords(name).some((word) =>
      ourWords.some((ourWord) => word === ourWord || word.startsWith(ourWord) || ourWord.startsWith(word)),
    ),
  );
  return { ours: false, other: lookAlike ?? null, stranger: names[0]! };
}



export function nonVarsityPage(text: string, url?: string | null): string | null {
  const host = hostOf(url);
  for (const hint of NON_VARSITY_HOST_HINTS) {
    if (host.includes(hint)) return hint;
  }
  const window = normalize(topOfPage(text));
  for (const phrase of NON_VARSITY_PHRASES) {
    if (window.includes(normalize(phrase))) return phrase;
  }
  return null;
}

/**
 * Decide whether a fetched roster or staff page may be trusted for this school.
 *
 * `confirmed` — the page names this school, or sits on the school's own domain.
 * `wrong_school` — the page names a different institution; never store it.
 * `non_varsity` — a JV, club, developmental or intramural team; never store it.
 * `unclear` — the page names nobody recognisable; left for a person.
 */
export function verifyPageIdentity(input: {
  text: string;
  url?: string | null;
  schoolName: string | null | undefined;
  schoolWebsite?: string | null;
  /** The athletics site recorded for this team, when we have one. */
  athleticsSite?: string | null;
}): IdentityResult {
  const text = String(input.text ?? "");
  if (text.trim().length < 40) {
    return { verdict: "unclear", reason: "the page came back with almost no text", pageSchool: null };
  }

  const nonVarsity = nonVarsityPage(text, input.url);
  if (nonVarsity) {
    return {
      verdict: "non_varsity",
      reason: `this page is a ${nonVarsity} team, not the varsity program`,
      pageSchool: null,
    };
  }

  // The header is where a page names its own school, and it decides the
  // look-alike cases no address test can see. Player bios further down list former
  // colleges and high schools, so they are deliberately out of this window.
  const named = institutionCheck(text, input.schoolName);
  if (named.ours) {
    return { verdict: "confirmed", reason: "the page names this school", pageSchool: null };
  }
  if (named.other) {
    return {
      verdict: "wrong_school",
      reason: `this page belongs to ${named.other}, not this school`,
      pageSchool: named.other,
    };
  }

  if (pageNamesSchool(text, input.schoolName)) {
    return { verdict: "confirmed", reason: "the page names this school", pageSchool: null };
  }

  const ownDomain = registrableDomain(hostOf(input.url));
  const schoolDomain = registrableDomain(hostOf(input.schoolWebsite));
  if (ownDomain && schoolDomain && ownDomain === schoolDomain) {
    return {
      verdict: "confirmed",
      reason: "the page sits on the school's own website",
      pageSchool: null,
    };
  }
  const athleticsDomain = registrableDomain(hostOf(input.athleticsSite));
  if (ownDomain && athleticsDomain && ownDomain === athleticsDomain) {
    return {
      verdict: "confirmed",
      reason: "the page sits on this team's own athletics site",
      pageSchool: null,
    };
  }

  // A page can name an unrelated school for innocent reasons — a scoreboard
  // strip, a visiting team, a player's former college. That is never enough to
  // throw a page away on its own, so it goes on the exception list for a person.
  if (named.stranger) {
    return {
      verdict: "unclear",
      reason: `this page never names this school, and it mentions ${named.stranger}`,
      pageSchool: named.stranger,
    };
  }

  return {
    verdict: "unclear",
    reason: "the page never names its school, so we can't prove who it belongs to",
    pageSchool: null,
  };
}


