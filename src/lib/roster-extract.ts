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

export type PlayerRow = {
  name: string;
  number: string | null;
  position: string | null;
  class_year: string | null;
  height: string | null;
  weight: string | null;
  hometown: string | null;
  /** Batting side: R, L or S (switch). */
  bats: string | null;
  /** Throwing arm: R or L. */
  throws: string | null;
};

export type RosterAttribute =
  | "number"
  | "position"
  | "class_year"
  | "height"
  | "weight"
  | "hometown"
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
    bareNames: number;
    furniture: number;
    duplicates: number;
  };
  /** Shape problems, in plain language. Empty means the parse looks sound. */
  flags: string[];
};


const CLASS_MAP: Array<[RegExp, string]> = [
  [/^(r-?)?fr(\.|eshman)?$/i, "FR"],
  [/^(r-?)?so(\.|phomore)?$/i, "SO"],
  [/^(r-?)?jr(\.|unior)?$/i, "JR"],
  [/^(r-?)?sr(\.|enior)?$/i, "SR"],
  [/^(gr|grad(uate)?|5th year|gs)\.?$/i, "GR"],
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
  /^(ala|alaska|ariz|ark|calif|cal|colo|conn|del|fla|ga|hawaii|idaho|ill|ind|iowa|kan|kans|ky|la|maine|md|mass|mich|minn|miss|mo|mont|neb|nebr|nev|ohio|okla|ore|pa|penn|tenn|texas|tex|utah|vt|va|wash|wis|wisc|wyo|d\.?c|n\.?[hjmycd]|r\.?i|s\.?[cd]|w\.?va|[A-Z]{2}|canada|japan|mexico|australia|puerto rico|dominican republic|venezuela|cuba|panama|colombia|curacao|curaçao|bahamas|germany|england|netherlands|aruba|nicaragua|brazil|taiwan|korea|ontario|quebec|alberta|british columbia|manitoba|saskatchewan)\.?$/i;

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

const SEPARATOR = /^\|?[\s:-]+\|/;

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
];

const ALL_ATTRIBUTES: RosterAttribute[] = ["number", "position", "class_year", "height", "weight", "hometown"];

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
 * Card-style rosters carry no table at all: a jersey number on its own line,
 * then the name, then the position spelled out, then height/weight/class on one
 * line. Read those blocks when the table pass found little or nothing.
 */
function parseCards(lines: string[]): PlayerRow[] {
  const rows: PlayerRow[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    // Either a bare number on its own line, or a labelled one ("Jersey Number 12").
    const labelled = line.match(/^(?:jersey(?:\s+number)?|no\.?|number)\s*#?\s*(\d{1,3})$/i);
    const number = labelled ? labelled[1]! : jerseyNumber(line);
    if (number === null) continue;
    const nameLine = lines[index + 1] ?? "";
    const name = personName(nameLine);
    // Judge the ROW, not the surname.
    if (!name || rowIsFurniture(nameLine) || STAFF_TITLE.test(name)) continue;

    let position: string | null = null;
    let klass: string | null = null;
    let height: string | null = null;
    let weight: string | null = null;
    let hometown: string | null = null;

    for (let ahead = index + 2; ahead < Math.min(index + 10, lines.length); ahead += 1) {
      const next = lines[ahead]!;
      if (POSITION_WORDS.test(next)) {
        position = position ?? next.toUpperCase();
        continue;
      }
      const sizes = next.match(/^(\d-\d{1,2})\s+(\d{2,3})\s*(?:lbs?\.?)?\s*(.*)$/i);
      if (sizes) {
        height = height ?? sizes[1]!;
        weight = weight ?? weightValue(sizes[2]!);
        klass = klass ?? classYear(sizes[3]!.trim());
        continue;
      }
      // Labelled attribute lines: "Position INF Academic Year Sr. Height 5' 10'' Weight 175 lbs".
      const labelPosition = next.match(/\bposition\s+([A-Za-z/-]{1,12})\b/i);
      if (labelPosition && POSITION_WORDS.test(labelPosition[1]!)) position = position ?? labelPosition[1]!.toUpperCase();
      const labelClass = next.match(/\b(?:academic year|class(?: year)?|year)\s+(redshirt\s+[A-Za-z]+|[A-Za-z]+\.?)/i);
      if (labelClass) klass = klass ?? classYear(labelClass[1]!.trim());
      const labelHeight = next.match(/\bheight\s+(\d\s*['’]\s*\d{1,2}\s*(?:["”]|'')?)/i);
      if (labelHeight) height = height ?? labelHeight[1]!.replace(/\s+/g, "");
      const labelWeight = next.match(/\bweight\s+(\d{2,3})/i);
      if (labelWeight) weight = weight ?? weightValue(labelWeight[1]!);
      const labelHometown = next.match(/\bhometown\s+(.+?)(?:\s+(?:last school|previous school|high school)\b|$)/i);
      if (labelHometown) hometown = hometown ?? hometownValue(labelHometown[1]!);

      if (!klass) klass = classYear(next);
      if (!hometown) hometown = hometownValue(next);
    }

    if (!position && !klass && !number) continue;
    rows.push({ name, number, position, class_year: klass, height, weight, hometown });
  }

  return rows;
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

    let name: string | null = null;
    let number: string | null = null;
    let position: string | null = null;
    let klass: string | null = null;
    let height: string | null = null;
    let weight: string | null = null;
    let hometown: string | null = null;

    for (const [cellIndex, cell] of cells.entries()) {
      if (!cell) continue;
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
          continue;
        }
      }
      if (!position && POSITION_WORDS.test(cell.trim())) {
        position = cell.trim().toUpperCase();
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
    players.push({ name, number, position, class_year: klass, height, weight, hometown });
  }

  // Card-style pages carry no table; read them the other way and keep whichever
  // pass found the fuller squad — and, on a tie, the pass that read more about
  // each player, so a thin card list never displaces a complete table.
  const cards = parseCards(lines);
  const filled = (rows: PlayerRow[]) =>
    rows.reduce(
      (total, row) =>
        total +
        [row.number, row.position, row.class_year, row.height, row.weight, row.hometown].filter(Boolean).length,
      0,
    );
  const cardsWin =
    cards.length > 0 &&
    (cards.length > players.length || (cards.length === players.length && filled(cards) > filled(players)));
  if (cardsWin) {
    players.length = 0;
    players.push(...cards);
    rowsConsidered = Math.max(rowsConsidered, cards.length);

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
  };
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
      bareNames: bareNames.length,
      furniture: furniture.length,
      duplicates: duplicates.length,
    },
    flags,
  };
}
