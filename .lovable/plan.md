# Fix the "Decide the last schools" screen, then fill in the missing schools automatically

## What's wrong now

The screen is blank because of how it gets its suggestions, not because the schools are gone. There are still 94 schools waiting on a decision (63 with no match yet, 31 with a close-but-unsure match), plus 10 already parked.

Every time the screen loads, the server tries to download the entire national school list — 6,243 records over 63 sequential requests, about 90 seconds. The request gives up before it finishes, so the page renders with nothing in it and no useful message.

## Part 1 — Make the screen load instantly

1. Store the national list in our own database (a new `federal_directory` table: id, name, alias, city, state, main-campus flag, enrollment) instead of re-downloading it on every page view.
2. Add a one-click "Refresh national list" action on the pipeline screen that repopulates that table, fetching pages in parallel batches so it finishes in seconds rather than minutes.
3. The decisions screen reads suggestions from the stored list — no outside call, so it loads immediately.
4. Replace the blank state with real states: loading, "nothing waiting — you're done", and a plain-English error with a retry button if something does fail.

## Part 2 — Find the missing schools' data from the web

For the schools with no federal record, pull the facts from the schools themselves:

1. Find each school's own website (many already have one saved; discover the rest by search).
2. Read the admissions/tuition/about pages and extract only the facts we track: town and state, enrollment, public or private, tuition in/out of state, room and board, estimated cost, acceptance rate, average GPA/SAT/ACT, test-optional, graduation rate, majors offered.
3. Every extracted fact lands in the existing review queue with the page it came from, so nothing silently overwrites what you already have. Facts we can't find stay blank.
4. Once a school has been filled this way, it stops appearing in the decisions list and is marked as filled in by hand/web rather than left "waiting".
5. Run it in bounded batches with a progress readout on the pipeline screen, starting with a 10-school test batch you can eyeball before the rest.

## Result

The decisions screen works again and shows the 94 waiting schools with their closest matches, and the ones the national list simply doesn't contain get their data from their own websites into the review queue — so this stops blocking the rest of the build.

## Technical notes

- New table `public.federal_directory` with GRANTs (`SELECT` to `authenticated`, `ALL` to `service_role`), RLS on, superadmin-only read policy; refreshed by a server function using batched `fetch` against College Scorecard.
- `suggestFederalMatches` in `src/lib/federal-directory.server.ts` swaps `loadDirectory()` for a query against that table, keeping the existing `scoreCandidates`/`verdictFor` logic and conservative thresholds unchanged.
- Web fill reuses the Firecrawl + AI Gateway extraction path in `src/lib/ingest.server.ts` and writes through `pending_data_changes` with `source_type='official'` and existing trust tiers; `federal_match_status` moves to `manual` on completion.
- Batch progress tracked through `ingest_queue` with a new stage so the existing runner/reclaim logic applies.
