# Keep the database fresh without a pile-up

## Short answer to your question

It was partly a one-time catch-up. Two of the rules already run at pull time today: a plainly wrong link is thrown away as soon as it is found, and a blank field confirmed by a school's own site fills in by itself. Everything else added yesterday — accepting real athletics sites, replacing an older value with the school's own newer one, saving a short roster and queuing a fuller pull, dropping repeat proposals, and rejecting impossible numbers — only runs when you press the tidy button. So yes, without this change a pile would build again on every sweep, just smaller.

## What changes

1. **Decisions move to the moment of the pull.** The same rulebook that cleared the queues runs inside each pull, so a new item is only written to your list if it is a genuine judgement call. Nothing to press.
2. **A safety net still sweeps.** After each round of collection, the tidy pass runs by itself on anything left over (for example an item written before the rules changed, or one that needed the school's other program to be confirmed first).
3. **Automatic refresh on a set cadence**, once collection has finished the country:
   - Rosters: twice a year (early February and early September), so each new season and each mid-season change is picked up.
   - School facts — cost, enrollment, graduation rate, academics: once a year (each July, after federal figures update).
   - Each school is due on its own anniversary rather than all 1,885 on one day, so the work spreads out and stays inside normal running costs.
4. **You only see real decisions.** Applied changes are not announced; they stay browsable in the activity log if you ever want them. Your two lists become exception lists — normally short.
5. **A plain status line** on the collection page: how many programs and schools are due, when the next refresh is, and how many items are actually waiting on you.

## What still reaches you

- A roster labelled with an old year, or one with an impossible number of players.
- Two sources disagreeing on the same fact.
- A link the rules cannot confidently call right or wrong, and schools where three searches in a row failed.

## Technical notes

- Extract the decision rulebook so one code path serves both pull time and the sweep: `pendingVerdict`/`rosterKeepable`/`fieldValueSane` (in `review.server.ts`, `data-quality.ts`) called from `ingest.server.ts` before a proposal row is written, replacing the narrower `isAutoApplicable` gate; `classifyLink` in `discovery.server.ts` extended to also auto-confirm (not only auto-reject) using `looksLikeAthleticsHost` plus sibling-program hosts.
- `runCollectionPass` (`collection.server.ts`) ends each pass by calling `sweepPendingUntilDone` and `sweepLinksUntilDone` with a small budget, so the existing per-minute cron runner covers the backstop; no new schedule for that.
- Refresh scheduling: add `refresh_due_at` (and last-refreshed timestamps) to `programs`/`universities` via migration, plus a daily `pg_cron` job that enqueues due `program_scrape` / `school_facts` rows into `ingest_queue` — one job per day, not per minute, and it enqueues only, letting the existing runner do the work.
- Roster cadence keyed to `acceptableSeasonYears` so a February pull accepts the current season and a September pull accepts the incoming one.
- Admin surface: a "Refresh schedule" panel on `/admin/pipeline` reading counts of due/overdue rows, with a manual "refresh this school now" action.
