# Clear the last 120 schools automatically

## What the remaining list actually is

The 120 schools still waiting are not obscure. They include University of Michigan, Penn State, Texas A&M, North Carolina State, the Naval Academy, and a long tail of community-college branch campuses like CCBC-Catonsville and Metropolitan Community College-Longview.

Every one of these *is* in the federal directory. They are stuck because the match step can't decide between a main campus and its branches, or because our name is written differently ("U.S. Naval Academy" vs "United States Naval Academy"). So the answer is not typing them in by hand — it's teaching the matcher the few signals it currently throws away. Hand entry should be the last resort for a handful of schools, not the plan for 120.

## Three passes, cheapest first

**Pass 1 — main campus wins (expected to clear most of the ambiguous 55)**

When our name is a plain school name with no campus qualifier ("University of Michigan"), and several federal records tie, prefer the one flagged as the main campus. When our name *does* carry a qualifier ("Penn State Beaver", "CCBC-Catonsville"), require the qualifier to appear in the federal record's name so it can't quietly grab the flagship. Two extra tie-breakers when names are still level: much larger enrollment, and matching city.

**Pass 2 — a name-variants dictionary (expected to clear most of the unmatched 65)**

Add the abbreviation and punctuation patterns that governing-body directories use but the federal directory does not: "U.S." / "United States", "St." / "Saint", "A&M" / "Agricultural and Mechanical", "–" vs "-", "(Ohio)" / "(Texas)" state suffixes, "Univ" / "University", "CC" / "Community College", "Tech" / "Technical". Also try the name with any trailing parenthetical or campus phrase stripped, and try the athletics-known short name.

**Pass 3 — one bulk sweep against the whole directory**

For anything still unresolved, pull the full federal institution list once (about 6,500 rows, one paged download rather than per-school lookups) and match offline against every record including alternate names. No rate limits, no cost, and it catches cases where our name is too different for a name-based query to return the right record at all.

After the three passes run, whatever remains gets a decision from you — realistically a handful of very small or brand-new schools. Those keep the two existing choices (pick the record yourself, or park it) plus the hand-entry finish described below.

## Hand entry, for the handful that truly aren't listed

A parked school's edit screen gets a short banner: federal data has nothing for this school, here are the cost and academic details still blank, and a "Mark as filled in by hand" button that closes it out once they're filled. Those schools then count as complete and stop reappearing.

On the school and program pages, a school with no federal record shows a quiet line — "Cost and academic details entered by hand" or "not yet available" — so blank cost fields never read as free.

## Reviewing the result

Each pass reports how many it resolved and shows a sample of before/after matches before anything is written, so a bad rule is caught on 10 schools rather than 900. Automatic fills only ever fill blanks; anything that contradicts an existing value goes to the review queue as it does now.

## Technical notes

- `searchScorecard` in `src/lib/federal-data.server.ts` requests `FIELDS_WITH_MAJORS`, which omits `school.main_campus`; `candidateOf` also drops `latest.student.size`. Add both to the field list and to the candidate shape, then use them in the scoring in `src/lib/federal-match.ts`.
- Pass 1 lives in `federal-match.ts`: a `campusQualifier()` helper detects a trailing campus token in our name; when absent, `main_campus === 1` adds to the score and satisfies `CONFIRM_LEAD`; when present, records whose name lacks the qualifier are penalised below `CONSIDER_SCORE`.
- Pass 2 extends the existing alias/synonym tables in `federal-match.ts` and the `queryVariants` generator. Unit-testable without network calls — add a small vitest file covering the stuck names captured from the current queue.
- Pass 3 is a new `src/lib/federal-directory.server.ts`: pages `per_page=100` over `school.operating=1` with id/name/alias/city/state/main_campus/size only, caches the rows in memory for the run, and scores them with the same `federal-match.ts` functions. Triggered by a new bounded server function so it runs from `/admin/pipeline` alongside the existing controls.
- Hand-entry finish: `universities.federal_match_status` already permits `manual`, and nothing writes it. New `markFederalManual({ universityId })` in `src/lib/pipeline.functions.ts` sets it, stamps `federal_synced_at`, closes the `federal_data` queue row, and writes `data_field_sources` rows with `source_type: 'manual'` so the citation line keeps working. Completeness driven by `SOURCED_UNIVERSITY_FIELDS` in `src/lib/admin-schemas.ts`. Add `manual` to the statuses the gap-fill in `federal-data.server.ts` refuses to overwrite.
- No schema migration required.
