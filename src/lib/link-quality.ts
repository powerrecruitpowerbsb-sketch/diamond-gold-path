/**
 * Judgements about a discovered link, shared by three callers so they can never
 * disagree: the tidy-up sweep on the links screen, the fast picker, and the
 * moment discovery proposes a link in the first place.
 *
 * Everything here is a pure string test — no database, no network.
 */

export type LinkKind = "athletic_website" | "roster_page" | "coaching_staff_page";

const OTHER_SPORTS = [
  "mbkb",
  "wbkb",
  "mbb",
  "wbb",
  "basketball",
  "msoc",
  "wsoc",
  "soccer",
  "fball",
  "football",
  "volleyball",
  "wvball",
  "mvball",
  "wrestling",
  "sailing",
  "rowing",
  "hockey",
  "lacrosse",
  "wlax",
  "mlax",
  "golf",
  "mgolf",
  "wgolf",
  "tennis",
  "mten",
  "wten",
  "track",
  "xc",
  "wxc",
  "mxc",
  "cross-country",
  "swim",
  "swimming",
  "diving",
  "esports",
  "gymnastics",
  "bowling",
  "cheer",
  "dance",
  "rugby",
  "waterpolo",
  "wpolo",
  "polo",
  "beach",
  "saac",
  "sportsmed",
  "sportsmedicine",
  "sports-medicine",
  "training",
  "trainer",
  "adaptive",
  "cheerleading",
  "flag-football",
  "stunt",
  "acrobatics",
  "equestrian",
  "fencing",
  "skiing",
  "shooting",
  "triathlon",
  "archery",
  "badminton",
  "handball",
  "squash",
  "wpolo",
];

const OUR_SPORTS = ["baseball", "softball", "bsb", "sball", "wsb"];

const JUNK_HOST_FRAGMENTS = [
  "smartcatalogiq",
  "wikipedia.org",
  "facebook.com",
  "bkstr.com",
  "college-tour.com",
  "indeed.com",
  "ziprecruiter.com",
  "twitter.com",

  "x.com",
  "instagram.com",
  "youtube.com",
  "linkedin.com",
  "maxpreps.com",
  "ncsasports.org",
  "hudl.com",
  "prepbaseballreport.com",
  "perfectgame.org",
  "fieldlevel.com",
  "athleticnet",
  "eventbrite",
  "issuu.com",
  "linktr.ee",
  "sportsrecruits.com",
  "teamunify.com",
  "leagueapps",
  "sportngin",
  "gofundme.com",
];

const lower = (value: string) => value.toLowerCase();

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return lower(new URL(url).hostname).replace(/^www\./, "");
  } catch {
    return lower(String(url))
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]!;
  }
}

/** "https://x.com/" and "https://x.com" are the same address. */
function stripTrailingSlash(url: string | null | undefined): string {
  return String(url ?? "").replace(/\/+$/, "");
}

function pathOf(url: string | null | undefined): string {

  if (!url) return "";
  try {
    const parsed = new URL(url);
    return lower(`${parsed.pathname}${parsed.search}`);
  } catch {
    const withoutHost = lower(String(url)).replace(/^https?:\/\/[^/]+/, "");
    return withoutHost.startsWith("/") ? withoutHost : `/${withoutHost}`;
  }
}

const hasToken = (path: string, token: string) =>
  new RegExp(`(^|[/._-])${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([/._-]|$)`).test(path);

/** The link is clearly about a sport we don't track. */
export function wrongSportPath(url: string | null | undefined): boolean {
  const path = pathOf(url);
  if (!path) return false;
  if (OUR_SPORTS.some((sport) => hasToken(path, sport))) return false;
  return OTHER_SPORTS.some((sport) => hasToken(path, sport));
}

/** The link points at a past season's archive (…/2021-22/…). */
export function archiveSeasonPath(url: string | null | undefined): boolean {
  const path = pathOf(url);
  const match = /(^|[/_-])((19|20)\d{2})(-\d{2,4})?([/_-]|$)/.exec(path);
  if (!match) return false;
  const year = Number(match[2]);
  const thisYear = new Date().getUTCFullYear();
  // Anything two or more seasons old is an archive, not the live page.
  return year < thisYear - 1;
}

/** A news story, blog post, or tag listing — not a roster or staff page. */
export function newsPath(url: string | null | undefined): boolean {
  const path = pathOf(url);
  if (!path) return false;
  if (/(^|\/)(news|tag|tags|story|stories|article|articles|blog|press-releases?|releases?)(\/|$)/.test(path)) {
    return true;
  }
  // Long hyphenated slugs are headlines: "…/cowgirls-softball-coach-signs-nine-players".
  const lastSegment = path.split("?")[0]!.split("/").filter(Boolean).pop() ?? "";
  return lastSegment.split("-").length >= 5;
}

/** Hosts that are never a school's athletics site. */
export function junkHost(url: string | null | undefined): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return JUNK_HOST_FRAGMENTS.some((fragment) =>
    // A domain fragment must be the host or a parent of it, never a substring:
    // "x.com" must not condemn rhodeslynx.com.
    fragment.includes(".")
      ? host === fragment || host.endsWith(`.${fragment}`)
      : host.split(/[.-]/).includes(fragment),
  );
}

/** The "athletics site" we found is really the school's own homepage. */
export function isSchoolHomepage(
  url: string | null | undefined,
  schoolWebsite: string | null | undefined,
): boolean {
  const host = hostOf(url);
  const schoolHost = hostOf(schoolWebsite);
  if (!host || !schoolHost) return false;
  if (host !== schoolHost) return false;
  // athletics.norcocollege.edu vs norcocollege.edu: a same-host link is only
  // wrong when it has no athletics hint anywhere in it.
  return !/(athletic|sport|gozips|go[a-z]{3,}s?\.)/i.test(String(url));
}

/** The link's path names the sport this program plays. */
export function matchesProgramSport(url: string | null | undefined, sport: string | null): boolean {
  const path = pathOf(url);
  if (!path || !sport) return false;
  const wanted = lower(sport) === "softball" ? ["softball", "sball", "wsb"] : ["baseball", "bsb"];
  return wanted.some((token) => hasToken(path, token));
}

/** Subdomains and sections that are never a school's athletics site. */
const NON_ATHLETICS_HOST_WORDS = [
  "catalog",
  "catalogue",
  "directory",
  "library",
  "people",
  "apply",
  "admission",
  "admissions",
  "registrar",
  "canvas",
  "blackboard",
  "mail",
  "webmail",
  "shop",
  "store",
  "blogs",
  "news",
  "calendar",
  "jobs",
];

const isPdf = (url: string) => /\.pdf($|[?#])/i.test(url);

/**
 * Does this address look like a school's athletics site in its own right?
 * Athletics sites are almost always a separate nickname domain
 * (landerbearcats.com), an athletics subdomain, or a hosted platform page
 * (eastfield.prestosports.com) — never the course catalog or a PDF.
 */
export function looksLikeAthleticsHost(
  url: string | null | undefined,
  schoolWebsite?: string | null,
): boolean {
  if (!url || isPdf(url)) return false;
  const host = hostOf(url);
  if (!host || junkHost(url)) return false;
  if (NON_ATHLETICS_HOST_WORDS.some((word) => host.split(".").includes(word))) return false;

  const segments = pathOf(url).split("?")[0]!.split("/").filter(Boolean);
  // Athletics home pages sit at the root, or a section or two deep at most.
  if (segments.length > 2) return false;

  const athleticsSignal = /(athletic|sports|presto|sidearm)/.test(host) || /^go[a-z]{3,}/.test(host);
  if (athleticsSignal) return true;

  // A nickname domain: not the school's own host, and not a .edu at all.
  const schoolHost = hostOf(schoolWebsite);
  if (host === schoolHost) return false;
  return !host.endsWith(".edu") && !host.endsWith(".gov");
}

/** Sections of a site that are never the athletics home page. */
const SITE_SECTION_JUNK =
  /(^|\/)(news[a-z-]*|tags?|stor(y|ies)[a-z-]*|articles?|blogs?[a-z-]*|categor(y|ies)|press[a-z-]*|shop|store[a-z-]*|jobs|careers|employment|calendar|tickets|donate|give|camps?)(\/|$)/;


export function junkSectionPath(url: string | null | undefined): boolean {
  const path = pathOf(url);
  return path ? SITE_SECTION_JUNK.test(path.split("?")[0]!) : false;
}

/**
 * Discovery often lands on one team's page ("…/sports/cross-country") on the
 * school's real athletics site. That page proves the site, but it is not the
 * address to keep — so trim it back to the athletics home page.
 * Returns null when the address isn't on an athletics site in its own right.
 */
export function athleticsHomeFor(
  url: string | null | undefined,
  schoolWebsite?: string | null,
): string | null {
  if (!url || isPdf(url) || junkHost(url)) return null;
  let origin = "";
  try {
    origin = new URL(String(url)).origin;
  } catch {
    return null;
  }
  if (!looksLikeAthleticsHost(origin, schoolWebsite)) return null;
  return origin;
}

export type LinkVerdict = {
  action: "approve" | "reject" | "ask";
  /** Plain-language reason, safe to show a person. */
  reason: string;
  /** Machine key used to tally the sweep. */
  code:
    | "wrong_sport"
    | "old_season"
    | "news_page"
    | "junk_host"
    | "junk_section"
    | "school_homepage"
    | "wrong_school"
    | "not_a_web_page"
    | "athletics_site"
    | "athletics_site_trimmed"
    | "sport_page_on_known_site"
    | "needs_a_look";
  /** When set, save this address instead of the one that was found. */
  normalizedUrl?: string;
};


export function classifyLink(input: {
  kind: LinkKind;
  url: string | null | undefined;
  sport?: string | null;
  schoolWebsite?: string | null;
  /** The program's already-saved athletics site, when there is one. */
  athleticWebsite?: string | null;
  /** Every athletics host already confirmed for this school. */
  athleticHosts?: string[];
}): LinkVerdict {
  const { kind, url } = input;
  const ask: LinkVerdict = { action: "ask", reason: "Needs a look.", code: "needs_a_look" };
  if (!url) return ask;

  if (junkHost(url)) {
    return { action: "reject", reason: "Not a school athletics site.", code: "junk_host" };
  }

  if (isPdf(url)) {
    return {
      action: "reject",
      reason: "This is a document, not a team page.",
      code: "not_a_web_page",
    };
  }

  if (kind === "athletic_website") {
    if (isSchoolHomepage(url, input.schoolWebsite)) {
      return {
        action: "reject",
        reason: "This is the school's own homepage, not its athletics site.",
        code: "school_homepage",
      };
    }
    if (newsPath(url)) {
      return {
        action: "reject",
        reason: "This is a news story, not an athletics site.",
        code: "news_page",
      };
    }
    if (junkSectionPath(url)) {
      return {
        action: "reject",
        reason: "This is a news, store or listings page, not the athletics home page.",
        code: "junk_section",
      };
    }
    if (looksLikeAthleticsHost(url, input.schoolWebsite)) {
      const home = athleticsHomeFor(url, input.schoolWebsite);
      const trimmed = home && home !== stripTrailingSlash(url) ? home : null;
      if (trimmed) {
        return {
          action: "approve",
          reason: "Athletics site found on a single team's page — saving the athletics home page.",
          code: "athletics_site_trimmed",
          normalizedUrl: trimmed,
        };
      }
      return {
        action: "approve",
        reason: "This is the school's athletics site.",
        code: "athletics_site",
      };
    }
    return ask;
  }


  if (wrongSportPath(url)) {
    return { action: "reject", reason: "This page is for a different sport.", code: "wrong_sport" };
  }
  if (archiveSeasonPath(url)) {
    return { action: "reject", reason: "This is an old season's page.", code: "old_season" };
  }
  if (newsPath(url)) {
    return { action: "reject", reason: "This is a news story, not a team page.", code: "news_page" };
  }

  const knownHosts = new Set(
    [input.athleticWebsite, ...(input.athleticHosts ?? [])]
      .map((entry) => hostOf(entry))
      .filter(Boolean),
  );
  const onKnownSite = knownHosts.has(hostOf(url));

  if (
    matchesProgramSport(url, input.sport ?? null) &&
    (onKnownSite || looksLikeAthleticsHost(url, input.schoolWebsite))
  ) {
    return {
      action: "approve",
      reason: onKnownSite
        ? "Correct sport, on the school's confirmed athletics site."
        : "Correct sport, on an athletics site.",
      code: "sport_page_on_known_site",
    };
  }

  return ask;
}

