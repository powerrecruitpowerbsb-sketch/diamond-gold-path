# Make step 1 run itself

## Why it feels endless

Step 1 checks every roster page and staff page on file — about 6,000 pages — by fetching each one and reading the school name off it. That part is unavoidably slow: one fetch per page.

The real problem is that pressing the button only does **one short burst**: 25 teams, then it stops after about 22 seconds and waits for you to press it again. At that rate, finishing the whole database needs well over a hundred presses. Nothing is being lost — each press picks up exactly where the last one stopped — but you are being made to hand-crank a job that should run on its own.

For comparison, the same check running unattended in the background has already got through 516 pages by itself.

## The fix

Make step 1 behave like the roster step: press once, walk away.

1. Pressing "Check the pages" switches step 1 **on** and returns immediately.
2. The same every-minute schedule that already drives roster collection also does a burst of page checking whenever step 1 is switched on. It keeps its saved position, so bursts chain together with no repeats and no gaps.
3. When it reaches the end of the list, it switches itself off and marks step 1 finished.
4. The button becomes **Stop** while it is on, so you can pause it and resume later without losing progress.

## What you will see

Step 1 shows a live count that keeps climbing on its own — pages checked, wrong ones cleared, ones that couldn't be read — with a rough time remaining. Closing the page, reloading, or leaving overnight changes nothing. No repeated pressing.

Expected duration: roughly 6,000 pages at the current pace works out to a few hours unattended, most of it overnight-friendly.

## Technical notes

- Add an `auto` flag to the `pages` row in `build_stages` (or reuse `status = 'running'` as the on switch) so the scheduled runner knows to work.
- Extend `src/routes/api/public/collection-runner.ts`: before/alongside the collection pass, if the `pages` stage is switched on, call `auditStoredLinks` for one bounded slice (limit ~25, budget ~20s) using the stored cursor, then write back cursor and counters exactly as `runPagesPass` does today.
- Refactor `runPagesPass` in `src/lib/build-stages.server.ts` into a shared `runPagesSlice(supabase, actorId)` used by both the runner and a manual press, so the counting logic lives in one place.
- `runBuildStage("pages")` in `src/lib/build.functions.ts` becomes start/stop of the switch rather than a single blocking pass; ensure `collection_cron_start` is called so the schedule is active while step 1 is on.
- `src/routes/_authenticated/admin.build.tsx`: step 1 gets Running/Stop states and polling identical to the roster step; keep pace/ETA text in plain language.
- Failures (pages that can't be fetched, e.g. an occasional 502) continue to be counted and skipped, not retried forever.
- No change to what counts as a wrong page; coach filling stays held back as-is.
