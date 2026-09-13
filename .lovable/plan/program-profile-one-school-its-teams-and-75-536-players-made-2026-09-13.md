# Program profile: one school, its teams, and 75,536 players made visible

Rebuild `/programs/$id` as the screen a family reads: the institution first, then the sport, with the roster composition as the centrepiece. Read-only throughout — no writes, no schema changes.

## Page structure

A sport toggle at the top (Baseball / Softball) switches between the school's two teams; if the school fields only one, the toggle shows the other as "not fielded".

```text
[school name]                          [Baseball | Softball]
UNIVERSITY
  Overview
  Academics & Admissions
  Tuition & Cost
  Majors
  Campus & Culture
  Official links
[SPORT]
  Level & Conference
  Coaches
  Roster composition   <- centrepiece
  Roster               <- dense reference table
  Facilities
  Recruiting Intelligence
```

## The three layers, told apart at a glance

- Verified Data — green, each field able to show its source link and last-verified date.
- Our Classification — neutral grey, labelled as Power's judgment, with the supporting evidence shown where one is on file.
- Our Intelligence — red, labelled staff opinion, in its own block, never interleaved with fact.

## Roster composition (the centrepiece)

Summary counts first, from the current season only:

- Total roster size
- Positions: catchers, middle infield (2B+SS), corner infield (1B+3B), first base, third base, outfield (one bucket), RHP, LHP, two-way
- Handedness: RH / LH / switch hitters; RHP and LHP
- Class year: FR, SO, JR, SR, GR
- Transfers, and JUCO transfers
- Geography: top home states, plus a count of international players

Where the school never published a field, the line reads "not published by the school" — never 0. A real zero and an unknown never look alike.

## Roster table

Below the composition: number, name, position, class, bats/throws, hometown, home state, transfer status. 38px rows, hairline dividers, tabular figures, sortable by column.

## Honest empty states

- No roster on file: say so, and still show the athletics and roster addresses held.
- Site blocked: "This school's site blocks automated reading."
- Field the school doesn't publish: "not published by the school".
- Average GPA: "not available" everywhere, permanently.
- Admissions: "Open admission" for open-admission schools, "Not reported" for test-optional and non-reporting schools — kept as distinct states.

## Technical notes

- `getProgramProfile` in `src/lib/search.functions.ts`: add `jersey number`, `bats`, `throws`, `hometown`, `home_country`, `previous_school` to the `roster_players` select (existing columns already cover class year, position, home state, transfer flags). Fields absent from `roster_players` are reported back rather than invented.
- Same reader gains three read-only lookups (approved): the university's sibling program row for the sport toggle, `university_majors` joined to `majors` for the majors section, and `link_health` for the program's roster/coach/athletics addresses so blocked hosts read as blocked rather than blank.
- New presentational components under `src/components/profile/`: layer wrappers (verified / classification / intelligence), a composition counts block, and a sortable roster table built on the console table conventions from step 1.
- No `*.server.ts` file is touched; no migration; nothing writes.

## What you'll see

Two screenshots at the end: one program with a full roster and one with none, so the empty states can be judged next to the populated page.
