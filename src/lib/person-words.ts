/**
 * One shared answer to "is this text a person's name?".
 *
 * There used to be two separate lists — one in the coach extractor, one in the
 * coach guard — with different contents, so a value could be refused on the way
 * in and accepted on the way out (or the reverse). They are merged here so they
 * can never drift apart again.
 *
 * Note what is NOT on this list: "interim". An interim head coach is a real
 * person with a real job; "interim" belongs to the TITLE, not the name, and is
 * handled there.
 */

/** Words that mean we read a job title, a department or a placeholder. */
export const NOT_A_PERSON_WORDS = [
  "coach",
  "staff",
  "director",
  "coordinator",
  "athletic",
  "athletics",
  "department",
  "university",
  "college",
  "baseball",
  "softball",
  "roster",
  "schedule",
  "vacant",
  "tba",
  "tbd",
  "position",
  "open",
  "unknown",
  "n/a",
  "none",
  "assistant",
  "contact",
  "email",
  "phone",
  "twitter",
  "bio",
] as const;

/**
 * Page furniture. These are the words that let "Skip To Main Content",
 * "All Videos" and "Close consent manager" be stored as coaches: they pass any
 * shape test for a name, because they are ordinary capitalised English.
 */
export const UI_TEXT_WORDS = [
  "consent",
  "cookie",
  "cookies",
  "skip",
  "main content",
  "menu",
  "navigation",
  "nav",
  "videos",
  "video",
  "tickets",
  "ticket",
  "shop",
  "store",
  "watch",
  "listen",
  "subscribe",
  "search",
  "login",
  "log in",
  "sign in",
  "sign up",
  "share",
  "toggle",
  "view all",
  "more",
  "home",
  "close",
  "accept",
  "settings",
  "privacy",
  "sitemap",
  "skip to",
  "read more",
  "learn more",
  "all videos",
] as const;

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Whole word, allowing an ordinary plural/inflected ending ("coaches"). */
function wordish(word: string): RegExp {
  return new RegExp(`(^|[^a-z])${escape(word)}[a-z]{0,3}([^a-z]|$)`, "i");
}

/** Exact word only — "More" is furniture, "Moreno" is a surname. */
function exactWord(word: string): RegExp {
  return new RegExp(`(^|[^a-z])${escape(word)}([^a-z]|$)`, "i");
}

/** Does this text contain a title/department/placeholder word? */
export function hasNonPersonWord(value: string): boolean {
  const lowered = value.toLowerCase();
  return NOT_A_PERSON_WORDS.some((word) => wordish(word).test(lowered));
}

/** Does this text read like a button, a menu item or a banner? */
export function hasUiText(value: string): boolean {
  const lowered = value.toLowerCase();
  return UI_TEXT_WORDS.some((word) => exactWord(word).test(lowered));
}
