/**
 * Read coach NAMES off a staff page, scoped to ONE sport.
 *
 * A department-wide staff directory is a perfectly good source — at many junior
 * colleges, NAIA and small-college programs it is the only place coaches are
 * listed. What is NOT allowed is taking every row on such a page and filing it
 * under the sport we asked for. LSU's directory lists the football and
 * basketball staffs; none of them coach softball.
 *
 * So a row is only extracted when the PAGE assigns that person to the requested
 * sport: a section/group heading naming the sport, or a title naming it
 * ("Baseball Head Coach"). On a page that is itself about one sport, the page
 * is the attribution. Anything unattributed is left alone.
 */

import { hasNonPersonWord, hasUiText } from "@/lib/person-words";

export type SportAttribution = "section_header" | "title" | "sport_page";

export type CoachRow = {
  name: string;
  title: string;
  isHead: boolean;
  /** Contact details found in the same cell as the title, kept as their own fields. */
  email: string | null;
  phone: string | null;
  /** The sport the PAGE assigned to this person. */
  sportOnPage: string;
  /** How the page assigned it. */
  attribution: SportAttribution;
  /** Whether the row came off a sport-specific page or a filtered directory. */
  sourceKind: PageKind;
};

export type PageKind = "sport_page" | "department_directory";

export type CoachShape = {
  headCoach: CoachRow | null;
  assistants: CoachRow[];
  /** Rows accepted for the requested sport, head coach included. */
  coaches: CoachRow[];
  pageKind: PageKind;
  /** Rows the page assigned to a different sport. */
  otherSportRows: Array<{ name: string; title: string; sportOnPage: string }>;
  /** Rows with a coaching title but no sport attribution anywhere on the page. */
  unattributed: Array<{ name: string; title: string }>;
  /** Why no head coach could be named for the requested sport. */
  failure: string | null;
  /** More than one row claimed the head job; every claimant, in page order. */
  headAmbiguity: Array<{ name: string; title: string }>;
  counts: {
    rows: number;
    titles: number;
    otherSport: number;
    unattributed: number;
  };
};

const HEAD_TITLE =
  /\bhead\s+([a-z'’]+\s+){0,3}coach\b|\bhead\s+(baseball|softball)\b|\bcoach\b[^|]{0,12}\bhead\b/i;

/**
 * "Associate Head Coach" and "Assistant Head Coach" are NOT the head coach.
 * A page that lists an associate above the head coach used to hand us the wrong
 * person, because the first head-ish match in page order won. "Interim Head
 * Coach" IS the head coach.
 */
const NOT_THE_HEAD = /\b(associate|assoc\.?|assistant|asst\.?|deputy|co-?head|volunteer)\b/i;

/** The unqualified job: "Head Coach", "Head Baseball Coach", "Interim Head Coach". */
const PLAIN_HEAD =
  /^(interim\s+)?head\s+(baseball\s+|softball\s+|women'?s\s+|men'?s\s+)?coach$/i;

function isHeadTitle(title: string): boolean {
  if (NOT_THE_HEAD.test(title)) return false;
  return HEAD_TITLE.test(title);
}

const ANY_TITLE =
  /\b(head coach|associate head coach|assistant coach|assistant|pitching coach|hitting coach|catching coach|infield coach|outfield coach|bench coach|volunteer coach|volunteer assistant|recruiting coordinator|director of operations|director of player development|graduate assistant|student assistant|student manager|athletic trainer|trainer|strength and conditioning|sports performance|analyst|manager|coordinator|coach)\b/i;

const SPORT_WORDS =
  /\b(baseball|softball|football|men'?s basketball|women'?s basketball|basketball|men'?s soccer|women'?s soccer|soccer|volleyball|beach volleyball|tennis|golf|track (?:and|&) field|track|cross country|swimming(?: and diving)?|diving|wrestling|lacrosse|ice hockey|hockey|rowing|cheer(?:leading)?|pom|dance|esports|bowling|rugby|water polo|gymnastics|equestrian|field hockey|athletic training|sports medicine|administration|compliance|marketing|business office|facilities|communications|development|ticket(?: office)?)\b/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

function normalizeSport(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").replace(/’/g, "'").trim();
}

function sportIn(text: string): string | null {
  const match = text.match(SPORT_WORDS);
  return match ? normalizeSport(match[0]) : null;
}

/** "softball" matches "women's softball"; "baseball" never matches "softball". */
function sameSport(pageSport: string, wanted: string): boolean {
  if (!wanted) return false;
  const a = normalizeSport(pageSport);
  const b = normalizeSport(wanted);
  if (a === b) return true;
  return a.endsWith(` ${b}`) || b.endsWith(` ${a}`);
}

function stripMarkup(raw: string): string {
  return raw
    .trim()
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-–*•\s]+/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/**
 * Is this a human name? The old version only ruled things OUT, so ordinary
 * capitalised English ("Close consent manager", "All Videos") sailed through.
 * Now the value must positively look like a name — two to four capitalised
 * name words — and must not be page furniture, a job title, or a link/nav item.
 */
function personName(raw: string, options: { role?: string | null } = {}): string | null {
  const value = stripMarkup(raw);
  if (value.length < 4 || value.length > 48) return null;
  if (/[0-9@|]|https?:/i.test(value)) return null;

  // The element's own role, where the page gave us one, settles it outright.
  const role = String(options.role ?? "").toLowerCase();
  if (role && /link|button|navigation|menu|banner|dialog|search|tab/.test(role)) return null;

  const words = value.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  // Every part must read like a name word: capitalised, letters only.
  if (!words.every((word) => /^[A-Z][A-Za-z.'’-]*$/.test(word) || /^(de|la|van|von|del|di|da|dos|el|st\.?)$/i.test(word))) {
    return null;
  }
  if (ANY_TITLE.test(value)) return null;
  if (hasUiText(value)) return null;
  if (hasNonPersonWord(value)) return null;
  return value;
}

/** A line that is a link somewhere else, a bullet nav item or a heading. */
function navLike(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^[-*•]\s*!?\[/.test(trimmed)) return true;
  // The whole line is one markdown link to another page.
  if (/^!?\[[^\]]*\]\([^)]*\)$/.test(trimmed)) return true;
  if (hasUiText(trimmed)) return true;
  if (ANY_TITLE.test(trimmed)) return true;
  return false;
}

function titleIn(text: string): { title: string; email: string | null; phone: string | null } | null {
  const match = text.match(ANY_TITLE);
  if (!match) return null;
  const cell = text.replace(/\s+/g, " ").trim();

  // "Head Coach hannahsm@usf.edu" is a title AND an email address. Keep both,
  // in their own fields — contact details are useful, they just aren't a title.
  const email = cell.match(EMAIL)?.[0] ?? null;
  const withoutEmail = email ? cell.replace(email, " ") : cell;
  const phone = withoutEmail.match(PHONE)?.[0]?.trim() ?? null;
  const cleaned = (phone ? withoutEmail.replace(phone, " ") : withoutEmail)
    .replace(/\s+/g, " ")
    .replace(/[\s,;:|·•\-–]+$/, "")
    .replace(/^[\s,;:|·•\-–]+/, "")
    .trim();

  const title = cleaned.length && cleaned.length <= 60 ? cleaned : match[0];
  return { title, email, phone };
}

/** Is this line a group heading (a sport name standing on its own)? */
function sectionSport(line: string): string | null {
  const bare = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.replace(/\*\*/g, "").trim())
    .filter(Boolean);
  if (bare.length !== 1) return null;
  const text = bare[0]!;
  if (text.length > 40) return null;
  if (ANY_TITLE.test(text)) return null;
  const sport = sportIn(text);
  if (!sport) return null;
  // The heading must be essentially just the sport name.
  const rest = text.toLowerCase().replace(sport, "").replace(/[^a-z]/g, "");
  return rest.length <= 6 ? sport : null;
}

/** Decide whether the page is about one sport or the whole department. */
export function classifyStaffPage(input: {
  url?: string | null | undefined;
  text?: string | null | undefined;
  sport?: string | null | undefined;
}): { kind: PageKind; reason: string } {
  const url = String(input.url ?? "");
  const sport = normalizeSport(String(input.sport ?? ""));
  const sportInUrl = sport ? new RegExp(sport.replace(/[^a-z]/g, ""), "i").test(url.replace(/[^a-z]/gi, "")) : false;
  const directoryUrl = /staff-?directory|staff_directory|department-?directory|administration|our-?staff/i.test(url);

  if (sportInUrl && !directoryUrl) {
    return { kind: "sport_page", reason: "the address names the sport" };
  }
  if (directoryUrl) {
    return { kind: "department_directory", reason: "the address is a department-wide staff directory" };
  }
  // Fall back to the page itself: several sports named in headings means a directory.
  const headings = new Set<string>();
  for (const line of String(input.text ?? "").split("\n")) {
    const found = sectionSport(line.trim());
    if (found) headings.add(found);
  }
  if (headings.size > 1) {
    return { kind: "department_directory", reason: `the page groups ${headings.size} different sports` };
  }
  return { kind: "sport_page", reason: "the page covers a single sport" };
}

/**
 * Pull name/title pairs for ONE sport off a staff page.
 */
export function extractCoaches(
  text: string | null | undefined,
  sport?: string | null,
  options: { url?: string | null | undefined } = {},
): CoachShape {
  const wanted = normalizeSport(String(sport ?? ""));
  const body = String(text ?? "");
  const { kind } = classifyStaffPage({ url: options.url, text: body, sport: wanted });

  // Blank lines are kept: they are the card/block boundaries the neighbour-line
  // fallback needs, so a nav item three blocks away can't become a coach.
  const all = body.split("\n").map((line) => line.replace(/\s+/g, " ").trim());

  const coaches: CoachRow[] = [];
  const otherSportRows: CoachShape["otherSportRows"] = [];
  const unattributed: CoachShape["unattributed"] = [];
  const seen = new Set<string>();
  let titles = 0;
  let currentSection: string | null = null;

  const headAmbiguity: CoachShape["headAmbiguity"] = [];

  const push = (
    name: string,
    found: { title: string; email: string | null; phone: string | null },
    sportOnPage: string | null,
    attribution: SportAttribution | null,
  ) => {
    let title = found.title;
    // Cell text often repeats the person's name before the job.
    title = title.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s,–-]*`, "i"), "").trim() || title;
    // A row whose name IS its title is not a person at all.
    if (title.toLowerCase() === name.toLowerCase()) return;
    const key = `${name.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (!sportOnPage || !attribution) {
      unattributed.push({ name, title });
      return;
    }
    if (!sameSport(sportOnPage, wanted)) {
      otherSportRows.push({ name, title, sportOnPage });
      return;
    }
    coaches.push({
      name,
      title,
      isHead: isHeadTitle(title),
      email: found.email,
      phone: found.phone,
      sportOnPage,
      attribution,
      sourceKind: kind,
    });
  };

  all.forEach((line, index) => {
    if (!line) return;
    const heading = sectionSport(line);
    if (heading) {
      currentSection = heading;
      return;
    }

    const cells = line.includes("|")
      ? line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
      : [line];
    if (cells.every((cell) => /^[\s:-]*$/.test(cell))) return;

    const joined = cells.join(" ");
    const rowTitle = titleIn(joined);
    if (!rowTitle) return;
    titles += 1;

    // Sport named in the row itself (title or an adjacent sport cell) wins.
    const titleSport = sportIn(joined);
    const sportOnPage = titleSport ?? currentSection ?? (kind === "sport_page" ? wanted || null : null);
    const attribution: SportAttribution | null = titleSport
      ? "title"
      : currentSection
        ? "section_header"
        : kind === "sport_page" && wanted
          ? "sport_page"
          : null;

    let named = false;
    for (const cell of cells) {
      const name = personName(cell);
      if (name) {
        push(name, rowTitle, sportOnPage, attribution);
        named = true;
        break;
      }
    }
    if (!named) {
      // Title on its own line: the person is usually the line immediately
      // before or after — but only within the same table row or card block.
      // An empty line between them means a different block; a link, a nav item
      // or another title is not a person. That is how "Skip To Main Content"
      // and "All Videos" used to become coaches.
      const isTableRow = line.includes("|");
      for (const candidate of [all[index - 1], all[index + 1]]) {
        if (!candidate) continue;
        if (candidate.includes("|") !== isTableRow) continue;
        if (navLike(candidate)) continue;
        const name = personName(candidate);
        if (name) {
          push(name, rowTitle, sportOnPage, attribution);
          break;
        }
      }
    }
  });

  // Page order alone used to decide this, so an associate listed above the head
  // coach won. Prefer the plain, unqualified "Head Coach" title, and report any
  // remaining contest instead of guessing.
  const heads = coaches.filter((coach) => coach.isHead);
  const plain = heads.filter((coach) => PLAIN_HEAD.test(coach.title));
  const shortlist = plain.length ? plain : heads;
  if (heads.length > 1) {
    for (const coach of heads) headAmbiguity.push({ name: coach.name, title: coach.title });
  }
  const headCoach = shortlist.length === 1 ? shortlist[0]! : null;
  const assistants = coaches.filter((coach) => coach !== headCoach);

  let failure: string | null = null;
  if (!headCoach && shortlist.length > 1) {
    failure = `${shortlist.length} people on the page carry a head coach title (${shortlist
      .map((coach) => `${coach.name} — ${coach.title}`)
      .join("; ")}), so none can be stored`;
  } else if (!headCoach) {
    failure = coaches.length
      ? `${coaches.length} ${wanted || "sport"} staff read but no head coach title among them`
      : otherSportRows.length
        ? `the page lists ${otherSportRows.length} staff, none of them assigned to ${wanted || "this sport"}`
        : unattributed.length
          ? `${unattributed.length} staff on the page but none is assigned to a sport, so none can be filed under ${wanted || "this sport"}`
          : "the page carries no coaching titles at all";
  }

  return {
    headCoach,
    assistants,
    headAmbiguity,
    coaches,
    pageKind: kind,
    otherSportRows,
    unattributed,
    failure,
    counts: {
      rows: coaches.length,
      titles,
      otherSport: otherSportRows.length,
      unattributed: unattributed.length,
    },
  };
}

/**
 * A department-wide directory is a valid source, so this no longer refuses one —
 * it only reports what kind of page the address is, for the record.
 */
export function looksLikeDepartmentDirectory(input: {
  url: string | null | undefined;
  text?: string | null;
  sport?: string | null;
}): { ok: boolean; kind: PageKind; reason: string } {
  const { kind, reason } = classifyStaffPage(input);
  return { ok: true, kind, reason };
}
