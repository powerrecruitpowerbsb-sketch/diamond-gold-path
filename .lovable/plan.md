# Check the team links first, then the six steps to a real database

## Short answer on the audit: yes — but you don't need to check 5,600 links

I measured what's actually on file for the 3,108 sponsored programs:

- 2,828 roster links, 2,784 coach links.
- 2,826 of the 2,828 roster links name baseball or softball in the address itself. Only 2 don't.
- 49 coach links don't name the sport (some are legitimate whole-staff directory pages).
- 312 roster links sit on a different domain than the athletics site we hold for that school — the single most likely place for a wrong-school link.
- 70 roster links are pinned to a 2024 season or older; 579 are pinned to 2025, which is normal for spring sports right now.

So the links are in far better shape than the missing-page pile suggested. Rather than a 5,600-row file, **Step 0 gives you about 580 rows worth checking** — every link that fails one of those tests, plus a random 150 of the confident ones so we can measure the true error rate rather than assume it.

## Why so many real sites were missing in the first place

Not a database problem. Your 380 schools were schools whose athletics section lives *inside* the main school website — no separate nickname domain — which is exactly what automatic web search is worst at, and it concentrates in NJCAA, NAIA, CCCAA and NWAC. The schools themselves check out: 1,826 of 1,885 confirmed against the federal school directory, 52 genuinely absent from it, 7 matched by hand.

The coach gap has a different cause again: 1,832 programs already have a good coach page saved and no name stored, because automatic coach writing is still switched **off** after the Big 12 mistake. That's a switch, not missing data.

## Step 0 — the audit file (before anything else)

A CSV of roughly 580 rows: school, state, sport, the athletics site, the stored roster link, the stored coach link, why it was flagged, and two blank columns for your corrections. You mark what's wrong; corrections load back the same way your athletics-site file did — wrong links remembered as declined, and only the affected pages re-searched.

The random 150 give us a number: if they come back clean, the remaining ~2,200 unflagged links are trustworthy and we move on. If they don't, we widen the audit before building on top of them.

## Then the six steps

1. **Accept the confident links.** 567 pages found from your corrected addresses are waiting on "Links to check". Run the tidy pass; only the unsure ones stay for you.
2. **Queue the newly linked programs**, plus the 190 parked and 20 pending jobs, and restart the unattended run so it finishes NWAC and works the backlog.
3. **Turn coach reading back on, in two stages.** First 25 programs you hand-check against the official pages, using the guards already built (sport proved on the page, school's own domain, "Head Coach" stated in words, name sanity, blank never overwrites a name). All 25 right → open it to the full 1,832.
4. **Read the rosters** for the 878 programs that have a page and no current roster, accepting a 2025-26 page as valid interim evidence for spring sports and re-checking later in the year.
5. **Close the last uncertainty:** 200 programs whose sponsorship is unproven and the 365 searches that found nothing, through the one-at-a-time card.
6. **Keep score** with weekly random accuracy checks.

## Technical notes

- Step 0 is a read-only export plus a loader that reuses `setAthleticsSiteByHand` / `applyDiscoveredUrl` and the rejected-URL memory. Flags come from `link-quality.ts` (`matchesProgramSport`, `archiveSeasonPath`, host comparison against `programs.athletic_website`), so the file and the live rules can't disagree.
- Steps 1, 2, 4 use existing paths: `sweepDiscoveredLinks`, `requeueMissingLinks`, `ingest_queue` / `enqueue_due_refreshes`, and the cron runner plus watchdog. No schema change.
- Step 3 flips the coach auto-apply guard in the ingest write path, gated on `coach-quality.ts` with the existing UCF / Texas Tech / Kansas / Cincinnati-absence fixtures run first.
- Coach writes stay off until the 25-program pass is verified by hand.
