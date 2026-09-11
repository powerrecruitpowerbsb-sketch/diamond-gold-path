/**
 * Read NAMES off a coaching staff page — a count of titles is not an answer.
 *
 * A page that yields no identifiable head coach has failed, however many
 * "coach" words it contains. Assistants are read where they are listed, but the
 * head coach is the field the product actually needs.
 */

export type CoachRow = {
  name: string;
  title: string;
  isHead: boolean;
};

export type CoachShape = {
  headCoach: CoachRow | null;
  assistants: CoachRow[];
  /** All rows read, head coach included. */
  coaches: CoachRow[];
  /** Why no head coach could be named, when that is the case. */
  failure: string | null;
  counts: { rows: number; titles: number };
};

const HEAD_TITLE =
  /\bhead\s+(men'?s\s+|women'?s\s+|baseball\s+|softball\s+)?coach\b|\bhead\s+(baseball|softball)\b/i;

const ANY_TITLE =
  /\b(head coach|associate head coach|assistant coach|assistant baseball coach|assistant softball coach|pitching coach|hitting coach|catching coach|infield coach|outfield coach|bench coach|volunteer coach|volunteer assistant|recruiting coordinator|director of operations|director of player development|graduate assistant|student assistant|student manager|athletic trainer|strength and conditioning coach|analyst)\b/i;

const NOT_A_PERSON =
  /(coach|staff|director|coordinator|athletic|department|university|college|baseball|softball|roster|schedule|vacant|tba|tbd|full bio|email|phone|twitter)/i;

function personName(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ").replace(/^[-–*•\s]+/, "").replace(/[.,;:]+$/, "");
  if (value.length < 4 || value.length > 48) return null;
  if (/[0-9@|]|https?:/i.test(value)) return null;
  if (!/^[A-Z][A-Za-z.'’-]*(\s+[A-Za-z.'’-]+){1,3}$/.test(value)) return null;
  if (NOT_A_PERSON.test(value)) return null;
  return value;
}

function titleIn(text: string): string | null {
  const match = text.match(ANY_TITLE);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

/**
 * Pull name/title pairs out of a staff page. Rows are matched in both the
 * orders real pages use — name then title, and title then name — and a title
 * only ever attaches to a name sitting in the same row or the line beside it,
 * so an assistant two rows down is never promoted.
 */
export function extractCoaches(text: string | null | undefined, sport?: string | null): CoachShape {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/\*\*/g, "").trim())
    .filter(Boolean);

  const coaches: CoachRow[] = [];
  const seen = new Set<string>();
  let titles = 0;

  const consider = (name: string | null, title: string | null) => {
    if (!name || !title) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    coaches.push({ name, title, isHead: HEAD_TITLE.test(title) });
  };

  lines.forEach((line, index) => {
    if (ANY_TITLE.test(line)) titles += 1;

    const cells = line.includes("|")
      ? line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
      : [line];

    // Same row: one cell is the person, another is the job.
    const rowTitle = titleIn(cells.join(" "));
    if (rowTitle) {
      for (const cell of cells) {
        const name = personName(cell);
        if (name) {
          consider(name, rowTitle);
          break;
        }
      }
      // Title on its own line: the person is usually the line before or after.
      if (!cells.some((cell) => personName(cell))) {
        const near = [lines[index - 1], lines[index + 1]];
        for (const candidate of near) {
          const name = candidate ? personName(candidate) : null;
          if (name) {
            consider(name, rowTitle);
            break;
          }
        }
      }
    }
  });

  const headCoach = coaches.find((coach) => coach.isHead) ?? null;
  const assistants = coaches.filter((coach) => !coach.isHead);

  let failure: string | null = null;
  if (!headCoach) {
    failure = coaches.length
      ? `no head coach title was tied to a name (${titles} coaching title(s) on the page)`
      : titles
        ? `${titles} coaching title(s) on the page but no name could be read next to one`
        : "the page carries no coaching titles at all";
  }

  return {
    headCoach,
    assistants,
    coaches,
    failure,
    counts: { rows: coaches.length, titles },
  };
}

/** Sport-specific field holding a whole-department list, not this team's staff. */
export function looksLikeDepartmentDirectory(input: {
  url: string | null | undefined;
  text?: string | null;
  sport?: string | null;
}): { ok: boolean; reason: string | null } {
  const url = String(input.url ?? "");
  const sport = String(input.sport ?? "").toLowerCase();
  const sportNamed = sport ? new RegExp(sport, "i").test(url) : false;

  if (/staff-?directory|staff_directory|department-?directory|administration/i.test(url) && !sportNamed) {
    return { ok: false, reason: "a whole-department staff directory, not this team's staff page" };
  }
  const text = String(input.text ?? "");
  if (text) {
    const shape = extractCoaches(text, sport);
    // A department directory lists dozens of people across every sport.
    if (!sportNamed && shape.coaches.length > 25) {
      return {
        ok: false,
        reason: `${shape.coaches.length} staff read from the page — an all-sports directory, not one team's staff`,
      };
    }
  }
  return { ok: true, reason: null };
}
