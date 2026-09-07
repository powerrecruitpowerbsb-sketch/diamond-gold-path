# Where the overnight run got to, and what's next

## What happened overnight

The run started at 23:32 and worked in order through D1, D2, D3, NAIA, NJCAA and into the California (CCCAA) level, finishing 8,826 pieces of work.

- Rosters: 1,975 teams now have a squad list, 58,488 players in total (3,343 added in the last stretch alone)
- Head coaches on file: 954
- New links found: 1,573 are waiting for a yes/no from you
- School facts waiting: 14

It then **stopped at 04:07** and did not pick itself back up. 20 pieces of work are stuck marked "in progress" (nothing is actually running them) and 225 are still waiting their turn, including the last two levels (California partly, Northwest not started).

## What still needs doing

1. **Restart the run and stop it dying quietly.** Free the 20 stuck items, restart from where it left off, and make the automatic minder actually restart a run that goes quiet — that's what failed here.
2. **Finish the last two levels** (California, Northwest) so every level is complete.
3. **Head coaches are the big gap.** 2,202 teams that definitely play the sport still have no coach on file. This needs its own pass over the official staff pages, with the safety checks we built, before any of it is trusted automatically.
4. **Season mismatch.** The current school year is 2026-27, but only 527 teams have a 2026-27 squad; 1,462 are still on last year's list. Those need a fresh pull as schools publish.
5. **574 teams are missing an official roster or staff link** — those can't be pulled until a link is found or pasted in.
6. **Cut the 1,573 waiting links down** with the automatic sorting rules rather than by hand.
7. **Re-check the 25 oversized squad lists** (60+ players) under the new "every player must appear on the page" rule, and replace anything that fails.

## Technical notes

- `collection_state.is_running=false`, `current_wave=cccaa`, last beat 04:07 UTC; `stop_requested=false`, so the stop was not requested — `collection_watchdog()` failed to restart it.
- 20 `ingest_queue` rows in `running` with leases older than 20 minutes; `reclaim_stale_leases` needs to run and the watchdog's restart branch needs a fix plus a log of each pass so a silent stop is visible next time.
- `roster_players` season split: 2027 → 527 programs, 2026 → 1,462, so `currentSeasonYear()` is 2027 and most stored rosters are a year behind.
- Coach fill remains gated: no broad auto-apply until the official-page fixtures and regression tests for UCF/Cincinnati/Big 12 pass.
- Oversized-roster re-check uses the already-built `roster-recheck.server.ts` path, bounded, snapshots kept.

Order of work: (1) and (2) first so collection is moving again, then (7) and (6) as bounded clean-ups, then (3) as its own carefully gated pass.
