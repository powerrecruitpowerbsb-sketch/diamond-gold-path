# Why step 1 stopped after one batch

You're right — it barely moved. It checked 99 pages at 23:45 and then nothing.

The cause is confirmed. Step 1 relies on the every-minute background schedule, but the thing that schedule calls first asks "is roster collection running?" Roster collection isn't running (it finished earlier today, "All queued work is finished"), so on its very first tick the schedule cancelled itself — and page checking with it. That's why you got exactly one batch and then silence, no matter how long you waited.

## The fix

1. The every-minute trigger stops treating roster collection as the only reason to keep going: it also keeps running while step 1 is switched on, and only cancels itself when both are off or finished.
2. Pressing "Check the pages" also arms the schedule, so it starts within a minute even when nothing else is running.
3. The five-minute safety check learns the same rule, so if the schedule ever gets cancelled while step 1 is on, it puts it back automatically.
4. Step 1 resumes from where it stopped — the 99 pages already checked are not re-done.

## What you'll see

Press "Check the pages" once; within a minute the count starts climbing and keeps climbing with the page closed. Roughly 6,000 pages at this pace is a few hours, fine to leave overnight. "Stop" still pauses without losing position.

No change to what counts as a wrong page, and coach filling stays held back as before.

## Technical notes

- `trigger_collection_runner()`: return/unschedule only when collection is inactive AND `build_stages.pages.status <> 'running'`. When collection is inactive but pages is on, still POST to `runner_url` (the runner already handles page-only mode).
- `collection_watchdog()`: apply the same combined condition before its early return, and re-arm the schedule when pages is on.
- `startPagesCheck` in `src/lib/build-stages.server.ts` already calls `collection_cron_start`; keep that, and make sure the pages row is written before the RPC so the first tick sees it on.
- Migration only touches those two functions; no schema change.
