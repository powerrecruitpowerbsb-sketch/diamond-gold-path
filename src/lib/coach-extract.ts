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

export type SportAttribution = "section_header" | "title" | "sport_page";

export type CoachRow = {
  name: string;
  title: string;
  isHead: boolean;
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
  counts: {
    rows: number;
    titles: number;
    otherSport: number;
    unattributed: number;
  };
};

const HEAD_TITLE =
  /\bhead\s+([a-z'’]+\s+){0,3}coach\b|\bhead\s+(baseball|softball)\b|\bcoach\b[^|]{0,12}\bhead\b/i;

const ANY_TITLE =
  /\b(head coach|associate head coach|assistant coach|assistant|pitching coach|hitting coach|catching coach|infield coach|outfield coach|bench coach|volunteer coach|volunteer assistant|recruiting coordinator|director of operations|director of player development|graduate assistant|student assistant|student manager|athletic trainer|trainer|strength and conditioning|sports performance|analyst|manager|coordinator|coach)\b/i;

const SPORT_WORDS =
  /\b(baseball|softball|football|men'?s basketball|women'?s basketball|basketball|men'?s soccer|women'?s soccer|soccer|volleyball|beach volleyball|tennis|golf|track (?:and|&) field|track|cross country|swimming(?: and diving)?|diving|wrestling|lacrosse|ice hockey|hockey|rowing|cheer(?:leading)?|pom|dance|esports|bowling|rugby|water polo|gymnastics|equestrian|field hockey|athletic training|sports medicine|administration|compliance|marketing|business office|facilities|communications|development|ticket(?: office)?)\b/i;

const NOT_A_PERSON =
  /(coach|staff|director|coordinator|athletic|department|university|college|baseball|softball|roster|schedule|vacant|tba|tbd|full bio|email|phone|twitter)/i;

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

function personName(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-–*•\s]+/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
  if (value.length < 4 || value.length > 48) return null;
  if (/[0-9@|]|https?:/i.test(value)) return null;
  if (!/^[A-Z][A-Za-z.'’-]*(\s+[A-Za-z.'’-]+){1,3}$/.test(value)) return null;
  if (NOT_A_PERSON.test(value)) return null;
  return value;
}

function titleIn(text: string): string | null {
  const match = text.match(ANY_TITLE);
  if (!match) return null;
  // Keep the whole cell as the title where it reads like one, so
  // "Head Softball Coach" survives instead of collapsing to "coach".
  const cell = text.replace(/\s+/g, " ").trim();
  return cell.length <= 60 ? cell : match[0];
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

  const lines = body
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const coaches: CoachRow[] = [];
  const otherSportRows: CoachShape["otherSportRows"] = [];
  const unattributed: CoachShape["unattributed"] = [];
  const seen = new Set<string>();
  let titles = 0;
  let currentSection: string | null = null;

  const push = (
    name: string,
    title: string,
    sportOnPage: string | null,
    attribution: SportAttribution | null,
  ) => {
    // Cell text often repeats the person's name before the job.
    title = title.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s,–-]*`, "i"), "").trim() || title;
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
      isHead: HEAD_TITLE.test(title),
      sportOnPage,
      attribution,
      sourceKind: kind,
    });
  };

  lines.forEach((line, index) => {
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
      // Title on its own line: the person is usually the line before or after.
      for (const candidate of [lines[index - 1], lines[index + 1]]) {
        const name = candidate ? personName(candidate) : null;
        if (name) {
          push(name, rowTitle, sportOnPage, attribution);
          break;
        }
      }
    }
  });

  const headCoach = coaches.find((coach) => coach.isHead) ?? null;
  const assistants = coaches.filter((coach) => !coach.isHead);

  let failure: string | null = null;
  if (!headCoach) {
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
