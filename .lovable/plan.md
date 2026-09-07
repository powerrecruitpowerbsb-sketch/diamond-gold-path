# Finish the database: four stages, one screen

## What is running right now

- The stored-page sweep **is running** (restarted 23:08, currently in round 3+). It re-reads every roster and staff page on file and checks the page really belongs to that school and that sport. So far: 199 pages checked, 199 confirmed, 0 wrongly assigned, 6 unreadable. Unclear cases land in a file for you, nothing else needs your attention.
- Collection itself is **idle**. It stopped on the junior-college wave and still has 303 queued items plus 174 stuck items.

## Where the data actually stands

| | Count |
|---|---|
| Schools | 1,885 |
| Teams confirmed as real programs | 3,111 |
| Teams confirmed not offered | 321 |
| Teams still unknown | 172 |
| Confirmed teams with an athletics site | 3,102 of 3,111 |
| Confirmed teams with a roster page | 3,014 |
| Confirmed teams with a staff page | 2,993 |
| Confirmed teams with a roster loaded | 2,010 |
| Confirmed teams with a head coach on file | 923 |
| Waiting on you: link decisions | 52 |
| Waiting on you: fact decisions | 1 |

Schools and pages are essentially done. The two real gaps are **rosters (about 1,100 teams)** and **coaches (about 2,190 teams)**. Nothing below re-does the school import, the athletics-site work, or the pages you already supplied.

## The four stages, in order

**Stage 1 — Finish checking the pages we already have (running now, no action)**
Let the sweep finish. Wrongly assigned pages get cleared and re-searched automatically; only genuinely unclear ones are listed for you.

**Stage 2 — Restart collection and drain the queue**
Restart the run so the 303 queued and 174 stuck items finish, then let it complete the junior-college and NWAC waves. This fills rosters and stores coach candidates for teams that already have pages.

**Stage 3 — Turn coaches on, safely**
Coach saving has been off since a Big 12 name came back wrong, which is why only 923 of 3,111 have one. To switch it back on:
1. Re-read the current official staff pages for 25 named programs (UCF, Cincinnati, the Big 12, and a spread of D2/D3/NAIA/JUCO) and lock them in as permanent test cases.
2. Require, for every saved coach: the page is on the school's own athletics domain, the page names the sport, and the page explicitly labels that person head coach. Anything short of that is not saved.
3. Run the tests. If all 25 come back right, turn coach saving on for the whole backlog in one pass. If any fail, it stays off and you get the list of failures.

**Stage 4 — Close out the leftovers, then keep it fresh**
- Decide the 172 unknown teams: confirmed as offered or marked not offered (reversible).
- Clear the 52 link decisions and 1 fact decision.
- Then it runs itself: rosters re-pulled twice a year, school facts yearly, and a weekly random accuracy spot-check.

## One screen, one button per stage

Today several admin pages overlap. Replace them with a single **Build progress** page laid out as the four stages above, top to bottom:

1. **Status line** — what's running, which stage, how much is left, an ETA.
2. **Four stage rows**, each with a progress bar (done / not offered / left) and exactly one button:
   - Stage 1 — "Check the pages we have" → Running… (live counts)
   - Stage 2 — "Finish rosters" → starts collection and drains the queue
   - Stage 3 — "Turn coaches on" → runs the 25-program test, then fills coaches if it passes
   - Stage 4 — "Close out the leftovers" → decides the unknown teams and clears remaining decisions
   Each button is greyed out with a short reason ("waiting on Stage 1") until the stage before it finishes, turns into a live "Running… / Stop" state while working, and shows a green "Done" line after. If a stage is already partly complete it picks up where it left off — nothing is re-done.
3. **Needs you** — one card at a time, only when a decision genuinely can't be made automatically: school, sport, what's missing, and buttons Save this page, Search again, No baseball program, No softball program, Skip.
4. **Report a mistake** — for anything wrong you spot in the app; it clears the value and re-searches it.

Everything else (raw queues, logs, collection internals) moves behind a "Details" link so it's out of the way.

## Definition of done

For every one of the ~3,111 confirmed teams: the school's athletics site, a roster page, a staff page, a current roster, and a head coach proven from that school's own staff page — or the team explicitly marked not offered. Anything that can't reach that gets listed by name with the reason, and nothing is claimed as accurate that hasn't been proven.

## Technical notes

- Stage 1 uses the running `tmpscripts/link-audit-run.ts` with `src/lib/page-identity.ts`; exceptions go to `/mnt/documents/link-audit-exceptions.csv`.
- Stage 2: reset the 174 stuck `ingest_queue` rows below the attempt cap, clear the stale lease, restart via the existing cron runner and `collection_state`.
- Stage 3: add fixtures under `src/lib/__tests__/` for the 25 programs; gate saving in the coach path on athletics-host + sport-term + explicit head-coach-label proof; store provenance so every write is reversible.
- Stage 4: extend the existing offering-status sync for the 172 unknowns; keep refresh cadence on the existing `*_refresh_due_at` columns and `pg_cron`.
- UI: one route (`/admin/build`) composing the existing `RunningNow` / `BuildChecklist` / one-at-a-time decision card; the other admin routes stay reachable but are demoted.
