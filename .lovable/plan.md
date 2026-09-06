# Finish the database: a completion plan with a definition of done

## Straight answer to your question

The last plan would have made the data safer, not more complete. This one is built to finish it.

Where you actually are today:

| Thing | Done | Left |
| --- | --- | --- |
| Schools | 1,885 | — |
| Programs confirmed to sponsor the sport | 3,115 | 215 unverified, 274 confirmed not offered |
| Programs with a roster pulled | 1,865 | 1,250 |
| Programs with a head coach | 904 | 2,251 |
| Programs missing a roster page link | — | 611 |
| Programs missing a staff page link | — | 685 |

So the school list is essentially complete and correct; the per-program facts are about a third done. That is why it doesn't feel like a product yet.

**Also: collection is stopped right now.** Last activity was 17:46 today, 186 jobs are stuck mid-run with nobody reclaiming them, and 622 jobs are waiting. Nothing is progressing while you read this. That is the single biggest hole — the engine only moves when it is running and unstuck.

## Definition of done (what we're driving to)

A program is **complete** when it has: a verified sponsorship decision, an official roster page link, a current-season roster, an official sport staff page link, and a head coach name proven from that page. A school is **complete** when it has federal facts or a recorded reason it can't.

Target: 95%+ of the 3,115 sponsored programs complete, with the remainder listed by name and reason. The product can launch on that, because families search programs, not perfection.

## Can we trust what's already in there?

Schools: yes — matched against the federal directory. Programs, measured today:

- **Does this school have the sport?** Strong. 3,056 of 3,115 "yes" decisions and all 274 "no" decisions come from the federal athletics report, an independent authority. Only 104 conflicts and 126 never-checked programs are unproven.
- **Head coach.** Only 904 programs have one, but all 904 now trace to an official sport staff page checked within the last 30 days, because the unproven ones were cleared. Thin, not wrong.
- **Rosters.** Weakest area. 42,324 current-season players across ~1,381 programs; 1,284 of those have believable squad sizes, 97 are suspiciously short, and 13,226 player rows still sit on older seasons and need clearing or re-pulling.
- **Conference and division.** 616 sponsored programs have no conference and 550 no division — blank, which is honest, but it weakens search.

So the honest read is: sponsorship proven, coaches proven-but-sparse, rosters need a verification pass. Step 0 below is that pass.

## The work, in order

**0. Verify what's already stored, before adding more.**
Re-run every existing program through the same guards used at write time: coach names without official sport-page proof are cleared and requeued, the 97 short rosters and 13,226 stale-season player rows are re-pulled or retired, and the 104 sponsorship conflicts get resolved. Output is a one-page report: how many stored values are proven, how many were cleared, how many need you. That report is the baseline you can trust, and it takes hours, not days.


**1. Make the engine unstoppable (first, today).**
Reclaim the 186 stuck jobs automatically after a timeout, restart on its own after any crash, and keep running on the timer without the page open. Add one honest progress line: programs completed, programs left, current rate, projected finish date. Right now nothing tells you whether you're 2 days or 2 months out — after this, it will.

**2. Fill the 1,250 missing rosters and 2,251 missing coaches.**
These are queued work, not new features. Run them continuously with the current guards in place. Coaches only get written when the page proves the sport and the school; everything else is held, so the Big 12 error class can't recur while the volume runs.

**3. Revive the dead ends instead of losing them.**
537 jobs have exhausted their attempts and 611/685 programs still have no roster/staff link. Give them a second strategy — the embedded-athletics hop, a sport-page search, then the school's own site — before they count as unreachable. Anything still unreachable lands on a short named list for manual entry, which is a finite job you can actually finish.

**4. Prove the coach guard once, with tests.**
Freeze the real failures (UCF, Cincinnati, Texas State, plus the Seton Hill/Rhodes false rejects) as fixed test cases so the guard can never silently regress while volume runs. This is a half-day, and it's what lets step 2 run unattended.

**5. Safety rails that run alongside the fill, not after it.**
Each of these works at write time, so it makes the volume in step 2 trustworthy instead of delaying it:
- **Rejected-value memory** — a value you declined is never proposed again for that program and field.
- **Two-source agreement for coaches** — written only when the sport's own official staff page states it, or two independent pages agree; anything less stays an exception. This is exactly where the Big 12 error came from, so it is not optional.
- **Per-field provenance on every new write** — any value on screen traces to the page and date it came from. This is also what makes the product credible to families.
- **Duplicate protection on rosters** — a uniqueness rule plus a one-off cleanup of the 35 existing duplicates, so re-pulls can never double a team.
- **Weekly accuracy score** — sample 25 programs, re-fetch, compare, report a plain percentage per field. That number is how you know it's accurate without clicking through 3,000 programs.
- **Report a mistake** — one control on any program that clears the value and requeues it with the reporter's note, so errors found in real use get fixed instead of lived with.

**6. Then stop working on the pipeline.**
Once step 1's projection says "complete", the remaining work is product: search, comparison, athlete matching, family experience. The pipeline becomes a background service you check weekly.

## What I am deliberately leaving for later

Batch undo of a whole sweep, backfilling provenance for values written before today, and a two-source rule for non-coach facts. Each is a large retroactive pass over 30,000+ existing rows and none changes what a family sees, so they wait until the fill is complete.


## Technical notes

- Stale-lease reclamation: treat `ingest_queue` rows in `running` with `leased_at` older than 15 minutes as reclaimable inside `runCollectionPass`, plus a watchdog cron that restarts collection when `collection_state.last_beat_at` is older than 10 minutes and `stop_requested` is false.
- Progress/projection derived from `ingest_queue` counts by stage plus completion timestamps over the trailing hour; surfaced through `collection.functions.ts` into the pipeline page.
- Dead-end revival adds a `strategy` attempt ladder to the discovery stage rather than resetting `attempts`, so history stays intact; exhausted-and-unreachable programs surface through a new admin list backed by an existing paginated query.
- Coach guard tests: pure-function tests over frozen markdown fixtures under `src/lib/__tests__/fixtures/`, covering `coachEvidenceVerdict` and `junkHost`.
- Rejected-value memory: keyed on table, record, field and normalized value, consulted in the shared settlement path in `review.server.ts` before a proposal is created.
- Accuracy spot check: scheduled sampler writing to a new `accuracy_checks` table, reported as a percentage per field on the pipeline page.
