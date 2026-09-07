# Rosters with players who aren't on the page

## What I found

You're right that the counts are wrong, but it isn't a page being read twice — it's invented players.

Long Island University baseball shows 70 players for 2026. All 70 were written in one go from a single pull of the school's own roster page, and every name is unique, so nothing was duplicated. Roughly half the list is real LIU players (Brooklyn, Marlboro, Commack hometowns); the other half are names with hometowns like "Omaha" that exist nowhere else in the database and are not on LIU's page.

Cause: a long roster page is split into pieces before being read, and the reading instructions say "a full roster is usually 30-45 players — do not stop early". When a piece contains no roster (menus, footers, news), the reader satisfies that instruction by making players up. Nothing currently checks that a returned name actually appears on the page.

Scale: 91 program-seasons hold more than 50 players, 22 hold more than 60. Normal squads are 30-45, so those are the suspect ones. Smaller rosters can carry a few invented names too and need the same check going forward.

## The fix

1. Prove every name against the page. After a roster is read, keep only players whose name actually appears in the text scraped from that page (first and last name, punctuation- and case-insensitive). Anything unproven is dropped, never stored.
2. Only read pieces that look like a roster. Skip pieces with no roster-like rows so there's nothing to pad.
3. Change the reading instructions: remove the "usually 30-45 players" nudge and say plainly that returning fewer players than expected is correct, and that inventing a player is a failure.
4. Sanity ceiling. A read claiming more than 60 players never applies automatically; it goes to review with the reason stated.
5. Say what was dropped. The pull result and the review item show "read 70, kept 38, dropped 32 not found on the page", so this is visible instead of silent.

## Cleaning up what's already stored

6. Re-pull the 91 suspect program-seasons under the new rules and replace their rosters with the proven list. Report per school: before, after, dropped.
7. Spot-check 15 ordinary-sized rosters the same way, to measure how far the problem reaches below 50 players. If it's widespread, re-pull all rosters from the current season in a bounded background sweep rather than in one go.

## Guardrails kept

Rosters stay reviewable and reversible: a pull writes a proposal, the snapshot history keeps the old shape, and re-pulling replaces only that program and season. No coach auto-apply is changed by this work.

## Technical notes

- `extractRoster` in `src/lib/ingest.server.ts`: gate chunks on `countLikelyPlayerRows`, add a `verifyAgainstSource(players, markdown)` pass, return `dropped` alongside `players` and `diagnostics`.
- `ROSTER_PROMPT`: drop the squad-size expectation, add an explicit no-invention rule.
- `rosterVerdict` in `src/lib/data-quality.ts`: add an upper-bound rule (over 60 kept players, or over 20% dropped, means human review).
- `applyRosterProposal` in `src/lib/review.server.ts`: unchanged delete-then-insert per program+season; it already prevents true duplicates.
- Cleanup runs as a bounded pipeline action (same pattern as `clearBacklog` in `src/lib/pipeline.functions.ts`) so it survives navigation and can be stopped.
- Add a regression test with a fixture page: a roster chunk plus a menu-only chunk, asserting no unproven names survive.
