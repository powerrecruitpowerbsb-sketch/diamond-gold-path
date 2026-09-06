# Where the holes are, and how to close them

Numbers below come from the live database today.

## 1. Coverage is the biggest hole (not review volume)

- 3,115 programs are confirmed to sponsor the sport, but **1,250 have never had a roster pulled** and **2,251 have no head coach at all**. Only 904 programs (29%) carry a coach name.
- **537 queue jobs have used up all 3 attempts** and are sitting dead with nobody looking at them. 7 are marked failed. Nothing surfaces them.
- **90 programs have never been sponsorship-checked**, so they can never enter the queue that requires "verified".
- Academic facts are thin: no GPA on 1,869 of 1,885 schools, no test scores on 1,000, no acceptance rate on 675. Search filters that use those fields silently return nothing useful.

Fix: a single "what's still missing" worklist that counts, per sport and governing body, how many programs lack a coach, a roster, a staff page, and school facts — plus explicit lanes for exhausted and never-checked records. Retry exhausted jobs on a schedule with a different strategy (embedded athletics hop, sport-page search, manual entry) instead of letting them die.

## 2. Accuracy has guards but no proof

- The coach guard (`coach-quality.ts`) and link guard (`link-quality.ts`) are the two things standing between us and another Big 12 mistake, and **neither has a single test**. The only test file in the project is federal matching.
- There is no corroboration requirement: one page is enough to write a coach or a fact. Two independent sources agreeing is the cheapest large accuracy win available.
- There is no measured accuracy. We only find errors when you spot one by hand.
- 35 duplicate roster rows exist (same program, season, player) — nothing in the schema prevents them.
- Per-field provenance exists for coach names (904 of 904), but not consistently for the rest.

Fix:
- Lock the guards with regression tests built from the real failures we hit (UCF soccer coach on a baseball program, Cincinnati single-bio page, Texas State football coach, Seton Hill and Rhodes legitimate-domain false rejects). Re-fetch those exact pages once and freeze them as fixtures so the tests never depend on the live web.
- Require two agreeing sources, or one official sport-specific staff page, before a coach name is written. Anything less is held as an exception, never written.
- Add a weekly automated spot-check: sample 25 programs, re-fetch, compare stored values to fresh ones, and record a running accuracy score per field. That is the number we manage the database by.
- Add a uniqueness rule on roster rows and clean up the 35 duplicates.
- Extend per-field provenance to every written field so any value on screen can be traced to its page and date.

## 3. Repeatability gaps

- Pull-time settlement logic lives in two places (`ingest.server.ts` and `review.server.ts`); they must agree forever or the queue and the pipeline drift apart. It needs shared, tested rules and a test proving both paths make the same decision on the same input.
- Rejections and corrections are one-way: we requeue, but we do not remember *why* a value was wrong, so the same wrong value can be re-proposed and re-approved.
- No undo. A bad sweep cannot be rolled back as a batch.

Fix: one decision module with tests; a rejected-value memory keyed to program plus field plus value; and batch-reversible writes so any sweep can be undone by its run id.

## 4. Scale and operations

- Throughput is invisible. Nothing tells you programs completed per hour, so nothing tells you whether finishing takes two days or two months.
- Failure reasons are not categorised, so we cannot tell "site blocked us" from "page layout changed" from "school has no site".
- No alerting. If collection stalls at 3am or a source starts returning garbage, you learn by opening the page.
- No mistake reporting path from staff or families back into the queue.

Fix: a pipeline health panel with rate, projected completion, failure reasons grouped by cause, and a stall alert; plus a "report a mistake" control on every program that clears the value and requeues it with the reporter's note attached.

## Order of work

1. Freeze regression fixtures and add tests for coach and link guards; fix anything they expose.
2. Two-source corroboration rule for coaches, then re-run only the programs that pass it.
3. Missing-data worklist plus revival of the 537 exhausted and 90 unchecked records.
4. Roster duplicate rule and cleanup; full per-field provenance.
5. Weekly accuracy spot-check with a tracked score.
6. Health panel, failure categories, stall alert, mistake reporting.

## Technical notes

- Fixtures stored under `src/lib/__tests__/fixtures/` as saved page snapshots; guards tested as pure functions with no network.
- Corroboration implemented in the shared decision module; evidence array on `pending_data_changes.proposed_value` already carries source URLs, so a second entry is enough to mark a proposal corroborated.
- Roster uniqueness as a partial unique index on `(program_id, season_year, name)` after deduplication in the same migration.
- Accuracy sampling as a scheduled job writing to a new `accuracy_checks` table (sampled field, stored value, fresh value, verdict), driven by the existing `pg_cron` schedule.
- Exhausted-job revival as a new stage in `ingest_queue` rather than resetting attempts, so history stays intact.
