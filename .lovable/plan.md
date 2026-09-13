# Search and results: a discovery tool, not a lookup box

Read-only screens. No schema changes. The only backend edits are to the search
function's selected columns and filter conditions.

## The results list becomes a dense table

One row per team, 38px rows, hairline dividers, tabular figures, no cards:

```text
School            State  Region     Level     Conference        Enrol   Net price  SAT   ACT  Roster  Head coach
Lenoir-Rhyne      NC     Southeast  NCAA D2   South Atlantic    2,140   $22,400    1080  21   38      Chris Weaver
```

- Clicking a row opens the team profile. Compare and shortlist stay available per row.
- Every column sorts, including State and Region.
- Match count above the list, with the "first 400 of N" note kept when the list is capped.
- Missing values read as the honest state already stored: "Open admission", "Not reported",
  "Not published", "Not confirmed" — never a blank cell.

## Filters

Always visible: sport toggle, school name, state, region, governing body + division,
net price range, major.

Behind "More filters": academic classification (labelled "not classified yet"),
conference, public/private, school size, campus setting, religious affiliation,
scholarships, SAT, ACT, acceptance rate, tuition, total cost of attendance,
roster size, and the new roster composition filters.

Active filters appear as removable chips above the results, so a family can see exactly
why the list is what it is, and clear one at a time.

## Region is computed from state

`universities.region` holds a value for 6 of 1,882 schools, so the stored column cannot
drive a filter. Region becomes a fixed grouping of states, computed in the app:
Northeast, Southeast, Midwest, Southwest, West, and Pacific (Alaska, Hawaii, and
territories). It works as a filter and as a sortable results column for every school,
with nothing to maintain.

Two related items reported, not changed:

- Other screens that read the stored `region`: the athlete shortlist summary and
  organization dashboard "targets by region", the compare table, the admin school
  editor's Region field, and the school profile. All of them are showing an almost
  always empty value. Recommendation: drop the stored column from those screens in
  favour of the computed grouping, or backfill it from the grouping.
- The team profile currently prints "Region: Not published by the school". Region is
  ours to assign, not something a school publishes; that line should show the computed
  region instead. Held for approval.

## The four data fixes

1. **Average GPA filter removed** — 16 of 1,882 schools hold a value and there is no
   institution-wide source, so the filter returns almost nothing. Removed from the URL
   schema and the filter panel. The profile keeps its permanent "not available".
2. **Net price becomes the primary cost filter** — `est_net_price` is on file for 1,820
   of 1,882 schools and is what a family actually pays. Tuition and total cost of
   attendance move behind More filters.
3. **Conference marked when unconfirmed** — confirmed for 1,780 NCAA teams, unconfirmed
   for the other 1,327 (140 NCAA, 359 NAIA, 626 NJCAA, 157 CCCAA, 45 NWAC). Every
   conference stays selectable; unconfirmed ones are flagged in the list and in the
   results column, and choosing one shows a note that the list may be incomplete.
4. **Roster composition filters** — behind More filters, using the same counting rules
   as the team profile:
   - roster size range (kept)
   - count at a position group — "2 or fewer catchers", with the profile's groups
     (catcher, middle infield, corner infield, infield spot not stated, outfield,
     pitcher, utility)
   - seniors graduating at a position group — "2 or more senior catchers"
   - transfer share of the roster, as a percentage range
   These read roster detail only when one of them is in use, so an ordinary search stays
   as fast as it is now. A team whose school never published positions is excluded from a
   position filter and reported as such rather than counted as zero.

## Demonstration

The requested combination cannot return rows as literally stated, because
`universities.region` is empty — that is the bug fix above. With region computed from
state, NCAA D2 baseball, Southeast, under $30,000 net price, offering nursing returns
56 teams. That is the screenshot I will show, alongside the chip row and a sort by net
price.

## Technical notes

- `src/lib/search-schema.ts`: drop `gpaMin`/`gpaMax`; add `netPriceMin`/`netPriceMax`,
  `positionGroup`/`positionMax`/`positionMin`, `seniorGroup`/`seniorMin`,
  `transferPctMin`/`transferPctMax`, and `sort`/`dir`; keep `region` but validate it
  against the computed grouping.
- New `src/lib/regions.ts`: state-to-region map, region list, `regionOfState()`. Shared
  by the filter, the results column, and the profile line once approved.
- `src/lib/search.functions.ts`: `searchPrograms` filters net price on
  `universities.est_net_price`, resolves region to a state list via `in()`, and adds
  `avg_act`, `conference_verification` to the selected columns. When a composition
  filter is active it reads `position, class_year, is_transfer, two_way, throws` for the
  matched programs and filters in memory using `positionGroup()` from
  `src/lib/position-group.ts`. `getSearchFacets` returns conferences with their
  verification state instead of bare strings.
- `src/routes/_authenticated/search.tsx`: rebuilt around `RecordTable`-style dense
  markup, sort state in the URL, chip row, and the six/rest filter split.
- No `*.server.ts` file is touched, nothing writes, and no migration runs.
