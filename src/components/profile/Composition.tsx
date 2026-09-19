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
  return `Not published for ${missing} of ${rows.length} players — counts cover the rest.`;
}

/* ---------------------------------------------------------------- pieces --- */

/** One titled block. The card is the page's container shape, not a table. */
function Block({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-wide text-graphite uppercase">
          {title}
        </h3>
      </div>
      {note ? <p className="meta mt-1">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A labelled bar. The bar is the number; the figure sits beside it. */
function Bar({
  label,
  value,
  total,
  hint,
  tone = "primary",
}: {
  label: string;
  value: number | null;
  total: number;
  hint?: string | null;
  tone?: "primary" | "accent" | "steel";
}) {
  if (value === null) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <span className="text-sm text-steel">{label}</span>
        <span className="text-[11px] text-steel/70 italic">{NOT_PUBLISHED}</span>
      </div>
    );
  }
  const share = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-steel">
          {label}
          {hint ? <span className="meta ml-1.5">{hint}</span> : null}
        </span>
        <span className="tabular text-sm font-bold text-graphite">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "primary" && "bg-org-primary",
            tone === "accent" && "bg-org-accent-strong",
            tone === "steel" && "bg-steel/50",
          )}
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}

/** A split reading of two facing counts — hands, sides, arms. */
function Split({
  left,
  right,
  extra,
}: {
  left: { label: string; value: number | null };
  right: { label: string; value: number | null };
  extra?: { label: string; value: number | null } | null;
}) {
  if (left.value === null && right.value === null) {
    return <p className="text-sm text-steel/70 italic">{NOT_PUBLISHED}</p>;
  }
  const l = left.value ?? 0;
  const r = right.value ?? 0;
  const sum = l + r || 1;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="tabular font-display text-3xl leading-none font-bold text-org-primary">
            {l}
          </p>
          <p className="meta mt-1">{left.label.toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="tabular font-display text-3xl leading-none font-bold text-org-accent-strong">
            {r}
          </p>
          <p className="meta mt-1">{right.label.toUpperCase()}</p>
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-track">
        <div className="bg-org-primary" style={{ width: `${(l / sum) * 100}%` }} />
        <div className="bg-org-accent-strong" style={{ width: `${(r / sum) * 100}%` }} />
      </div>
      {extra && extra.value !== null ? (
        <p className="meta mt-2">
          {extra.label}: <span className="tabular font-semibold text-graphite">{extra.value}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- readings --- */

/**
 * Positions read as a depth chart, not a 13-row census. Each line is a place on
 * the field; the specific spots a school does print sit beside the group as a
 * quiet hint instead of repeating as their own rows.
 */
function positionBars(rows: RosterRow[]) {
  const has = anyPublished(rows, "position");
  const n = (test: (p: string, row: RosterRow) => boolean) =>
    has ? rows.filter((row) => test(pos(row), row)).length : null;

  const detail = (...keys: string[]) => {
    if (!has) return null;
    const parts = keys
      .map((key) => [key, rows.filter((row) => pos(row) === key).length] as const)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${key}`);
    return parts.length ? parts.join(" · ") : null;
  };

  return [
    { label: "Pitchers", value: has ? rows.filter((row) => isPitcher(row.position, row.two_way)).length : null, tone: "primary" as const, hint: null },
    { label: "Catchers", value: n((p) => p === "C"), tone: "primary" as const, hint: null },
    {
      label: "Middle infield",
      value: n((p) => p === "2B" || p === "SS" || p === "MIF"),
      tone: "primary" as const,
      hint: detail("2B", "SS", "MIF"),
    },
    {
      label: "Corner infield",
      value: n((p) => p === "1B" || p === "3B" || p === "CIF"),
      tone: "primary" as const,
      hint: detail("1B", "3B", "CIF"),
    },
    { label: "Infield, spot not stated", value: n((p) => p === "IF"), tone: "steel" as const, hint: null },
    { label: "Outfielders", value: n((p) => p === "OF"), tone: "primary" as const, hint: null },
    {
      label: "Two-way players",
      value: has ? rows.filter((row) => pos(row) === "TWO_WAY" || row.two_way === true).length : null,
      tone: "accent" as const,
      hint: null,
    },
    { label: "Utility", value: n((p) => p === "UTIL"), tone: "accent" as const, hint: null },
    { label: "Position not listed", value: has ? rows.filter((row) => !pos(row)).length : null, tone: "steel" as const, hint: null },
  ].filter((line) => line.value === null || line.value > 0);
}

function classBars(rows: RosterRow[]) {
  const has = anyPublished(rows, "class_year");
  const LABELS: Record<string, string> = {
    FR: "Freshmen",
    SO: "Sophomores",
    JR: "Juniors",
    SR: "Seniors",
    GR: "Graduate",
  };
  return (["FR", "SO", "JR", "SR", "GR"] as const).map((year) => ({
    label: LABELS[year] ?? year,
    value: has ? rows.filter((row) => row.class_year === year).length : null,
    hint: year,
  }));
}

function feederStates(rows: RosterRow[]) {
  const hasState = anyPublished(rows, "home_state");
  if (!hasState) return null;
  const tally = new Map<string, number>();
  for (const row of rows) {
    const state = (row.home_state ?? "").trim().toUpperCase();
    if (state) tally.set(state, (tally.get(state) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function internationalCount(rows: RosterRow[]) {
  if (!anyPublished(rows, "home_country")) return null;
  return rows.filter((row) => {
    const country = (row.home_country ?? "").trim().toUpperCase();
    return Boolean(country) && !["US", "USA", "UNITED STATES", "U.S.", "U.S.A."].includes(country);
  }).length;
}

/* ------------------------------------------------------------------ view --- */

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
  const total = rows.length;
  const positions = positionBars(rows);
  const positionMax = Math.max(1, ...positions.map((line) => line.value ?? 0));
  const classes = classBars(rows);
  const classMax = Math.max(1, ...classes.map((line) => line.value ?? 0));
  const states = feederStates(rows);
  const stateMax = states?.[0]?.[1] ?? 1;
  const international = internationalCount(rows);
  const transfers = rows.filter((row) => row.is_transfer === true).length;
  const juco = rows.filter((row) => row.is_juco_transfer === true).length;
  const fourYear = Math.max(0, transfers - juco);
  const highSchool = Math.max(0, total - transfers);

  const bats = anyPublished(rows, "bats");
  const throwsPublished = anyPublished(rows, "throws");
  const positionsPublished = anyPublished(rows, "position");

  return (
    <div className="space-y-4">
      {/* Headline ribbon */}
      <div className="rounded-xl border border-border bg-org-primary p-4 text-org-primary-foreground">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
              Total roster
            </p>
            <p className="tabular font-display text-4xl leading-none font-bold">{total}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">Pitchers</p>
            <p className="tabular font-display text-2xl leading-none font-bold">
              {positionsPublished
                ? rows.filter((row) => isPitcher(row.position, row.two_way)).length
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
              Position players
            </p>
            <p className="tabular font-display text-2xl leading-none font-bold">
              {positionsPublished
                ? rows.filter((row) => !isPitcher(row.position, row.two_way) && pos(row)).length
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">Transfers</p>
            <p className="tabular font-display text-2xl leading-none font-bold">{transfers}</p>
          </div>
          <p className="ml-auto text-[11px] opacity-70">
            {season ? `${season} season` : "Season not stated"} · from{" "}
            {total.toLocaleString("en-US")} published player records
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Block
          title="Depth by position"
          note={gap(rows, "position")}
          className="lg:col-span-2 lg:row-span-2"
        >
          <div className="grid gap-x-8 sm:grid-cols-2">
            {positions.map((line) => (
              <Bar
                key={line.label}
                label={line.label}
                value={line.value}
                total={positionMax}
                hint={line.hint}
                tone={line.tone}
              />
            ))}
          </div>
        </Block>

        <Block title="Pitcher handedness" note={gap(rows, "position")}>
          <Split
            left={{
              label: "Right-handed",
              value: positionsPublished
                ? rows.filter((row) => pitcherOf(row) === "R").length
                : null,
            }}
            right={{
              label: "Left-handed",
              value: positionsPublished
                ? rows.filter((row) => pitcherOf(row) === "L").length
                : null,
            }}
            extra={{
              label: "Hand not stated",
              value: positionsPublished
                ? rows.filter(
                    (row) => isPitcher(row.position, row.two_way) && pitcherOf(row) === null,
                  ).length
                : null,
            }}
          />
        </Block>

        <Block title="Batting side" note={gap(rows, "bats")}>
          <Split
            left={{
              label: "Right-handed",
              value: bats ? rows.filter((row) => row.bats === "R").length : null,
            }}
            right={{
              label: "Left-handed",
              value: bats ? rows.filter((row) => row.bats === "L").length : null,
            }}
            extra={{
              label: "Switch hitters",
              value: bats ? rows.filter((row) => row.bats === "S").length : null,
            }}
          />
        </Block>

        <Block title="Class years" note={gap(rows, "class_year")}>
          <div>
            {classes.map((line) => (
              <Bar
                key={line.label}
                label={line.label}
                value={line.value}
                total={classMax}
                hint={line.hint}
              />
            ))}
          </div>
        </Block>

        <Block title="Throwing arm" note={gap(rows, "throws")}>
          <Split
            left={{
              label: "Throws right",
              value: throwsPublished ? rows.filter((row) => row.throws === "R").length : null,
            }}
            right={{
              label: "Throws left",
              value: throwsPublished ? rows.filter((row) => row.throws === "L").length : null,
            }}
          />
        </Block>

        <Block title="How they got here">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "High school", value: highSchool },
              { label: "4-year transfer", value: fourYear },
              { label: "JUCO transfer", value: juco },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-center"
              >
                <p className="tabular font-display text-2xl leading-none font-bold text-graphite">
                  {item.value}
                </p>
                <p className="meta mt-1">{item.label.toUpperCase()}</p>
              </div>
            ))}
          </div>
          <p className="meta mt-2">
            Counted from the previous school the page named for each player.
          </p>
        </Block>

        <Block
          title="Where they recruit"
          note={states ? null : "The school didn’t publish hometowns."}
          className="lg:col-span-2"
        >
          {states?.length ? (
            <div className="grid gap-x-8 sm:grid-cols-2">
              {states.map(([state, count]) => (
                <Bar
                  key={state}
                  label={state}
                  value={count}
                  total={stateMax}
                  tone="accent"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-steel/70 italic">{NOT_PUBLISHED}</p>
          )}
          <p className="meta mt-3">
            International players:{" "}
            {international === null ? (
              <span className="text-steel/70 italic">{NOT_PUBLISHED}</span>
            ) : (
              <span className="tabular font-semibold text-graphite">{international}</span>
            )}
          </p>
        </Block>
      </div>
    </div>
  );
}
