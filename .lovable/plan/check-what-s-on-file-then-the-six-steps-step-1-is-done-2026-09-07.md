# Check what's on file, then the six steps (step 1 is done)

## You were right about Chipola

Chipola's baseball staff page **is** on file — `chipolaathletics.com/sports/bsb/coaches/index`, saved by hand at 17:44. Then at 18:14 the import created a fresh "couldn't find it" row for that same page anyway. The import didn't look at what was already stored before recording a miss.

That's not isolated: of the 364 rows now sitting in "Couldn't find these pages", **72 are for pages we already hold** (48 rosters, 24 staff pages). So the real gap is about 292 rows, not 384.

## The two files you asked for

**File A — pages still not found.** All 364 rows, with the 72 already-satisfied ones marked `already_on_file = yes` so you can see them and skip them. Columns: school, state, sport, which page is missing, school website, athletics site, what we currently store for roster and staff, why the search failed, plus blank `correct_url` and `your_note` for you to fill in.

**File B — audit of the links we already store.** Not all 5,600 — I measured them and the honest risk set is about 580 rows:

- 2,826 of 2,828 roster links already name baseball or softball in the address. Only 2 don't.
- 49 coach links don't name a sport (some are legitimate whole-staff directories).
- 312 roster links sit on a different domain than the athletics site we hold for that school — the likeliest place for a wrong-school link.
- 70 roster links are pinned to a 2024 season or older; 579 are pinned to 2025, which is normal for spring sports right now.

File B is those flagged rows plus a random 150 of the confident ones, so we get a real error rate instead of an assumption. If the 150 come back clean, the other ~2,200 links are trustworthy and we don't touch them.

Both come back the same way your athletics-site file did: corrections save, wrong links are remembered as declined, and only the affected pages get re-searched.

## Fix the miscount while we're there

Before the files are generated, the 72 already-satisfied rows get closed automatically, and the miss-recording path gets a check so a page already on file is never recorded as missing again.

## Then the six steps — step 1 is complete

1. ~~Accept the confident links.~~ Done.
2. **Queue the newly linked programs**, plus the 190 parked and 20 pending jobs, and restart the unattended run so it finishes NWAC and works the backlog. You can close the page.
3. **Turn coach reading back on, in two stages.** 1,832 programs already have a good coach page and no name stored, because automatic coach writing is still off after the Big 12 mistake. First 25 programs you hand-check, using the guards already built (sport proved on the page, school's own domain, "Head Coach" stated in words, name sanity, blank never overwrites a name). All 25 right → open it to the rest.
4. **Read the rosters** for the 878 programs that have a page and no current roster, treating a 2025-26 page as valid interim evidence for spring sports and re-checking later in the year.
5. **Close the last uncertainty:** 200 programs whose sponsorship is unproven, and whatever survives File A, through the one-at-a-time card.
6. **Keep score** with weekly random accuracy checks.

## Technical notes

- File A: read-only export of `url_discovery_queue` no-URL pending rows joined to `programs`/`universities`, written to `/mnt/documents`.
- Satisfied-row cleanup: extend `retireEmptyDiscoveryRows` in `src/lib/link-sweep.server.ts` to close a no-URL row when the program's matching `roster_url` / `coaching_staff_url` is already set, and add the same guard where discovery records a failed result.
- File B flags come from `link-quality.ts` (`matchesProgramSport`, `archiveSeasonPath`, host comparison against `programs.athletic_website`) so the file and the live rules can't disagree. Loader reuses `applyDiscoveredUrl` and the rejected-URL memory.
- Steps 2 and 4 use existing paths: `requeueMissingLinks`, `ingest_queue` / `enqueue_due_refreshes`, cron runner plus watchdog. No schema change.
- Step 3 flips the coach auto-apply guard in the ingest write path, gated on `coach-quality.ts`, with the UCF / Texas Tech / Kansas / Cincinnati-absence fixtures run first.
