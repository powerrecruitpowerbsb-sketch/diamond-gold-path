# The school-facts run has stopped — restart it and let it finish

## What I found just now

- No run is active anymore. The last school was updated at 20:33; nothing has moved since.
- Progress so far: **1,433 schools confirmed** against the federal records (up from 894 when we started), 447 with no match yet, 25 unclear.
- Work still queued: **356 waiting**, **33 stuck mid-flight** (left hanging when the run stopped), 70 parked, 13 errored.

So the work isn't finished — it just lost its driver. Nothing is lost or corrupted.

## What to do

1. **Free the 33 stuck items** so they're waiting again instead of looking busy forever.
2. **Restart the run** and keep it going until the queue is empty, at the same steady pace (the federal service limits how fast we can ask, roughly one school every 4 seconds).
3. **Check in on progress** as it goes and report the final tally: confirmed, no match, unclear.
4. **Then handle the leftovers**: retry the 447 no-match and 70 parked schools through the improved matching, and send whatever still can't be settled to the confirm-a-school screen.
5. **Spot-check ten** newly confirmed schools (a mix of community colleges and ones with a state in their name) against their real city, state and enrollment.

## Making it not stop again

The run currently lives in a one-off script that dies with the session. As part of this, move the same logic behind a button on the pipeline screen that processes a batch per click, plus a scheduled runner that drains the queue on its own — so an interrupted run resumes by itself instead of needing to be relaunched by hand.

## Technical notes

- Reset stuck rows: `ingest_queue` where `stage='federal_data'` and `status='running'` with a stale `leased_at` → back to `pending`, `attempts` unchanged.
- Restart via `tmpscripts/fed-sync.ts` (background, paced at ~3.9s/request, 6 workers) for the immediate drain.
- Durable path: reuse `runFederalBatch` in `src/lib/pipeline.functions.ts` for the manual batch button, and add a pg_cron-triggered public API route under `src/routes/api/public/` that leases and processes a bounded batch, with a lease-expiry sweep so stuck rows self-heal.
