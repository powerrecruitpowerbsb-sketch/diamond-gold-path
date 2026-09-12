# Full crawl: every program except the ones marked "doesn't field the sport"

First run with the single reader, provenance on every write, and the identity guards in place.

## What runs

One resumable job, roster/coach reading only:

- Population: every program whose offering status is not "not offered" — including the 125 unverified ones.
- It reads only addresses already on file (school site, athletics, coach page, roster page). No searching for new addresses, and the parked re-search queue stays parked.
- A program with no address on file is skipped and counted, not attempted.
- Individual failures never stop the run: each program's outcome is recorded and the job moves on.
- One request at a time per host, existing delay, 30s timeout, and 3 retries with backoff unchanged. Quarantined sites are skipped during the main run.
- At the end of the run, every quarantined site (78 of them) gets exactly one attempt, no retries. Any that now respond come out of quarantine and their pages are read; any that still block stay quarantined. The outcome per site is reported.
- Progress is written to a checkpoint file after every program, so an interruption resumes where it stopped rather than restarting.
- Every write goes through the guarded writer: a roster or composition summary read from a domain belonging to another school is refused and logged instead of saved.

Nothing about the run changes existing addresses, and nothing is deleted.

## What you get when it finishes

All seven reports, one file each in your documents folder, plus a short summary in chat — and an eighth short file for the quarantined-site retry.

1. **Coverage by governing body** — programs attempted, usable roster %, head coach %, side by side with the 100-school sample (45% rosters, 26% head coaches).
2. **Which reader read each roster** — structural vs AI fallback, counted overall and by governing body, with the reason the fallback fired each time it did.
3. **Every refused write** — roster writes and composition summaries: program, school, stored address, the school the domain actually belongs to, and the reason. This is the cleanup list.
4. **Programs that ended with no data**, grouped by reason: blocked host, no address on file, 404, page read but nothing extracted.
5. **Roster composition at scale** — total players written, and the spread of bats, throws, class year, transfers, JUCO transfers, home state and home country, so you can see whether the four new fields populated across the database rather than only on the fixtures.
6. **Disagreements with the league lists** — programs marked not offered that still yield a roster (the crawl will read those addresses in a separate read-only sub-pass purely to detect this, writing nothing), and programs marked offered that yield nothing.
7. **Head coach** — how many programs ended with a head coach name, and for those whose coach page was read but named nobody, the titles the page actually carried.

## Technical notes

- New script `tmpscripts/full-crawl.ts`: pages the program list, groups by host, and calls `ingestProgram` (which already routes rosters through `readRoster` and coaches through the tested coach reader). Checkpoint JSON in `/tmp`, `--budget <seconds>` to bound a shell call, re-runnable until the queue drains.
- Report 6's not-offered sub-pass uses `readRoster` directly against the stored roster URL with no write path, so a false "not offered" is detected without contradicting the league decision in the database.
- Reporting script `tmpscripts/full-crawl-report.ts` reads `roster_players`, `roster_snapshots`, `roster_write_refusals`, `link_health`, `unreadable_pages`, and the per-program outcomes from the checkpoint, and emits the CSVs.
- Refusals come from `roster_write_refusals` (kinds roster/coach/snapshot) plus snapshots written with `suspect = true`.
- Composition spread is computed over rows stamped with this run's id, with the pre-existing 57k rows reported separately so old-code rows don't dilute the new-field percentages.
