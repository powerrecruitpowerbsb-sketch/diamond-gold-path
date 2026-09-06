# Pre-flight before the nationwide run

Short answer: almost. The safety work is in place and all checks pass, but four things should be settled first — otherwise the run will either stall silently or bury you in review items again.

## Where things stand right now

- 3,115 teams confirmed as having the sport, 215 still unconfirmed
- 904 head coaches stored (the rest blank on purpose, after the bad ones were cleared)
- 808 jobs waiting, none running, 7 jobs that failed three times and stopped
- 84 facts and 1,226 links still waiting for a decision
- No duplicate roster entries
- Collection is stopped (last activity today, 17:46 UTC)
- The random accuracy check has never successfully recorded a result

## What to do first

1. **Prove the accuracy check works.** The permission problem was fixed but never retested. Run "Check 12 at random" and confirm results are saved. If it still fails, fix it before the run — this is the only ongoing measure of whether the data stays right.

2. **Confirm the coach rules against the real pages.** Fetch the live UCF, Cincinnati and one other Big 12 staff pages and keep them as fixed examples the tests run against. Right now the tests use hand-written examples, so nothing proves the rules behave correctly on the actual pages that produced the wrong coaches. Also set UCF's coach to Rich Wallace by hand as a reference point.

3. **Make it restart itself.** Today a stuck run needs you to notice. Add a small heartbeat check that frees stuck jobs, retries jobs that failed for temporary reasons, and restarts the runner if it has gone quiet — plus a visible "last activity" and "stopped unexpectedly" line on the progress board.

4. **Clear the 1,310 waiting items before adding more.** Sweep the existing backlog with the current rules (auto-accept clearly valid official pages, auto-reject junk, keep only genuine disagreements) so you start the run from a near-empty queue and can see whether the new rules are actually holding.

## Then start the run, in order

Confirm the 215 unknown sponsorships → line up every missing roster page, staff page, roster and coach → run in waves by level (D1, D2, D3, NAIA, NJCAA, CCCAA, NWAC), pausing after the first wave to spot-check 20 teams by hand before letting the rest go.

## Technical notes

- Retest `runAccuracySample`; `accuracy_checks` has 0 rows despite the INSERT policy migration.
- Add real HTML fixtures under `src/lib/__tests__/fixtures/` and assert `coachEvidenceVerdict` on them; keep `tmpscripts/coach-audit.ts --apply` off until those pass.
- Watchdog: extend the `pg_cron` tick to call `reclaim_stale_leases`, reset transient `failed` rows below the attempt cap, and re-arm `collection_state` when `last_beat_at` is older than 10 minutes.
- Backlog: `sweepPendingUntilDone` + `sweepLinksUntilDone` with `apply: true`, in bounded passes, coach fields excluded from auto-apply.
- Gap queueing uses `enqueueGapWork` from `completion.server.ts`; investigate the 7 exhausted jobs before requeueing them.
