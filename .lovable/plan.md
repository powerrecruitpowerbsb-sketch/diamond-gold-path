# Fix "choose a level" — the waiting-its-turn state isn't allowed yet

Clicking a level fails because the work list only accepts a fixed set of job states — waiting, in progress, done, failed, skipped, stuck — and the new "waiting its turn" state isn't one of them. The database rejects it, so nothing is set aside and you see the error.

## The fix

One database change: add "waiting its turn" to the list of allowed job states on the work list. Nothing else changes — the level buttons, the counts, and the collection run already work as intended once the state is permitted.

## After that

- Clicking NCAA Division I releases its teams and sets the rest of the country aside.
- The buttons keep showing "X to do" and "X waiting turn" per level.
- Choosing "Everything at once" puts every set-aside job back in line.

## Technical detail

Migration: drop and recreate `ingest_queue_status_check` so `status` also allows `'held'`, keeping the existing values (`pending`, `running`, `done`, `failed`, `skipped`, `blocked`). Leasing already only selects `pending`/`failed`/`running`, so held rows are naturally skipped by the runner and the watchdog.
