# Next step: finish the school facts (988 schools left)

## Where things stand (checked just now)

- Review queue is **empty** — Step 1 is closed out.
- 1,905 schools total: **894 confirmed** against federal data, **927 found no match**, **84 unclear**, 833 never looked up yet.
- **802 school-fact jobs still waiting**, 178 parked as blocked, 2 failed.

So the only thing standing between us and near-complete school facts is matching, not scraping. That's Step 2 of the roadmap, and it costs nothing in scraping fees.

## Why 927 schools found no match

Sampling the unmatched names shows the causes are mechanical, not missing data:

- Names carry a wiki-style state suffix: "Regis College (Massachusetts)", "Butler County Community College (Kansas)".
- Community colleges are stored under a slightly different official name than the federal record ("Orange County Community College" vs its registered name).
- Punctuation and abbreviation differences: "St." vs "Saint", "&" vs "and", "Mt." vs "Mount".
- A few genuinely aren't in the federal data at all (small private and some two-year schools) — those should be marked as such, not retried forever.

## What to build

### 1. Better matching
- Strip the trailing "(State)" suffix and use it as the state hint instead of part of the name.
- Normalize punctuation, "Saint/St.", "&/and", "Mount/Mt.", "-" and apostrophes before comparing.
- Try the name against the federal search with the state constrained, then without, and score candidates on name similarity plus state and city agreement.
- Accept only a clearly best candidate; anything close goes to the human screen rather than guessing.

### 2. Re-run only the schools that need it
- Reset the 927 unmatched and 178 blocked jobs and run them through the improved matcher, in paced batches (the federal service rate-limits).
- Untouched schools (833) get their jobs run in the same pass.
- Report after: newly confirmed, still unmatched, newly unclear.

### 3. A "confirm this school" screen
For the 84 unclear ones plus whatever the retry can't settle:
- Side-by-side candidate cards (name, city, state, enrollment) with one click to pin the right one.
- A free-text search box to look up a school by a different name.
- A "not in the federal data" button that stops it being retried and records why.

This mostly exists already for ambiguous schools — it needs the "not in federal data" outcome and to also cover unmatched schools.

### 4. Verify before finishing
- Confirm confirmed count climbs from 894 toward ~1,700+.
- Spot-check ten newly matched schools (a mix of community colleges and parenthetical-name ones) against their real city, state and enrollment.
- Confirm nothing new lands in the review queue as noise.

## Technical notes

- Name normalization and candidate scoring extend `src/lib/federal-data.server.ts`, reusing the comparison helpers in `src/lib/data-quality.ts` so the trust rules stay on one path.
- Re-run driven by `runFederalBatch` in `src/lib/pipeline.functions.ts` with a new "retry unmatched" action that resets the relevant `ingest_queue` rows before leasing.
- The confirm screen extends `/admin/pipeline`'s existing federal-blocked list and `listFederalCandidates` / `resolveFederalMatch`; the new outcome writes `federal_match_status = 'not_in_federal'` and marks the queue row done.

## After this

Step 3 (program facts at scale, starting with NCAA D1) is next, and it's the first stage that spends real scraping money — worth having school facts complete first.
