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
  "beach",
];

const OUR_SPORTS = ["baseball", "softball", "bsb", "sball", "wsb"];

const JUNK_HOST_FRAGMENTS = [
  "smartcatalogiq",
  "wikipedia.org",
  "facebook.com",
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
  return JUNK_HOST_FRAGMENTS.some((fragment) => host.includes(fragment));
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
    | "school_homepage"
    | "sport_page_on_known_site"
    | "needs_a_look";
};

export function classifyLink(input: {
  kind: LinkKind;
  url: string | null | undefined;
  sport?: string | null;
  schoolWebsite?: string | null;
  /** The program's already-saved athletics site, when there is one. */
  athleticWebsite?: string | null;
}): LinkVerdict {
  const { kind, url } = input;
  const ask: LinkVerdict = { action: "ask", reason: "Needs a look.", code: "needs_a_look" };
  if (!url) return ask;

  if (junkHost(url)) {
    return { action: "reject", reason: "Not a school athletics site.", code: "junk_host" };
  }

  if (kind === "athletic_website") {
    if (isSchoolHomepage(url, input.schoolWebsite)) {
      return {
        action: "reject",
        reason: "This is the school's own homepage, not its athletics site.",
        code: "school_homepage",
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

  if (
    matchesProgramSport(url, input.sport ?? null) &&
    input.athleticWebsite &&
    hostOf(url) === hostOf(input.athleticWebsite)
  ) {
    return {
      action: "approve",
      reason: "Correct sport, on the school's confirmed athletics site.",
      code: "sport_page_on_known_site",
    };
  }

  return ask;
}
