/**
 * Is this page the right KIND of page, for the right SPORT?
 *
 * Owning the domain is necessary and nowhere near sufficient. utexas.edu owns
 * giving.utexas.edu (a donation page), ucf.edu owns its own homepage,
 * stetson.edu owns visit.stetson.edu, and one Sidearm site holds both a pom
 * squad coach's bio page and the baseball roster. Domain ownership said yes to
 * all of them. This module is the second gate: it reads the address and the
 * page text and answers whether the page is an athletics index, a roster for
 * the sport we asked for, or a staff listing.
 *
 * Pure string tests over an address and already-fetched text — no network, no
 * database — so every rule here is unit-testable.
 */

import { hostOf } from "@/lib/link-quality";
import { registrableDomain } from "@/lib/program-ownership";

export type PageKind = "athletic_website" | "roster_page" | "coaching_staff_page";

export type PurposeVerdict = {
  ok: boolean;
  /** Machine key, so results can be tallied. */
  code:
    | "athletics_index"
    | "roster_for_sport"
    | "staff_listing"
    | "school_homepage"
    | "not_athletics_section"
    | "single_sport_page"
    | "wrong_sport"
    | "individual_bio"
    | "no_roster_found"
    | "roster_for_other_sport"
    | "not_a_staff_listing"
    | "page_not_read";
  /** Plain-language reason, safe to show a person. */
  reason: string;
};

/* --------------------------------------------------------------- addresses */

const lower = (v: string | null | undefined) => String(v ?? "").toLowerCase();

function pathOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(String(url));
    return lower(parsed.pathname).replace(/\/+$/, "");
  } catch {
    return lower(String(url)).replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
  }
}

function segments(url: string | null | undefined): string[] {
  return pathOf(url).split("/").filter(Boolean);
}

/** Sports and squads we never track, written the way athletics sites write them. */
const OTHER_SPORT_TOKENS = [
  "esports",
  "e-sports",
  "pom",
  "pom-squad",
  "pomsquad",
  "cheer",
  "cheerleading",
  "stunt",
  "dance",
  "danceteam",
  "spirit",
  "band",
  "football",
  "fball",
  "basketball",
  "mbkb",
  "wbkb",
  "mbb",
  "wbb",
  "soccer",
  "msoc",
  "wsoc",
  "volleyball",
  "wvball",
  "mvball",
  "wrestling",
  "lacrosse",
  "mlax",
  "wlax",
  "golf",
  "mgolf",
  "wgolf",
  "tennis",
  "mten",
  "wten",
  "track",
  "track-and-field",
  "xc",
  "mxc",
  "wxc",
  "cross-country",
  "swimming",
  "swim",
  "diving",
  "rowing",
  "sailing",
  "hockey",
  "gymnastics",
  "bowling",
  "rugby",
  "waterpolo",
  "wpolo",
  "equestrian",
  "fencing",
  "skiing",
  "triathlon",
  "archery",
  "badminton",
  "handball",
  "squash",
  "beach-volleyball",
  "flag-football",
  "acrobatics",
];

const OURS: Record<string, string[]> = {
  baseball: ["baseball", "bsb", "base"],
  softball: ["softball", "sball", "wsb", "sball-w"],
};

const tokenIn = (path: string, token: string) =>
  new RegExp(`(^|[/._-])${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([/._-]|$)`).test(path);

/**
 * Does the address name a sport that is not the one we asked for? Returns the
 * offending token, or null. Naming the other of baseball/softball counts.
 */
export function pathNamesOtherSport(
  url: string | null | undefined,
  sport: string | null | undefined,
): string | null {
  const path = pathOf(url);
  if (!path) return null;
  const wanted = sport ? (OURS[lower(sport)] ?? []) : [];
  const namesOurs = wanted.some((token) => tokenIn(path, token));

  const other = sport ? (lower(sport) === "softball" ? "baseball" : "softball") : null;
  if (other && !namesOurs) {
    for (const token of OURS[other]!) {
      if (tokenIn(path, token)) return token;
    }
  }
  if (namesOurs) return null;
  for (const token of OTHER_SPORT_TOKENS) {
    if (tokenIn(path, token)) return token;
  }
  return null;
}

/** Subdomains and sections that are never a school's athletics index. */
const NON_ATHLETICS_WORDS = [
  "giving",
  "give",
  "donate",
  "donation",
  "donations",
  "advancement",
  "foundation",
  "visit",
  "tour",
  "tours",
  "admission",
  "admissions",
  "apply",
  "alumni",
  "news",
  "catalog",
  "catalogue",
  "library",
  "jobs",
  "careers",
  "calendar",
  "map",
  "maps",
  "portal",
  "my",
  "shop",
  "store",
  "tickets",
  "camps",
];

/** A single player/coach page rather than a listing: …/coaches/jane-doe/785 */
export function looksLikeIndividualBio(url: string | null | undefined): boolean {
  const parts = segments(url);
  const anchor = parts.findIndex((part) =>
    ["coaches", "coach", "staff", "staff-directory", "coaching-staff", "roster", "player", "bio"].includes(part),
  );
  if (anchor === -1) return false;
  const tail = parts.slice(anchor + 1);
  if (!tail.length) return false;
  // A season archive ("/roster/2024") is not a bio; a name or a name+id is.
  if (tail.length === 1 && /^(19|20)\d{2}([-/]\d{2,4})?$/.test(tail[0]!)) return false;
  return tail.some((part) => /^[a-z]+(-[a-z]+)+$/.test(part)) || tail.some((part) => /^\d{2,6}$/.test(part));
}

/** Nothing but a host: "https://www.ucf.edu", "https://visit.stetson.edu/". */
function isBareHost(url: string | null | undefined): boolean {
  return segments(url).length === 0;
}

/* ------------------------------------------------------------------- text */

const NAME_LINE = /(^|[|\s])([A-Z][a-zà-ÿA-ZÀ-Ÿ'’.-]+)\s+([A-Z][a-zà-ÿA-ZÀ-Ÿ'’.-]+)/;
const CLASS_YEAR = /\b(fr\.?|so\.?|jr\.?|sr\.?|freshman|sophomore|junior|senior|redshirt|graduate)\b/i;

/** How many lines look like a listed player: a name plus a number or class year. */
export function playerLikeLines(text: string): number {
  let hits = 0;
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length < 4 || trimmed.length > 400) continue;
    if (!NAME_LINE.test(trimmed)) continue;
    if (/\b\d{1,2}\b/.test(trimmed) || CLASS_YEAR.test(trimmed)) hits += 1;
  }
  return hits;
}

const COACH_TITLES = [
  "head coach",
  "assistant coach",
  "associate head coach",
  "pitching coach",
  "hitting coach",
  "volunteer coach",
  "recruiting coordinator",
  "director of operations",
  "student assistant",
  "graduate assistant",
  "athletic trainer",
  "strength and conditioning",
];

export function coachTitleCount(text: string): number {
  const flat = lower(text);
  let count = 0;
  for (const title of COACH_TITLES) {
    const matches = flat.match(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
    if (matches) count += matches.length;
  }
  return count;
}

/** Does the page text actually talk about this sport? */
export function textNamesSport(text: string, sport: string | null | undefined): boolean {
  const flat = lower(text).slice(0, 200_000);
  const wanted = sport ? (OURS[lower(sport)] ?? []) : [];
  return wanted.some((token) => flat.includes(token));
}

/** The page is clearly the OTHER of baseball/softball and never ours. */
function textIsOtherSportOnly(text: string, sport: string | null | undefined): boolean {
  if (!sport) return false;
  const other = lower(sport) === "softball" ? "baseball" : "softball";
  const flat = lower(text).slice(0, 200_000);
  const ourHits = (flat.match(new RegExp(lower(sport), "g")) ?? []).length;
  const otherHits = (flat.match(new RegExp(other, "g")) ?? []).length;
  return otherHits >= 3 && ourHits === 0;
}

const ATHLETICS_WORDS = ["athletics", "athletic department", "sports", "teams", "gameday", "schedule"];

/* --------------------------------------------------------------- verdicts */

/**
 * The whole page-level gate. `text` is null when the page could not be read;
 * that is never a pass — the caller must treat it as unverified.
 */
export function verifyPagePurpose(input: {
  kind: PageKind;
  url: string | null | undefined;
  sport?: string | null;
  text: string | null;
  schoolWebsite?: string | null;
  federalWebsite?: string | null;
}): PurposeVerdict {
  const { kind, url } = input;

  // Address-level refusals first: they need no page read at all.
  if (kind !== "athletic_website") {
    const wrong = pathNamesOtherSport(url, input.sport ?? null);
    if (wrong) {
      return {
        ok: false,
        code: "wrong_sport",
        reason: `The address is for a different sport or squad ("${wrong}").`,
      };
    }
  } else {
    // An athletics home page belongs to no single sport — including ours.
    const path = pathOf(url);
    const ownSport = [...OURS['baseball']!, ...OURS['softball']!].find((token) => tokenIn(path, token));
    const wrong = ownSport ?? pathNamesOtherSport(url, null);
    if (wrong) {
      return {
        ok: false,
        code: "single_sport_page",
        reason: `This is one team's page ("${wrong}"), not the athletics home page.`,
      };
    }
  }

  if (kind === "coaching_staff_page" && looksLikeIndividualBio(url)) {
    return {
      ok: false,
      code: "individual_bio",
      reason: "This is one person's page, not the staff listing.",
    };
  }
  if (kind === "roster_page" && looksLikeIndividualBio(url)) {
    return {
      ok: false,
      code: "individual_bio",
      reason: "This is one player's page, not the roster.",
    };
  }

  if (kind === "athletic_website") {
    const host = hostOf(url);
    const firstLabel = host.split(".")[0] ?? "";
    if (NON_ATHLETICS_WORDS.includes(firstLabel) || segments(url).some((part) => NON_ATHLETICS_WORDS.includes(part))) {
      return {
        ok: false,
        code: "not_athletics_section",
        reason: `This is the school's ${firstLabel || "other"} section, not its athletics site.`,
      };
    }
    // Either column may hold the school's own site, so both are compared.
    const own = new Set(
      [input.schoolWebsite, input.federalWebsite]
        .map((value) => registrableDomain(hostOf(value)))
        .filter(Boolean),
    );
    const here = registrableDomain(host);
    if (isBareHost(url) && here && own.has(here) && !/(athletic|sport|^go[a-z]{3,})/.test(host)) {
      return {
        ok: false,
        code: "school_homepage",
        reason: "This is the school's own homepage, not its athletics site.",
      };
    }
  }

  const text = input.text;
  if (text === null || String(text).trim().length < 200) {
    return {
      ok: false,
      code: "page_not_read",
      reason: "The page could not be read, so nothing about it is verified.",
    };
  }

  if (kind === "athletic_website") {
    const flat = lower(text);
    const athletics = ATHLETICS_WORDS.filter((word) => flat.includes(word)).length;
    const sportsListed = ["baseball", "softball", "basketball", "soccer", "volleyball", "golf", "tennis", "track"].filter(
      (sport) => flat.includes(sport),
    ).length;
    if (athletics >= 1 && sportsListed >= 3) {
      return { ok: true, code: "athletics_index", reason: "The page lists the school's teams." };
    }
    return {
      ok: false,
      code: "not_athletics_section",
      reason: "The page doesn't read as an athletics index — it doesn't list the school's teams.",
    };
  }

  if (kind === "roster_page") {
    if (textIsOtherSportOnly(text, input.sport ?? null)) {
      return {
        ok: false,
        code: "roster_for_other_sport",
        reason: `The page is about ${lower(input.sport) === "softball" ? "baseball" : "softball"}, not ${lower(input.sport)}.`,
      };
    }
    const players = playerLikeLines(text);
    if (players < 6) {
      return {
        ok: false,
        code: "no_roster_found",
        reason: `The page doesn't list a roster (only ${players} player-like entries found).`,
      };
    }
    if (!textNamesSport(text, input.sport ?? null)) {
      return {
        ok: false,
        code: "roster_for_other_sport",
        reason: `The page never names ${lower(input.sport) || "this sport"}.`,
      };
    }
    return { ok: true, code: "roster_for_sport", reason: `A ${lower(input.sport)} roster with ${players} players listed.` };
  }

  if (textIsOtherSportOnly(text, input.sport ?? null)) {
    return {
      ok: false,
      code: "roster_for_other_sport",
      reason: `The staff page is for ${lower(input.sport) === "softball" ? "baseball" : "softball"}.`,
    };
  }
  const titles = coachTitleCount(text);
  if (titles < 2) {
    return {
      ok: false,
      code: "not_a_staff_listing",
      reason: `The page doesn't read as a staff listing (${titles} coaching titles found).`,
    };
  }
  return { ok: true, code: "staff_listing", reason: `A staff listing with ${titles} coaching titles.` };
}

/**
 * May a proposal replace a value already on file?
 *
 * Only when the new page was actually read and passed the kind/sport checks,
 * and the stored value has been shown to fail. Anything else is a candidate for
 * a person to look at, never an overwrite.
 */
export function replacementDecision(input: {
  storedValue: string | null | undefined;
  proposedRead: boolean;
  proposedVerified: boolean;
  storedFails: boolean;
}): { action: "fill_empty" | "replace" | "review" | "keep_stored"; reason: string } {
  const stored = String(input.storedValue ?? "").trim();
  if (!stored) {
    return input.proposedRead && input.proposedVerified
      ? { action: "fill_empty", reason: "Nothing on file, and the new page was read and checked." }
      : { action: "review", reason: "Nothing on file, but the new page isn't verified — needs a look." };
  }
  if (!input.proposedRead) {
    return { action: "keep_stored", reason: "The new page couldn't be read, so the stored address stands." };
  }
  if (!input.proposedVerified) {
    return { action: "keep_stored", reason: "The new page failed the page checks, so the stored address stands." };
  }
  if (!input.storedFails) {
    return { action: "review", reason: "Both addresses look usable — a person decides which to keep." };
  }
  return { action: "replace", reason: "The stored address fails and the new one was read and checked." };
}
