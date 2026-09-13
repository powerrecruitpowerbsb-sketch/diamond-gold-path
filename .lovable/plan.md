# Console restyle: a dense research terminal

Part A is reported. This is Part B: the design system, the restyle of the console and its
subpages, a consolidation from fifteen thin sections to seven fuller ones, and the missing
screens that today's data can support read-only.

## The design system

Kept exactly as-is: Source Serif 4 / Public Sans / IBM Plex Mono, the themeable org primary
and accent, and the fixed Verified-Data green and Our-Intelligence red. Those two colors
stay reserved for meaning and are never used for decoration.

Changed once, centrally, so every future screen inherits it:

- Corner radius drops from 13px to 4px. Only status chips stay pill-shaped.
- Both card shadows are deleted. Separation is a 1px hairline border, everywhere.
- Page padding caps at 24px.
- Numbers always render as tabular figures.

New shared page furniture, used by every console screen:

- A page header: title line, an optional one-sentence description, and a single line of
  live counts read from the database — "1,885 schools · 3,238 programs · 75,536 players ·
  last sweep 2h ago". No hero blocks anywhere.
- A record table: 38px rows, hairline dividers, column headers at 11px uppercase muted,
  numeric columns right-aligned and tabular.
- An empty state: one line of muted text. Never a card.

Every four-across stat-tile block in the console is replaced by that one header line.
Every list of records becomes a table rather than a card grid.

## Navigation

A fixed 220px left sidebar replaces the overflowing top strip. Seven sections:

```text
NEEDS YOU  492    Withheld link conflicts · School identity ·
                  Review queue · Discovered links · Permanent blocks
COLLECTION        Live run · Stages · Tools · Blocked sites
SCHOOLS           All schools · Retired · Not offered
TEAMS
MAJORS
ORGANIZATIONS
ACTIVITY          Audit log · Run archive
```

Console home, Build progress, Data collection and Collection tools merge into Collection as
tabs — one screen that answers "where is collection at" instead of four that disagree.
`/dashboard` leaves the console entirely and gets a link in the coach navigation, where it
belongs. The unused duplicate collection panel is deleted. There is no college-player
directory in the console; the roster table and its composition breakdown belong on the
program profile, in a later step.

Every old address keeps working and redirects to its new home.

### Needs you — a landing page, not a merged table

The five stay separate working screens: they carry different evidence and different columns,
and one combined table would be hundreds of unlike rows with mostly empty columns. Above
them sits a landing page listing each with its live count, so everything waiting is visible
at a glance and one click deep:

```text
Withheld link conflicts        287
Permanent blocks               108
School identity decisions       58
Discovered links                27
Review queue                    12
```

The sidebar shows the total of those counts beside Needs you.

## New screens this step can support

These have working logic behind them but no way for a page to ask for it. Each gets a small
read-only reader — no existing server file touched, no write path:

- **Blocked sites** — the 433 quarantined hosts, when each was first blocked, what blocked
  it, and when it was last probed. Read-only this step; the retry button comes with the
  write phase.
- **Withheld links** — the 287 conflicts, with the address, the team, and which school is
  said to hold the domain. Resolving comes with the write phase.
- **Permanent blocks** — the 108 remaining, with the reason each was blocked.
- **Run archive** — the 4 reversible runs and what each touched. Undo comes with the write
  phase.
- **Retired schools** (3) and **Not-offered programs** (366) — lists, so they stop being
  invisible. Restoring comes with the write phase.

## Organizations

This is the prerequisite for a second customer, so it is built for real rather than
read-only. Seat count and plan do not exist on the record, so they are added — the one
approved exception to the phase rule.

- A list of every organization with plan, seats used against seats bought, billing status,
  expiry, and counts of staff, athletes and saved schools.
- Create an organization, set its plan and seats, and invite its first owner in one flow.
- Suspend and restore, driven by the existing billing status and expiry.
- Open an organization to see its detail; viewing as one of its roles is noted as the next
  step, not built here.

## The home page

The four hand-typed numbers ("9 programs", "6 universities") are replaced with the real
counts read from the database, on the same one-line format as the console header.

## Technical notes

- Tokens change in `src/styles.css` only; `--radius` to 4px, `--shadow-card` and
  `--shadow-card-hover` removed along with their eight usages.
- Shared components land in `src/components/console/` (PageHeader, RecordTable, Empty,
  Sidebar) so later screens inherit them without copying.
- The console layout route moves from a top nav to the sidebar; child routes are unchanged
  in address except the four merged collection screens, which redirect.
- New read-only readers go in new `*.functions.ts` files with the existing superadmin guard.
  No `*.server.ts` file is edited and no existing write path is called.
- The organizations work is the only migration: seat count and plan columns, plus grants and
  policies, followed by its read and write functions.
