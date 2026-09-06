# Getting ready for the coach + roster run: five fixes, then go

## Where the database actually stands (measured just now)

- 1,885 schools; 3,604 teams — 3,115 confirmed as sponsoring the sport, 274 confirmed not offered, 215 unknown.
- Coaches: 904 stored, every one with a recorded source page. 2,251 confirmed teams still have none.
- Rosters: 1,882 teams have a roster; 1,312 confirmed teams have none for the current season.
- Links: 728 confirmed teams are missing a roster page or a staff page.
- Waiting work: 550 teams queued for collection, 258 schools queued for link search, 7 failed. Collection is stopped.
- Backlog: 84 facts and 1,226 links awaiting a decision.

My read: the foundations are sound and a big run won't be wasted. What's missing is what decides *which* teams get worked on and *when a team is finished* — plus three concrete bugs found while checking. Fix those five things and the run shouldn't need re-doing.

## 1. Definition of done drives the queue (approved)

A team is finished when it has: confirmed sponsorship, a roster page, a staff page, a current-season roster, and a head coach proven on the sport's own official staff page. The queue fills itself from those gaps instead of from past events, so every unfinished team is picked up exactly once and finished teams are never re-worked.

## 2. Season = the school year, named once

The season is the school year, so 2026-27 is one season no matter when a school updates its page. Today that same season is stored as "2026" for 1,402 teams and "2027" for 482 — the same year written two ways. I'll store one season label per school year (the school year's ending year, so 2026-27 = 2027), convert the existing rows, keep the page's own wording alongside it for reference, and show it everywhere as "2026-27". Acceptance rules and screens then all read the same season.

## 3. UCF's coach is a real bug — fix the class, not just the row

UCF baseball currently has no coach stored (the earlier wrong value was cleared), and the staff page we hold is the right one. So the gap is that a correct name isn't being read from a good page. I'll re-read that page and the other schools that burned us, turn each into a fixed test case, and add a way for you to type in a coach you know first-hand (like Rich Wallace) with your name as the source — a hand-entered coach outranks anything collected and is never overwritten by the sweep.

Related problem found on the same check: **College of Central Florida** (a junior college) is holding UCF's athletics pages — roster and staff links pointing at ucfknights.com. That's one school's pages attached to another school, which would put the wrong coach and wrong roster on a real program. I'll add a check that a team's pages must belong to that school (name and location must line up, not just a similar name) and sweep every team for the same mix-up before the run starts.

## 4. Progress board with a stall alarm (approved)

One screen: teams finished against the definition above, teams waiting, teams failed and why, plus what changed in the last hour. If collection goes quiet, it restarts itself and the board says so, so you can walk away.

## 5. Fix the spot check, then let it run weekly

"Check 12 at random" now fails with a permissions error: the table that stores check results allows reading but not writing. I'll allow the check to record its results, then have it run automatically each week so the accuracy score builds a history instead of only appearing when you press the button.

## Clear the backlog in the same pass (approved)

Before the sweep starts, the 1,226 waiting links and 84 facts go through the existing bulk rules — obvious junk declined, clearly valid official pages accepted, genuine judgement calls left for you — so the run isn't stacking new decisions on an old pile.

## Technical notes

- Queue filling becomes a gap query over `programs`, `roster_players`, and `data_field_sources` in `ingest-queue.server.ts`, with a uniqueness guard on (program, stage, open status).
- Season: canonical `season_year` = ending year of the school year; migration converts existing rows and adds a raw season label column; `acceptableSeasonYears`/`plausibleSeasonYear` in `data-quality.ts` become the single source for both validation and "current", and a shared formatter renders "2026-27".
- School-page ownership check extends `coach-quality.ts` host proof into a reusable program-level guard, comparing page host against the school's own domain plus name/state agreement; a one-off audit script reports and clears mismatches like College of Central Florida.
- Manual coach entry writes `head_coach_name` with `data_field_sources.source_type = 'manual'` and a provenance flag the sweep treats as locked.
- Migration adds an insert policy for superadmins on `accuracy_checks` (plus `service_role` grant) and schedules the weekly sample through the existing cron runner.
- Coach auto-apply stays off until the new fixtures pass `bunx vitest run`.
