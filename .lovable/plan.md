# Before the big coach + roster run: what I checked, and the four things worth adding

## Where the database actually stands (measured just now)

- 1,885 schools; 3,604 teams — 3,115 confirmed as sponsoring the sport, 274 confirmed not offered, 215 still unknown.
- Coaches: 904 head coaches stored. 2,251 confirmed teams have no coach yet. Every stored coach name has a recorded source page (no unsourced coach names).
- Rosters: 1,882 teams have a roster; 1,312 confirmed teams have none for the current season.
- Links: 728 confirmed teams are missing a roster page or a staff page.
- Waiting work: 550 teams queued for collection, 258 schools queued for link search, 7 failed. Collection is currently stopped.
- Review backlog: 84 facts and 1,226 links awaiting a decision.
- Safety features built but never exercised: accuracy spot checks (0 checks recorded), rejected-value memory (0 entries).

## My honest read

The foundations are in place and I don't think a big run would be wasted work: sponsorship is decided, links exist for most teams, every write records where it came from, declines are remembered, stuck jobs get released, and the coach rules have tests. What's missing is not more safety scaffolding — it's a few things that decide *what gets worked on* and *when work is considered finished*. Without them the run will re-do the same teams, or stop short and leave you re-running it by hand.

## Four additions I recommend first (they prevent the redo, not just the error)

1. **One "definition of done" that drives the queue.** Today the queue is filled by past events, so a team can be marked "collected" while still having no coach, no current roster, or a missing page. I'd make the queue fill itself from the gaps instead: a team is done when it has verified sponsorship, a roster page, a staff page, a current-season roster, and a proven head coach. Anything short of that is automatically queued once — never twice.

2. **A single, consistent "current season."** Roster pages label the coming year inconsistently: 482 teams are stored as 2027 and 1,402 as 2026, both meaning the same season. Screens show the newest year per team, so comparisons quietly mix seasons. I'd settle on one label per season, convert the existing rows, and store the page's own wording alongside it.

3. **Prove the coach rules on the schools that burned us, before mass writing.** Re-read the current official staff pages for UCF, Cincinnati, and a handful of other Big 12 teams, add them as fixed test cases, and only then let coach names apply automatically. Until that passes, coaches collected in the run land in review instead of the live record.

4. **A progress board with a stall alarm.** One screen showing how many teams are done against the definition above, how many are waiting, how many failed and why — plus an automatic restart when collection goes quiet. That's what lets you walk away instead of watching it.

## Clear the backlog in the same pass, not after

The 1,226 waiting links and 84 facts should be run through the existing bulk rules (obvious junk declined, clearly valid official pages accepted) before the sweep starts, so the run isn't proposing decisions on top of a pile you already have.

## Technical notes

- Queue filling moves to a gap query over `programs` + `roster_players` + `data_field_sources`, replacing event-driven enqueues in `ingest-queue.server.ts`; a uniqueness guard on (program, stage, open status) prevents duplicate rows.
- Season normalization: one migration to map roster `season_year` onto the settled label, plus a stored raw season string; `acceptableSeasonYears` becomes the single source both for validation and for "current".
- Coach auto-apply stays gated behind `coach-quality.ts` plus new fixtures in `src/lib/__tests__/`; `INGEST_POLICY` keeps coach fields out of auto-apply until those pass.
- Progress board reads counters server-side and reuses `reclaim_stale_leases` plus the existing cron runner for restart-on-stall.

## What I am not adding now

Whole-sweep undo, backfilling source pages for older records, and requiring two independent sources for every non-coach fact. All three are large and none of them block an accurate run.
