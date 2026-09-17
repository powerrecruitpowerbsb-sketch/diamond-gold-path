/**
 * Structural roster reading.
 *
 * Roster counts used to be judged by size, which is wrong: NAIA and junior
 * college squads run 60-80, fall rosters are bigger than spring, and a D1 fall
 * squad exceeds the spring 40-man limit. A big roster is not a defect. What IS a
 * defect is page furniture — navigation, related stories, other sports, a second
 * season stacked on the same page — being counted as players.
 *
 * So every row is judged on its own shape: a player needs a name plus at least
 * one of jersey number, position or class year. A bare name is not a player.
 */

import { splitHometown } from "./hometown-split";



export type PlayerRow = {
  name: string;
  number: string | null;
  position: string | null;
  class_year: string | null;
  height: string | null;
  weight: string | null;
  hometown: string | null;
  /** Two-letter state or province, split off the hometown. */
  home_state: string | null;
  /** Two-letter country code. US territories count as US. */
  home_country: string | null;
  /** The school named as the player's previous stop, when the page names one. */
  previous_school: string | null;
  is_transfer: boolean;
  /** Only ever true on an explicit junior-college signal from the page. */
  is_juco_transfer: boolean;
  /** Batting side: R, L or S (switch). */
  bats: string | null;
  /** Throwing arm: R or L. */
  throws: string | null;
  /**
   * Exactly what the page printed, before our mapping. Kept so an unrecognised
   * wording is countable and fixable offline instead of by another crawl.
   */
  position_raw: string | null;
  class_year_raw: string | null;
  bats_raw: string | null;
  throws_raw: string | null;
};

export type RosterAttribute =
  | "number"
  | "position"
  | "class_year"
  | "height"
  | "weight"
  | "hometown"
  | "home_state"
  | "home_country"
  | "transfer"
  | "bats"
  | "throws";

/**
 * Three distinct states, so a coach can be told "this school doesn't publish
 * hometowns" instead of being left to infer the team has no out-of-state players:
 *  - published: the page offers the column
 *  - not_published: the page does not carry it at all
 *  - unknown: we could not tell what the page offers (no header, no labels)
 */
export type ColumnState = "published" | "not_published" | "unknown";

export type RosterShape = {
  /** Rows accepted as players. */
  players: PlayerRow[];
  /** Names that carried nothing else — dropped. */
  bareNames: string[];
  /** Rows dropped because the name is navigation, a staff title or a headline. */
  furniture: string[];
  /** Names appearing more than once — usually two seasons merged. */
  duplicates: string[];
  /** Season headings found on the page, in page order. */
  seasons: string[];
  /** Other sports named by headings on the page. */
  otherSports: string[];
  /** What the PAGE offers, per attribute. */
  columns: Record<RosterAttribute, ColumnState>;
  /** Attributes the page publishes that we extracted for nobody — parser defects. */
  parserDefects: RosterAttribute[];
  counts: {
    rowsConsidered: number;
    players: number;
    withNumber: number;
    withPosition: number;
    withClass: number;
    withHeightWeight: number;
    withHometown: number;
    withState: number;
    withCountry: number;
    withTransfer: number;
    withJucoTransfer: number;
    withPreviousSchool: number;
    withBats: number;
    withThrows: number;
    bareNames: number;
    furniture: number;
    duplicates: number;
  };
  /** Shape problems, in plain language. Empty means the parse looks sound. */
  flags: string[];
};


const CLASS_MAP: Array<[RegExp, string]> = [
  // Spelled-out forms are listed in full: "jr" + "unior" never spelled "Junior",
  // so writing them as one optional suffix silently dropped Junior and Senior.
  [/^(r-?)?(fr\.?|freshman)$/i, "FR"],
  [/^(r-?)?(so\.?|soph\.?|sophomore)$/i, "SO"],
  [/^(r-?)?(jr\.?|junior)$/i, "JR"],
  [/^(r-?)?(sr\.?|senior)$/i, "SR"],
  [/^(gr|grad(uate)?|graduate student|5th year|gs)\.?$/i, "GR"],
  [/^redshirt\s+(freshman|sophomore|junior|senior)$/i, ""],
];


const POSITION_TOKEN =
  /^(rhp|lhp|p|sp|rp|c|1b|2b|3b|ss|inf|if|mif|cif|of|lf|cf|rf|dh|util|utl|uti|ut|two-?way|pitcher|catcher|infielder|outfielder|utility|right-?handed pitcher|left-?handed pitcher|first base(man)?|second base(man)?|third base(man)?|shortstop|middle infield(er)?|corner infield(er)?|designated hitter)$/i;

/**
 * Positions are often combined: "IF/OF/P", "UTL/P". Accept a cell where every
 * slash-separated part is a position, and never a bare "L/L" bats/throws cell.
 */
const POSITION_WORDS = {
  test(value: string): boolean {
    const parts = value.trim().split(/\s*\/\s*/).filter(Boolean);
    if (!parts.length || parts.length > 4) return false;
    if (parts.every((part) => /^[lrs]$/i.test(part))) return false;
    return parts.every((part) => POSITION_TOKEN.test(part));
  },
};


/**
 * Navigation, section and story text that shows up in the same tables as players.
 *
 * Every alternative is anchored on BOTH sides. Unanchored "more", "all", "news"
 * and "store" were matching ordinary surnames — Hall, Marshall, Small, Wall,
 * Ball, Randall, Kendall, Crandall, Whitmore, Sizemore, Newsome, Storey — and
 * silently deleting real players from rosters we had already called correct.
 *
 * It is also only ever run against the ROW, never against a person's name:
 * furniture is a property of where the text came from (a nav link, a heading, a
 * story), not of somebody's surname.
 */
const FURNITURE =
  /\b(roster|schedule|stats|standings|tickets|shop|news|store|coaches|staff|directory|facilities|camps|donate|giving|social|instagram|twitter|facebook|youtube|privacy|terms|sitemap|search|menu|skip to|main content|composite|archive|history|records|awards|honors|gameday|watch|listen|live stats|box score|recap|preview|announce|signs|signed|commits|committed|hires|hired|named|full bio|view profile|hide\/show|photo gallery|more|all)\b/i;

/** Strip markdown link targets — "/sports/baseball/roster/john-hall" is not furniture text. */
function rowText(line: string): string {
  return line.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/**
 * Is this ROW page furniture rather than a player? Judged on the row's origin: a
 * heading, a bullet/nav link, or a line of navigation or story text.
 */
function rowIsFurniture(line: string, hasPlayerAttribute = false): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^[-*•]\s*!?\[/.test(trimmed)) return true;
  // A row carrying a jersey number, position or class is a player row, even when
  // it also holds a "Full Bio" or "View Profile" link. Only rows with no player
  // attribute at all are judged on their words.
  if (hasPlayerAttribute) return false;
  return FURNITURE.test(rowText(trimmed));
}

const STAFF_TITLE =
  /(head coach|assistant coach|associate coach|pitching coach|hitting coach|volunteer|coordinator|director|manager|trainer|athletic trainer|strength|operations|graduate assistant|student assistant|analyst|scout)/i;

const SPORTS =
  /\b(baseball|softball|football|basketball|soccer|volleyball|tennis|golf|track|cross country|swim(ming)?|dive|diving|wrestling|lacrosse|hockey|rowing|cheer|pom|dance|esports|bowling|rugby|water polo|gymnastics|equestrian|beach volleyball|field hockey)\b/gi;

function classYear(cell: string): string | null {
  const trimmed = cell.trim();
  for (const [pattern, code] of CLASS_MAP) {
    if (pattern.test(trimmed)) {
      if (code) return code;
      const word = trimmed.replace(/^redshirt\s+/i, "");
      return classYear(word);
    }
  }
  return null;
}

function jerseyNumber(cell: string): string | null {
  const trimmed = cell.trim().replace(/^#/, "");
  return /^\d{1,3}$/.test(trimmed) ? trimmed : null;
}

function heightValue(cell: string): string | null {
  const trimmed = cell.trim();
  return /^\d['’-]\s?\d{1,2}["”']?$/.test(trimmed) || /^\d-\d{1,2}$/.test(trimmed) ? trimmed : null;
}

function weightValue(cell: string): string | null {
  const trimmed = cell.trim().replace(/\s*lbs?\.?$/i, "");
  if (!/^\d{2,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 100 && value <= 400 ? trimmed : null;
}

/** State/province/country tails, so "Smith, John" is never read as a hometown. */
const PLACE_TAIL =
  /^(ala|alaska|ariz|ark|calif|cal|colo|conn|del|fla|ga|hawaii|idaho|ill|ind|iowa|kan|kans|ky|la|maine|md|mass|mich|minn|miss|mo|mont|neb|nebr|nev|ohio|okla|ore|pa|penn|tenn|texas|tex|utah|vt|va|wash|wis|wisc|wyo|d\.?c|n\.?[hjmycd]|r\.?i|s\.?[cd]|w\.?va|[A-Z]{2}|canada|japan|mexico|australia|puerto rico|dominican republic|venezuela|cuba|panama|colombia|curacao|curaçao|bahamas|germany|england|netherlands|aruba|nicaragua|brazil|taiwan|korea|ontario|ont|quebec|que|alberta|alta|british columbia|b\.?c|manitoba|man|saskatchewan|sask|nfld|n\.?[bs]|p\.?e\.?i)\.?$/i;

function hometownValue(cell: string, options: { inHometownColumn?: boolean } = {}): string | null {
  // Pages often print "Hometown / High School" or "Hometown / Last School" in
  // one cell; the town and state are the part before the first slash.
  const trimmed = cell.trim().split(/\s+\/\s+/)[0]!.trim();
  const comma = trimmed.match(/^([A-Za-z .'’-]{2,40}),\s?([A-Za-z .]{2,30})$/);
  if (comma && (PLACE_TAIL.test(comma[2]!.trim()) || options.inHometownColumn)) return trimmed;
  // Under a hometown column, a town with no comma is still a hometown —
  // single-town entries and many international formats carry no state.
  if (options.inHometownColumn && /^[A-Za-z][A-Za-z .'’-]{1,40}$/.test(trimmed) && !POSITION_WORDS.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Bats and throws. Pages print them three ways:
 *   - one combined cell, bats first and throws second: "R/R", "L/R", "S/R", "B-R"
 *   - two cells under Bats and Throws headers, a single letter each
 *   - a labelled card line: "Bats/Throws R/L", "Bats: L  Throws: R"
 * "B" (both) and "S" both mean a switch hitter and are stored as S. Throwing has
 * no switch, so a second letter of S is refused rather than guessed at.
 */
const BATS_THROWS_CELL = /^([LRSB])\s*[/\\-]\s*([LR])$/i;

function batsSide(value: string): string | null {
  const letter = value.trim().toUpperCase();
  if (letter === "B") return "S";
  return /^[LRS]$/.test(letter) ? letter : null;
}

function throwsSide(value: string): string | null {
  const letter = value.trim().toUpperCase();
  return /^[LR]$/.test(letter) ? letter : null;
}

/** A combined bats/throws cell, or null when the cell is something else. */
function batsThrowsCell(cell: string): { bats: string | null; throws: string | null } | null {
  const match = cell.trim().match(BATS_THROWS_CELL);
  if (!match) return null;
  return { bats: batsSide(match[1]!), throws: throwsSide(match[2]!) };
}

const NAME_SHAPE = /^[A-Z][A-Za-z.'’-]*(\s+[A-Za-z.'’-]+){1,3}$/;

/**
 * A column label is not a player. Eckerd's table header ran into the first data
 * row and "High School" was stored as a player with hometown "Hometown".
 */
const COLUMN_LABEL =
  /^(full\s+name|name|player|athlete|image|photo|jersey(\s+number)?|number|position|pos|class|class\s+year|academic\s+year|height|weight|hometown|home\s?town|high\s+school|previous\s+school|last\s+school|club\s+team|bats\s*\/?\s*throws|custom\s+field(\s*\d+)?|connect|roster|hometown\s*\/\s*high\s+school)$/i;

/** Two to four capitalised words, no digits. "Last, First" is normalised. */
function personName(cell: string): string | null {
  let raw = cell
    .trim()
    // A name is usually a link to the player's bio: read the link text.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s*\((.*)\)$/, "")
    .trim();
  if (raw.length < 4 || raw.length > 48) return null;
  if (/[0-9@|]|https?:/i.test(raw)) return null;
  if (COLUMN_LABEL.test(raw)) return null;


  // Rosters printed "Smith, John" or "O'Brien, Pat Michael" used to parse as an
  // empty page. Flip them to "First Last".
  const inverted = raw.match(/^([A-Z][A-Za-z.'’-]+(?:\s+(?:de|la|van|von|del|di|da|St\.?)\s*[A-Za-z.'’-]+)?),\s*([A-Za-z.'’-]+(?:\s+[A-Za-z.'’-]+){0,2})$/);
  if (inverted) raw = `${inverted[2]!.trim()} ${inverted[1]!.trim()}`;
  if (raw.includes(",")) return null;

  if (!NAME_SHAPE.test(raw)) return null;
  return raw;
}

function splitCells(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.startsWith("|") || trimmed.split("|").length >= 3) {
    return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  }
  if (trimmed.includes("\t")) return trimmed.split("\t").map((c) => c.trim());
  return [];
}

// A markdown separator row: dashes and colons only. It MUST carry a dash or a
// colon. The looser form also matched a row whose first cell was simply empty
// ("| | MIF/RHP | R/R | ..."), so every wrapped table row on pages that print
// the jersey number on its own line was thrown away as furniture and the whole
// squad fell back to a card view carrying names and numbers alone.
const SEPARATOR = /^\|?[\s]*[-:][-:\s]*\|/;


/** The hometown column header, so a comma-less town under it is still a town. */
const HOMETOWN_HEADER = /^(hometown|home\s?town|hometown\s*\/.*|hometown\s*\(.*\)|hometown\/high school|hometown \/ last school)$/i;

/** Header words and card labels that mean the page offers a given column. */
const COLUMN_WORDS: Array<[RosterAttribute, RegExp]> = [
  ["number", /^(no\.?|#|num(ber)?|jersey(\s+number)?)$/i],
  ["position", /^(pos\.?|position(s)?|pos\/b-t)$/i],
  ["class_year", /^(cl\.?|class(\s+year)?|yr\.?|year|academic\s+year|eligibility|exp\.?|experience)$/i],
  ["height", /^(ht\.?|height)$/i],
  ["weight", /^(wt\.?|weight)$/i],
  ["hometown", /^(hometown|home\s?town|hometown\s*\/.*|hometown\s*\(.*\)|hometown\/high school|hometown \/ last school)$/i],
  ["bats", /^(b|bats|bat|b\s*[/-]\s*t|bats\s*[/-]\s*throws|pos\s*\/\s*b-?t)\.?$/i],
  ["throws", /^(t|throws|throw|b\s*[/-]\s*t|bats\s*[/-]\s*throws|pos\s*\/\s*b-?t)\.?$/i],
  ["transfer", /^((previous|last|prior|former)\s+(school|college|institution)|transfer(red)?(\s+from)?|junior\s+college|juco|jc)$/i],
];

/** Headers that carry bats and throws in one cell. */
const BATS_THROWS_HEADER = /^(b\s*[/-]\s*t|bats\s*[/-]\s*throws|pos\s*\/\s*b-?t)\.?$/i;
const BATS_HEADER = /^(b|bats|bat)\.?$/i;
const THROWS_HEADER = /^(t|throws|throw)\.?$/i;

/** A column naming where the player came from — the transfer signal. */
const PREVIOUS_SCHOOL_HEADER =
  /^((previous|last|prior|former)\s+(school|college|institution)|transfer(red)?(\s+from)?|junior\s+college|juco|jc)$/i;

/** A class or note cell that says "transfer" outright. */
const TRANSFER_TOKEN = /^(tr|transf(er)?|xfer|transfer\s+student)\.?$/i;
const JUCO_TOKEN = /^(jc|juco|jr\.?\s*college|junior\s+college|juco\s+transfer)\.?$/i;

const ALL_ATTRIBUTES: RosterAttribute[] = [
  "number",
  "position",
  "class_year",
  "height",
  "weight",
  "hometown",
  "home_state",
  "home_country",
  "transfer",
  "bats",
  "throws",
];

/**
 * Which columns does the PAGE offer? Read from the table header where there is
 * one, and from card labels ("Hometown Tampa, FL") otherwise. A page that never
 * declares its columns leaves them "unknown" rather than pretending.
 */
function detectColumns(lines: string[]): Record<RosterAttribute, ColumnState> {
  const published = new Set<RosterAttribute>();
  let headerSeen = false;

  lines.forEach((line, index) => {
    const cells = splitCells(line);
    if (cells.length >= 2) {
      const isHeader =
        cells.some((cell) => /^(name|player|athlete)$/i.test(cell)) ||
        COLUMN_WORDS.filter(([, pattern]) => cells.some((cell) => pattern.test(cell))).length >= 2 ||
        SEPARATOR.test(lines[index + 1] ?? "");
      if (isHeader) {
        let matched = false;
        for (const [attribute, pattern] of COLUMN_WORDS) {
          if (cells.some((cell) => pattern.test(cell))) {
            published.add(attribute);
            matched = true;
          }
        }
        if (matched || cells.some((cell) => /^(name|player|athlete)$/i.test(cell))) headerSeen = true;
      }
    }
    // Card labels. These must look like a LABEL — the word standing alone in a
    // cell, or followed by a colon — not merely the word appearing somewhere on
    // the page. A filter menu or a sort control saying "Height" is not evidence
    // that the page publishes heights, and treating it as such invented a
    // "parser defect" on pages we had in fact read correctly.
    const label = (word: string) =>
      new RegExp(`(^|\\|)\\s*${word}\\s*(:|\\||$)`, "i").test(line) ||
      new RegExp(`\\b${word}\\s*:`, "i").test(line);
    if (/\bjersey(\s+number)?\s*:|^no\.?\s*#?\d/i.test(line) || label("jersey")) published.add("number");
    if (label("position") || label("pos\\.?")) published.add("position");
    if (/\b(academic year|class year|class:|year:)\b/i.test(line)) published.add("class_year");
    if (label("height") || label("ht\\.?")) published.add("height");
    if (label("weight") || label("wt\\.?")) published.add("weight");
    if (label("hometown") || label("home\\s?town")) published.add("hometown");
    if (label("bats\\s*/\\s*throws") || label("b\\s*/\\s*t")) {
      published.add("bats");
      published.add("throws");
    }
    if (label("bats")) published.add("bats");
    if (label("throws")) published.add("throws");


  });

  const columns = {} as Record<RosterAttribute, ColumnState>;
  for (const attribute of ALL_ATTRIBUTES) {
    columns[attribute] = published.has(attribute) ? "published" : headerSeen ? "not_published" : "unknown";
  }
  return columns;
}


/**
 * Real athletics pages break one player across several lines: the number and
 * name on one line, the attributes on the next line starting with a pipe, and
 * social links in between. Stitch those back into one row and drop the link
 * furniture, so the table pass sees whole rows.
 */
function normalizeLines(text: string): string[] {
  const raw = text
    .split("\n")
    .map((line) =>
      line
        .replace(/\bOpens in a new window\b/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line && !/^(instagram|twitter|x|facebook|full bio|view profile)$/i.test(line))
    .filter((line) => !/\b(Instagram|Twitter|Facebook)$/i.test(line) || line.includes("|"));

  const merged: string[] = [];
  for (const line of raw) {
    const previous = merged[merged.length - 1];
    if (line.startsWith("|") && previous && !previous.endsWith("|") && !SEPARATOR.test(line)) {
      merged[merged.length - 1] = `${previous} ${line}`;
      continue;
    }
    // "00 |" then the name on its own line then "| IF/OF/P | ..." — a single
    // table row that the page broke in three. Keep it as one row.
    const fragment =
      previous && previous.endsWith("|")
        ? previous.split("|").filter((cell) => cell.trim()).length <= 1
        : false;
    if (fragment && previous && !line.includes("|") && !SEPARATOR.test(previous)) {
      merged[merged.length - 1] = `${previous} ${line}`;
      continue;
    }
    merged.push(line);
  }
  return merged;
}

/**
 * Two card shapes the pass could not see, both real pages that only the AI
 * fallback ever read:
 *
 *  - one token per line with a lone "|" between each ("44", "|", "Teodoro",
 *    "Garcia", "|", "Pos.:", "2B/SS", …). Tokens between the pipes are joined
 *    back into one line, and a name printed twice in a row is halved.
 *  - the jersey number and the name on the SAME line ("48 Zane Kelly"), which
 *    the pass needs split in two before it can read the block.
 */
export function cardLines(input: string[]): string[] {
  // The shape to recognise: pipes used as separators around a SINGLE token, not
  // as table cells. A real table's rows carry two or more cells and are left
  // exactly as they are.
  const tokenPipes = input.filter((line) => /\|/.test(line) && splitCells(line).length < 2).length;
  let stream = input.map((line) => line.trim());

  if (tokenPipes >= 8) {
    // Every pipe on such a page is a boundary between two values, wherever it
    // ended up sitting, so the stream is rebuilt as tokens and breaks.
    const tokens: string[] = [];
    for (const line of stream) {
      if (splitCells(line).length >= 2) {
        tokens.push("", line, "");
        continue;
      }
      if (!line.includes("|")) {
        tokens.push(line);
        continue;
      }
      const pieces = line.split("|");
      pieces.forEach((piece, at) => {
        tokens.push(piece.trim());
        if (at < pieces.length - 1) tokens.push("");
      });
    }

    const grouped: string[] = [];
    let buffer: string[] = [];
    const flush = () => {
      if (buffer.length) grouped.push(buffer.join(" "));
      buffer = [];
    };
    for (const line of tokens) {
      if (!line) {
        flush();
        continue;
      }


      if (splitCells(line).length >= 2) {
        flush();
        grouped.push(line);
        continue;
      }
      // A bare jersey number starts the next player's block, so it must not be
      // glued to the end of the previous one.
      if (/^#?\d{1,3}$/.test(line.trim())) {
        flush();
        grouped.push(line.trim());
        continue;
      }
      buffer.push(line);
      // Never let a nav block collapse into one enormous line.
      if (buffer.length >= 6) flush();

    }
    flush();
    stream = grouped;
  }

  // A group that is only a label ("Wt.:") belongs with the value that follows it.
  const joined: string[] = [];
  for (const line of stream) {
    const previous = joined[joined.length - 1];
    if (previous && /^[A-Za-z./\s]{1,30}:$/.test(previous) && line && !line.endsWith(":")) {
      joined[joined.length - 1] = `${previous} ${line}`;
      continue;
    }
    joined.push(line);
  }

  const out: string[] = [];
  for (const line of joined) {

    // "Teodoro Garcia Teodoro Garcia" — the page prints the name twice.
    const words = line.trim().split(" ");
    let text = line;
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      if (words.slice(0, half).join(" ") === words.slice(half).join(" ")) text = words.slice(0, half).join(" ");
    }
    const numberThenName = text.match(/^#?(\d{1,3})\s+([A-Za-z].*)$/);
    if (numberThenName && personName(numberThenName[2]!)) {
      out.push(numberThenName[1]!, numberThenName[2]!);
      continue;
    }
    out.push(text);
  }
  return out;
}

/**
 * Card-style rosters carry no table at all: a jersey number on its own line,
 * then the name, then the position spelled out, then height/weight/class on one
 * line. Read those blocks when the table pass found little or nothing.
 */
function parseCards(input: string[]): PlayerRow[] {
  const lines = cardLines(input);

  const rows: PlayerRow[] = [];
  // A name line belongs to one player only: pages that list the squad twice
  // otherwise read each player once per reading order.
  const usedNames = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    // Either a bare number on its own line, or a labelled one ("Jersey Number 12").
    const labelled = line.match(/^(?:jersey(?:\s+number)?|no\.?|number)\s*#?\s*(\d{1,3})$/i);
    const number = labelled ? labelled[1]! : jerseyNumber(line);
    if (number === null) continue;
    // Most cards print the number then the name; some (UTSA) print the name
    // first, so the block above the number is read when the block below is not
    // a name.
    let nameLine = lines[index + 1] ?? "";
    let name = personName(nameLine);
    let start = index + 2;
    let nameAt = index + 1;
    if (name && usedNames.has(nameAt)) name = null;
    if (!name) {
      const above = lines[index - 1] ?? "";
      const aboveName = personName(above);
      if (aboveName && !usedNames.has(index - 1) && !rowIsFurniture(above) && !STAFF_TITLE.test(aboveName)) {
        nameLine = above;
        name = aboveName;
        nameAt = index - 1;
        start = index + 1;
      }
    }
    // Judge the ROW, not the surname.
    if (!name || rowIsFurniture(nameLine) || STAFF_TITLE.test(name)) continue;
    usedNames.add(nameAt);



    let position: string | null = null;
    let klass: string | null = null;
    let height: string | null = null;
    let weight: string | null = null;
    let hometown: string | null = null;
    let bats: string | null = null;
    let throwsHand: string | null = null;
    let previousSchool: string | null = null;
    let transfer = false;
    let juco = false;
    let positionRaw: string | null = null;
    let classRaw: string | null = null;
    let batsRaw: string | null = null;
    let throwsRaw: string | null = null;

    for (let ahead = start; ahead < Math.min(start + 8, lines.length); ahead += 1) {
      const next = lines[ahead]!;
      // "Bats/Throws R/L", "B/T: S/R", or a bare "R/R" line on a card.
      const combined = next.match(/(?:bats\s*[/-]\s*throws|b\s*[/-]\s*t)\s*:?\s*([LRSB])\s*[/-]\s*([LR])\b/i);
      const bare = batsThrowsCell(next);
      if (combined) {
        bats = bats ?? batsSide(combined[1]!);
        throwsHand = throwsHand ?? throwsSide(combined[2]!);
        batsRaw = batsRaw ?? combined[0]!.trim();
        throwsRaw = throwsRaw ?? combined[0]!.trim();
        continue;
      }
      if (bare) {
        bats = bats ?? bare.bats;
        throwsHand = throwsHand ?? bare.throws;
        batsRaw = batsRaw ?? next.trim();
        throwsRaw = throwsRaw ?? next.trim();
        continue;
      }
      const labelBats = next.match(/\bbats\s*:?\s*([LRSB])\b/i);
      if (labelBats) {
        bats = bats ?? batsSide(labelBats[1]!);
        batsRaw = batsRaw ?? labelBats[0]!.trim();
      }
      const labelThrows = next.match(/\bthrows\s*:?\s*([LR])\b/i);
      if (labelThrows) {
        throwsHand = throwsHand ?? throwsSide(labelThrows[1]!);
        throwsRaw = throwsRaw ?? labelThrows[0]!.trim();
      }
      if (POSITION_WORDS.test(next)) {
        position = position ?? next.toUpperCase();
        positionRaw = positionRaw ?? next.trim();
        continue;
      }
      // "OF Las Vegas, Nev. Faith Lutheran HS" — the position and the hometown
      // share one line, so reading the whole line as a position lost both.
      const positionThenPlace = next.match(/^([A-Za-z]{1,4}(?:\s*\/\s*[A-Za-z]{1,4}){0,3})\s+(.+)$/);
      if (positionThenPlace && POSITION_WORDS.test(positionThenPlace[1]!)) {
        position = position ?? positionThenPlace[1]!.toUpperCase();
        positionRaw = positionRaw ?? positionThenPlace[1]!.trim();
        // The state may be a newspaper abbreviation carrying interior periods
        // ("S.C.", "N.J."), which the old pattern could not match — the town was
        // then read from the NEXT player's block.
        const place = positionThenPlace[2]!.match(/^([A-Za-z .'’-]{2,40},\s*[A-Za-z]{1,20}(?:\.[A-Za-z]{1,20})*\.?)(?=\s|$)/);
        if (place) hometown = hometown ?? hometownValue(place[1]!);
        continue;
      }
      const sizes = next.match(/^(\d-\d{1,2})\s+(\d{2,3})\s*(?:lbs?\.?)?\s*(.*)$/i);
      if (sizes) {
        height = height ?? sizes[1]!;
        weight = weight ?? weightValue(sizes[2]!);
        klass = klass ?? classYear(sizes[3]!.trim());
        continue;
      }
      // Feet and inches printed as separate numbers, with the class and the
      // position sitting on the same line in either order:
      //   "Senior 6 2 200 lbs"  ·  "Senior 6 2"  ·  "Outfielder 5 9 180 lbs Freshman"
      const spaced = next.match(
        // The position may carry a digit ("C/3B", "1B/RHP"), so the leading token
        // allows numbers; without that the whole line went unread.
        /^([A-Za-z][A-Za-z0-9/\s-]{0,23}?)?\s*(\d)\s+(\d{1,2})(?:\s+(\d{2,3})\s*lbs?\.?)?(?:\s+(redshirt\s+[A-Za-z]+|[A-Za-z]+\.?))?$/i,
      );
      if (spaced) {
        const lead = spaced[1]?.trim() ?? "";
        const trail = spaced[5]?.trim() ?? "";
        const leadClass = lead ? classYear(lead) : null;
        const trailClass = trail ? classYear(trail) : null;
        const leadPosition = lead && !leadClass && POSITION_WORDS.test(lead) ? lead : null;
        if (leadClass || trailClass || leadPosition) {
          klass = klass ?? leadClass ?? trailClass;
          classRaw = classRaw ?? (leadClass ? lead : trailClass ? trail : null);
          if (leadPosition) {
            position = position ?? leadPosition.toUpperCase();
            positionRaw = positionRaw ?? leadPosition;
          }
          height = height ?? `${spaced[2]!}-${spaced[3]!}`;
          if (spaced[4]) weight = weight ?? weightValue(spaced[4]!);
          continue;
        }
      }

      // Labelled attribute lines: "Position INF Academic Year Sr. Height 5' 10'' Weight 175 lbs".
      const labelPosition = next.match(/\b(?:position|pos)\.?\s*:?\s+([A-Za-z0-9/\s-]{1,14}?)(?:\s{2,}|$|\s+(?:cl|class|academic|ht|height|wt|weight)\b)/i);
      if (labelPosition && POSITION_WORDS.test(labelPosition[1]!)) {
        position = position ?? labelPosition[1]!.trim().toUpperCase();
        positionRaw = positionRaw ?? labelPosition[1]!.trim();
      }
      const labelClass = next.match(
        /\b(?:academic year|class(?: year)?|year|cl)\.?\s*:?\s+(redshirt\s+[A-Za-z]+|[A-Za-z]+\.?)/i,
      );
      if (labelClass) {
        klass = klass ?? classYear(labelClass[1]!.trim());
        classRaw = classRaw ?? labelClass[1]!.trim();
      }
      const labelHeight = next.match(/\b(?:height|ht)\.?\s*:?\s*(\d\s*['’]\s*\d{1,2}\s*(?:["”]|'')?)/i);
      if (labelHeight) height = height ?? labelHeight[1]!.replace(/\s+/g, "");
      const labelWeight = next.match(/\b(?:weight|wt)\.?\s*:?\s*(\d{2,3})/i);
      if (labelWeight) weight = weight ?? weightValue(labelWeight[1]!);
      const labelHometown = next.match(
        /\bhometown[^:]*:\s*(.+)$|\bhometown\s+(.+?)(?:\s+(?:last school|previous school|high school)\b|$)/i,
      );
      if (labelHometown) hometown = hometown ?? hometownValue(labelHometown[1] ?? labelHometown[2] ?? "");

      // "Previous School Chipola College" on a card is the transfer signal.
      const labelPrevious = next.match(
        /\b(?:previous|last|prior|former)\s+(?:school|college|institution)\s*:?\s+(.+?)(?:\s+(?:hometown|high school|position|class)\b|$)/i,
      );
      if (labelPrevious) previousSchool = previousSchool ?? labelPrevious[1]!.trim().slice(0, 120);
      if (JUCO_TOKEN.test(next.trim())) juco = true;
      if (TRANSFER_TOKEN.test(next.trim())) transfer = true;

      if (!klass) {
        klass = classYear(next);
        if (klass) classRaw = classRaw ?? next.trim().slice(0, 60);
      }
      if (!hometown) hometown = hometownValue(next);
      // "Killeen, Texas Shoemaker HS" — the town, the state and the high school
      // share one line with no separator.
      if (!hometown) {
        const place = next.match(/^([A-Za-z .'’-]{2,40},\s*[A-Za-z]{1,20}(?:\.[A-Za-z]{1,20})*\.?)\s+\S/);
        if (place) hometown = hometownValue(place[1]!);
      }
      // "Cumming, Ga. South Forsyth HS Sr." — the class year sits at the END of
      // the hometown line, so reading that line as a hometown alone lost the
      // year for every player on the page.
      if (!klass && hometown) {
        const trailing = next.match(/\s(redshirt\s+[A-Za-z]+|[A-Za-z]{2,9}\.?)$/i);
        const trailingClass = trailing ? classYear(trailing[1]!) : null;
        if (trailingClass) {
          klass = trailingClass;
          classRaw = classRaw ?? trailing![1]!.trim();
        }
      }



    }

    if (!position && !klass && !number) continue;
    const place = splitHometown(hometown);
    rows.push({
      name,
      number,
      position,
      class_year: klass,
      height,
      weight,
      hometown,
      home_state: place.state,
      home_country: place.country,
      previous_school: previousSchool,
      is_transfer: transfer || juco || Boolean(previousSchool),
      is_juco_transfer: juco,
      bats,
      throws: throwsHand,
      position_raw: positionRaw,
      class_year_raw: classRaw,
      bats_raw: batsRaw,
      throws_raw: throwsRaw,
    });
  }

  // Some pages publish the squad twice in two arrangements (a card view and a
  // list view), which read as two rows per player. Keep one row per name and
  // fill its blanks from the other copy.
  const byName = new Map<string, PlayerRow>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    const kept = byName.get(key);
    if (!kept) {
      byName.set(key, row);
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      const held = (kept as Record<string, unknown>)[field];
      if ((held === null || held === undefined || held === "") && value) {
        (kept as Record<string, unknown>)[field] = value;
      }
    }
  }
  return [...byName.values()];

}


/**
 * Read the roster table out of a page's text. Only rows with a name plus one
 * hard attribute are returned; everything else is reported so a big number can
 * be read as a real squad or a bad parse.
 */
export function parseRoster(text: string | null | undefined, sport?: string | null): RosterShape {
  const lines = normalizeLines(String(text ?? ""));
  const players: PlayerRow[] = [];

  const bareNames: string[] = [];
  const furniture: string[] = [];
  const seasons: string[] = [];
  const seenSports = new Set<string>();
  let rowsConsidered = 0;
  let hometownColumn = -1;
  // Where the header put bats and throws, so a lone "R" or "L" is read as a
  // hand only under the right column and never mistaken for a position.
  let batsColumn = -1;
  let throwsColumn = -1;
  // The previous/last school column, read as the transfer signal.
  let previousSchoolColumn = -1;
  // Where the header put position and class, so the page's wording is kept even
  // when our mapper does not recognise it — that is how an unknown wording gets
  // counted instead of vanishing.
  let positionColumn = -1;
  let classColumn = -1;

  for (const line of lines) {
    for (const match of line.matchAll(/\b(20\d{2})\s?[-–]\s?(\d{2})\b|\b(20\d{2})\s+(baseball|softball)\s+roster\b/gi)) {
      const label = match[0].trim();
      if (!seasons.includes(label)) seasons.push(label);
    }
    if (/^#{1,4}\s|roster|schedule/i.test(line)) {
      for (const found of line.matchAll(SPORTS)) seenSports.add(found[0].toLowerCase());
    }

    const cells = splitCells(line);
    if (cells.length < 2 || SEPARATOR.test(line)) continue;
    const headerHometown = cells.findIndex((cell) => HOMETOWN_HEADER.test(cell));
    if (headerHometown >= 0) hometownColumn = headerHometown;
    const headerBats = cells.findIndex((cell) => BATS_HEADER.test(cell));
    if (headerBats >= 0) batsColumn = headerBats;
    const headerThrows = cells.findIndex((cell) => THROWS_HEADER.test(cell));
    if (headerThrows >= 0) throwsColumn = headerThrows;
    if (cells.some((cell) => BATS_THROWS_HEADER.test(cell))) {
      batsColumn = -1;
      throwsColumn = -1;
    }
    const headerPosition = cells.findIndex((cell) => /^(pos\.?|position(s)?)$/i.test(cell));
    if (headerPosition >= 0) positionColumn = headerPosition;
    const headerClass = cells.findIndex((cell) =>
      /^(cl\.?|class(\s+year)?|yr\.?|year|academic\s+year|eligibility)$/i.test(cell),
    );
    if (headerClass >= 0) classColumn = headerClass;
    const headerPrevious = cells.findIndex((cell) => PREVIOUS_SCHOOL_HEADER.test(cell));
    if (headerPrevious >= 0) previousSchoolColumn = headerPrevious;

    let name: string | null = null;
    let number: string | null = null;
    let position: string | null = null;
    let klass: string | null = null;
    let height: string | null = null;
    let weight: string | null = null;
    let hometown: string | null = null;
    let bats: string | null = null;
    let throwsHand: string | null = null;
    let previousSchool: string | null = null;
    let transfer = false;
    let juco = false;
    // The page's own wording, kept verbatim alongside our mapped value.
    let positionRaw: string | null = null;
    let classRaw: string | null = null;
    let batsRaw: string | null = null;
    let throwsRaw: string | null = null;

    for (const [cellIndex, cell] of cells.entries()) {
      if (!cell) continue;
      if (cellIndex === positionColumn && !positionRaw) positionRaw = cell.trim().slice(0, 60);
      if (cellIndex === classColumn && !classRaw) classRaw = cell.trim().slice(0, 60);
      // Where the page came from: an outright "TR"/"JUCO" cell, and the
      // previous-school column when the page carries one.
      if (JUCO_TOKEN.test(cell.trim())) {
        juco = true;
        continue;
      }
      if (TRANSFER_TOKEN.test(cell.trim())) {
        transfer = true;
        continue;
      }
      if (cellIndex === previousSchoolColumn && !previousSchool) {
        const school = rowText(cell).trim();
        // A dash or a blank means "not a transfer", not an unnamed school.
        if (school && !/^[-–—]$/.test(school) && school.length >= 4 && !PREVIOUS_SCHOOL_HEADER.test(school)) {
          previousSchool = school.slice(0, 120);
          continue;
        }
      }
      // A combined "R/R" cell, wherever it sits — Stetson prints it under an
      // unnamed "Custom Field 1" column, so this cannot wait on a header.
      const hands = batsThrowsCell(cell);
      if (hands && (!bats || !throwsHand)) {
        bats = bats ?? hands.bats;
        throwsHand = throwsHand ?? hands.throws;
        batsRaw = batsRaw ?? cell.trim();
        throwsRaw = throwsRaw ?? cell.trim();
        continue;
      }
      if (cellIndex === batsColumn && !bats) {
        batsRaw = batsRaw ?? cell.trim();
        const side = batsSide(cell);
        if (side) {
          bats = side;
          continue;
        }
      }
      if (cellIndex === throwsColumn && !throwsHand) {
        throwsRaw = throwsRaw ?? cell.trim();
        const side = throwsSide(cell);
        if (side) {
          throwsHand = side;
          continue;
        }
      }
      if (!number) {
        const jersey = jerseyNumber(cell);
        if (jersey !== null) {
          number = jersey;
          continue;
        }
      }
      if (!klass) {
        const year = classYear(cell);
        if (year) {
          klass = year;
          classRaw = cell.trim();
          continue;
        }
      }
      if (!position && POSITION_WORDS.test(cell.trim())) {
        position = cell.trim().toUpperCase();
        positionRaw = cell.trim();
        continue;
      }
      if (!height) {
        const h = heightValue(cell);
        if (h) {
          height = h;
          continue;
        }
      }
      if (!weight) {
        const w = weightValue(cell);
        if (w) {
          weight = w;
          continue;
        }
      }
      if (!hometown) {
        const town = hometownValue(cell, { inHometownColumn: cellIndex === hometownColumn });
        if (town) {
          hometown = town;
          continue;
        }
      }
      if (!name) {
        const person = personName(cell);
        if (person) name = person;
      }
    }

    if (!name) continue;
    rowsConsidered += 1;

    if (rowIsFurniture(line, Boolean(number || position || klass)) || STAFF_TITLE.test(name)) {
      furniture.push(name);
      continue;
    }
    if (!number && !position && !klass) {
      bareNames.push(name);
      continue;
    }
    const place = splitHometown(hometown);
    players.push({
      name,
      number,
      position,
      class_year: klass,
      height,
      weight,
      hometown,
      home_state: place.state,
      home_country: place.country,
      previous_school: previousSchool,
      // A named previous school IS a transfer; the junior-college half is only
      // ever set on an explicit signal, never guessed from the school's name.
      is_transfer: transfer || juco || Boolean(previousSchool),
      is_juco_transfer: juco,
      bats,
      throws: throwsHand,
      position_raw: positionRaw,
      class_year_raw: classRaw,
      bats_raw: batsRaw,
      throws_raw: throwsRaw,
    });
  }

  // Card-style pages carry no table; read them the other way and keep whichever
  // pass found the fuller squad — and, on a tie, the pass that read more about
  // each player, so a thin card list never displaces a complete table.
  const cards = parseCards(lines);
  const filled = (rows: PlayerRow[]) =>
    rows.reduce(
      (total, row) =>
        total +
        [row.number, row.position, row.class_year, row.height, row.weight, row.hometown, row.bats, row.throws].filter(
          Boolean,
        ).length,
      0,
    );
  const cardsWin =
    cards.length > 0 &&
    (cards.length > players.length || (cards.length === players.length && filled(cards) > filled(players)));
  const losing = cardsWin ? [...players] : cards;
  if (cardsWin) {
    players.length = 0;
    players.push(...cards);
    rowsConsidered = Math.max(rowsConsidered, cards.length);
  }

  // The losing pass is not discarded. Pages like Florida Atlantic's print a
  // label-style card block that omits bats and throws AND a full table below
  // that carries them; taking one pass whole meant the batting side on the page
  // was never stored. Blanks on the winning pass are filled from the other
  // pass, matched on the player's own name, and a value the winner already read
  // is never overwritten.
  if (losing.length) {
    const byName = new Map<string, PlayerRow>();
    for (const row of losing) byName.set(row.name.trim().toLowerCase(), row);
    const FILLABLE = [
      "number",
      "position",
      "class_year",
      "height",
      "weight",
      "hometown",
      "home_state",
      "home_country",
      "previous_school",
      "bats",
      "throws",
      "position_raw",
      "class_year_raw",
      "bats_raw",
      "throws_raw",
    ] as const;
    for (const player of players) {
      const other = byName.get(player.name.trim().toLowerCase());
      if (!other) continue;
      for (const key of FILLABLE) {
        if (player[key] === null || player[key] === undefined || player[key] === "") {
          (player as Record<string, unknown>)[key] = other[key];
        }
      }
      if (!player.is_transfer && other.is_transfer) player.is_transfer = true;
      if (!player.is_juco_transfer && other.is_juco_transfer) player.is_juco_transfer = true;
    }
  }

  const seen = new Map<string, number>();
  for (const player of players) {
    const key = player.name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);


  const withNumber = players.filter((p) => p.number).length;
  const withPosition = players.filter((p) => p.position).length;
  const withClass = players.filter((p) => p.class_year).length;
  const withHeightWeight = players.filter((p) => p.height || p.weight).length;
  const withHometown = players.filter((p) => p.hometown).length;
  const withState = players.filter((p) => p.home_state).length;
  const withCountry = players.filter((p) => p.home_country).length;
  const withTransfer = players.filter((p) => p.is_transfer).length;
  const withJucoTransfer = players.filter((p) => p.is_juco_transfer).length;
  const withPreviousSchool = players.filter((p) => p.previous_school).length;
  const withBats = players.filter((p) => p.bats).length;
  const withThrows = players.filter((p) => p.throws).length;

  const wanted = String(sport ?? "").toLowerCase();
  const otherSports = [...seenSports].filter((s) => s !== wanted);

  const flags: string[] = [];
  const considered = rowsConsidered || 1;
  if (bareNames.length / considered > 0.3) {
    flags.push(`${bareNames.length} of ${rowsConsidered} rows were a bare name — the parse is reading page furniture`);
  }
  if (players.length && withNumber === 0) {
    flags.push("no row carried a jersey number — the roster table was probably never found");
  }
  if (duplicates.length) {
    flags.push(`${duplicates.length} duplicated name(s) — more than one season may have been merged`);
  }
  if (seasons.length > 1) {
    flags.push(`the page carries more than one season heading (${seasons.join(", ")})`);
  }
  if (wanted && otherSports.filter((s) => s !== wanted).length) {
    flags.push(`the page also names ${otherSports.filter((s) => s !== wanted).join(", ")}`);
  }
  if (!players.length) flags.push("no player rows were found on the page");

  // What the page offers versus what we read off it. A column the page carries
  // that we extracted for nobody is a parser defect; a column the page does not
  // carry is simply not published.
  const columns = detectColumns(lines);
  const extracted: Record<RosterAttribute, number> = {
    number: withNumber,
    position: withPosition,
    class_year: withClass,
    height: players.filter((p) => p.height).length,
    weight: players.filter((p) => p.weight).length,
    hometown: withHometown,
    home_state: withState,
    home_country: withCountry,
    transfer: withTransfer,
    bats: withBats,
    throws: withThrows,
  };
  // Reading a value IS evidence the page publishes it. Stetson prints bats and
  // throws under an unnamed "Custom Field 1" column; the header cannot be
  // trusted to declare them.
  if (withBats) columns.bats = "published";
  if (withThrows) columns.throws = "published";
  // State and country are not columns of their own: they are what the hometown
  // cell carries. A page printing towns with no state publishes hometowns but
  // not states, and that is reported as such rather than as a defect of ours.
  columns.home_state = withState ? "published" : columns.hometown === "unknown" ? "unknown" : "not_published";
  columns.home_country = withCountry ? "published" : columns.hometown === "unknown" ? "unknown" : "not_published";
  if (withTransfer) columns.transfer = "published";
  const parserDefects = players.length
    ? ALL_ATTRIBUTES.filter((attribute) => columns[attribute] === "published" && extracted[attribute] === 0)
    : [];
  for (const attribute of parserDefects) {
    flags.push(`the page publishes ${attribute.replace("_", " ")} but none was read — parser defect`);
  }

  return {
    players,
    bareNames,
    furniture,
    duplicates,
    seasons,
    otherSports: otherSports.filter((s) => s !== wanted),
    columns,
    parserDefects,

    counts: {
      rowsConsidered,
      players: players.length,
      withNumber,
      withPosition,
      withClass,
      withHeightWeight,
      withHometown,
      withState,
      withCountry,
      withTransfer,
      withJucoTransfer,
      withPreviousSchool,
      withBats,
      withThrows,
      bareNames: bareNames.length,
      furniture: furniture.length,
      duplicates: duplicates.length,
    },
    flags,
  };
}
