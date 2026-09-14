import { isPitcher, pitcherHand } from "@/lib/position-group";
import { cn } from "@/lib/utils";

export type RosterRow = {
  id: string;
  name: string;
  class_year: string | null;
  position: string | null;
  bats: string | null;
  throws: string | null;
  hometown: string | null;
  home_state: string | null;
  home_country: string | null;
  is_transfer: boolean | null;
  is_juco_transfer: boolean | null;
  two_way: boolean | null;
};

type Line = { label: string; value: number | null };

const NOT_PUBLISHED = "Not published by the school";

/** Did the school publish this field for anyone on the roster? */
const anyPublished = (rows: RosterRow[], key: keyof RosterRow) =>
  rows.some((row) => row[key] !== null && row[key] !== undefined && row[key] !== "");

const pos = (row: RosterRow) => String(row.position ?? "").toUpperCase();

/**
 * The hand a pitcher throws with, from the position and the page's own throws
 * column; null for a pitcher whose hand the school never published.
 */
const pitcherOf = (row: RosterRow) =>
  isPitcher(row.position, row.two_way) ? pitcherHand(row.position, row.throws) : null;


function positionLines(rows: RosterRow[]): Line[] {
  const has = anyPublished(rows, "position");
  const n = (test: (p: string, row: RosterRow) => boolean) =>
    has ? rows.filter((row) => test(pos(row), row)).length : null;

  return [
    { label: "Catchers", value: n((p) => p === "C") },
    { label: "Middle infield (2B, SS)", value: n((p) => p === "2B" || p === "SS" || p === "MIF") },
    { label: "Corner infield (1B, 3B)", value: n((p) => p === "1B" || p === "3B" || p === "CIF") },
    { label: "First basemen", value: n((p) => p === "1B") },
    { label: "Third basemen", value: n((p) => p === "3B") },
    { label: "Infield, spot not stated", value: n((p) => p === "IF") },
    { label: "Outfielders", value: n((p) => p === "OF") },
    {
      label: "Right-handed pitchers",
      value: has ? rows.filter((row) => pitcherOf(row) === "R").length : null,
    },
    {
      label: "Left-handed pitchers",
      value: has ? rows.filter((row) => pitcherOf(row) === "L").length : null,
    },
    {
      label: "Pitchers, hand not stated",
      value: has
        ? rows.filter((row) => isPitcher(row.position, row.two_way) && pitcherOf(row) === null)
            .length
        : null,
    },

    {
      label: "Two-way players",
      value: has ? rows.filter((row) => pos(row) === "TWO_WAY" || row.two_way === true).length : null,
    },
    { label: "Utility", value: n((p) => p === "UTIL") },
    { label: "Position not listed", value: has ? rows.filter((row) => !pos(row)).length : null },
  ];

}

/**
 * Pitcher handedness comes from the POSITION column ("RHP", "LHP"), which most
 * pages publish even when they publish no bats/throws column at all. Mixing it
 * into one "handedness" panel made a page like Clemson's — which genuinely does
 * not print bats or throws — look as though nothing about handedness was
 * published, when the pitching hands were right there. The two are separate
 * facts from separate columns, so they are now separate panels.
 */
function pitcherHandLines(rows: RosterRow[]): Line[] {
  const has = anyPublished(rows, "position");
  const n = (test: (row: RosterRow) => boolean) => (has ? rows.filter(test).length : null);
  return [
    { label: "Right-handed pitchers", value: n((row) => pitcherOf(row) === "R") },
    { label: "Left-handed pitchers", value: n((row) => pitcherOf(row) === "L") },
    {
      label: "Pitchers, hand not stated",
      value: n((row) => isPitcher(row.position, row.two_way) && pitcherOf(row) === null),
    },
  ];
}

/** Batting side, from the page's own bats column and nothing else. */
function hitterLines(rows: RosterRow[]): Line[] {
  const bats = anyPublished(rows, "bats");
  const nb = (value: string) => (bats ? rows.filter((row) => row.bats === value).length : null);
  return [
    { label: "Right-handed hitters", value: nb("R") },
    { label: "Left-handed hitters", value: nb("L") },
    { label: "Switch hitters", value: nb("S") },
  ];
}

/** Throwing arm, from the page's own throws column and nothing else. */
function throwsLines(rows: RosterRow[]): Line[] {
  const published = anyPublished(rows, "throws");
  const n = (value: string) => (published ? rows.filter((row) => row.throws === value).length : null);
  return [
    { label: "Throws right", value: n("R") },
    { label: "Throws left", value: n("L") },
  ];
}


function classLines(rows: RosterRow[]): Line[] {
  const has = anyPublished(rows, "class_year");
  return (["FR", "SO", "JR", "SR", "GR"] as const).map((year) => ({
    label: year,
    value: has ? rows.filter((row) => row.class_year === year).length : null,
  }));
}

function transferLines(rows: RosterRow[]): Line[] {
  return [
    { label: "Transfers", value: rows.filter((row) => row.is_transfer === true).length },
    { label: "JUCO transfers", value: rows.filter((row) => row.is_juco_transfer === true).length },
  ];
}

function geographyLines(rows: RosterRow[]): Line[] {
  const hasState = anyPublished(rows, "home_state");
  const hasCountry = anyPublished(rows, "home_country");
  const tally = new Map<string, number>();
  if (hasState) {
    for (const row of rows) {
      const state = (row.home_state ?? "").trim().toUpperCase();
      if (state) tally.set(state, (tally.get(state) ?? 0) + 1);
    }
  }
  const top = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([state, n]) => ({ label: state, value: n }));

  const international = hasCountry
    ? rows.filter((row) => {
        const country = (row.home_country ?? "").trim().toUpperCase();
        return Boolean(country) && !["US", "USA", "UNITED STATES", "U.S.", "U.S.A."].includes(country);
      }).length
    : null;

  return [
    ...(hasState ? top : [{ label: "Home states", value: null }]),
    { label: "International players", value: international },
  ];
}

function Block({ title, lines, note }: { title: string; lines: Line[]; note?: string | null }) {
  return (
    <div className="rounded border border-border bg-card">
      <p className="border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide text-steel uppercase">
        {title}
      </p>
      {note ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-steel">{note}</p>
      ) : null}
      <table className="w-full border-collapse text-sm">

        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="border-b border-border last:border-0">
              <td className="h-[30px] px-3 py-1 align-middle text-steel">{line.label}</td>
              <td
                className={cn(
                  "tabular h-[30px] px-3 py-1 text-right align-middle",
                  line.value === null
                    ? "text-[11px] text-steel/80 italic"
                    : "font-semibold text-graphite",
                )}
              >
                {line.value === null ? NOT_PUBLISHED : line.value.toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How many players the school left this field blank for. A count of 0 built on
 * a field the school didn't publish would read as fact, so the gap is stated.
 */
function gap(rows: RosterRow[], key: keyof RosterRow): string | null {
  const missing = rows.filter(
    (row) => row[key] === null || row[key] === undefined || row[key] === "",
  ).length;
  if (!missing || !rows.length) return null;
  if (missing === rows.length) return "The school didn’t publish this for any player.";
  return `Not published by the school for ${missing} of ${rows.length} players — the counts below cover only the ones it listed.`;
}

/**
 * Roster composition — the summary a family actually reads. Counts first; the
 * player table underneath is how these counts are derived.
 */

export function RosterComposition({
  rows,
  season,
}: {
  rows: RosterRow[];
  season: number | null;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded border border-border border-l-2 border-l-diamond-green bg-card px-3 py-2">
        <p className="text-sm text-steel">
          Total roster size{" "}
          <span className="tabular ml-1 font-display text-xl font-bold text-graphite">
            {rows.length}
          </span>
        </p>
        <p className="meta tabular">
          {season ? `${season} season` : "Season not stated"} · counted from{" "}
          {rows.length.toLocaleString("en-US")} player records
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Block title="By position" lines={positionLines(rows)} note={gap(rows, "position")} />
        <Block
          title="Pitcher handedness"
          lines={pitcherHandLines(rows)}
          note={gap(rows, "position")}
        />
        <Block title="Batting side" lines={hitterLines(rows)} note={gap(rows, "bats")} />
        <Block title="Throwing arm" lines={throwsLines(rows)} note={gap(rows, "throws")} />

        <Block title="By class year" lines={classLines(rows)} note={gap(rows, "class_year")} />
        <Block title="Transfers" lines={transferLines(rows)} />

        <Block title="Geographic makeup" lines={geographyLines(rows)} />
      </div>
    </div>
  );
}
