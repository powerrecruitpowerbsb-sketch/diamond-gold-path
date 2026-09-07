# The schools are sound — the missing piece was links, and most of that just closed

## What the numbers actually say

Your school list is not off:

- 1,826 of 1,885 schools are confirmed against the federal school directory. 52 are genuinely not in it (very small or recently opened), 7 you matched by hand. Nothing is unaccounted for.
- Every sponsored program but 8 now has an athletics address.
- Roster page links: 2,796 of 3,108. Coach page links: 2,752 of 3,108.

So the 380 schools you filled in by hand were not missing schools — they were schools whose athletics section lives *inside* the main school website (no separate `go...` domain), which is exactly the case automatic search is worst at. They are heavily small-college: NJCAA, NAIA, CCCAA and NWAC schools are where the gap concentrated.

The coach and roster gaps have a different, known cause:

- 1,832 programs have a good coach page saved but no coach name stored — because automatic coach writing is still switched **off** after the Big 12 mistake. That is a switch we haven't turned back on, not missing data.
- 878 programs have a good roster page saved but no 2026-27 roster read yet — the run finished its queue before these newly-corrected links existed. Plus spring sports legitimately still show 2025-26 on many sites.

## The order of work from here

1. **Accept the confident links.** 567 pages found from your corrected addresses are waiting on "Links to check". Run the tidy pass so they save to the programs; only the unsure ones stay for you.
2. **Queue the newly linked programs.** Everything that just gained a roster or coach page goes back into the collection queue, along with the 190 jobs currently parked and the 20 still pending. Then restart the run so it finishes NWAC and works the new backlog unattended.
3. **Turn coach reading back on, in two stages.** First a 25-program pass you hand-check against the official pages, using the evidence rules already built (sport proved on the page, school's own domain, "Head Coach" stated in words, name sanity, blank never overwrites a name). If all 25 are right, open it to the full 1,832 with the same rules and the mistake-report/undo path in place.
4. **Read the rosters.** Pull the 878 programs that have a page and no current roster, accepting a 2025-26 page as valid interim evidence for spring sports and re-checking those later in the year.
5. **Close the last uncertainty.** 200 programs whose baseball/softball sponsorship is still unproven, and the 365 searches that found nothing at all — worked through the one-at-a-time card, same as you've been doing.
6. **Keep score.** Weekly random accuracy checks so drift shows up as a number rather than a surprise.

## Technical notes

- Steps 1, 2, 4 use existing paths: `sweepDiscoveredLinks`, `requeueMissingLinks`, `enqueue_due_refreshes` / `ingest_queue`, and the cron-driven runner plus watchdog. No schema change.
- Step 3 flips the coach auto-apply guard in the ingest write path, gated on `coach-quality.ts` (`headCoachStated`, host/sport proof, name sanity) with the existing regression fixtures (UCF, Texas Tech, Kansas, Cincinnati-absence) run first.
- Step 5 reuses `markSportNotOffered` and `setAthleticsSiteByHand`; both stay reversible.
- Coach writes stay off until the 25-program pass is verified by hand.
