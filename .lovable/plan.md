# Fix "Could not save the match"

## What's happening

You're right about the cause. Each national record can only be attached to one school in Power Recruit — the database enforces that. When the record you pick is already attached to another school, the save is refused and the screen shows the generic "Could not save the match" message, with no explanation and nothing you can do about it.

This happens in two very different situations, and today both look identical:

1. **The same school is in our list twice** (imported once by each governing body, with slightly different names).
2. **It's a second campus or a branch** of a school we already hold — the national list keeps one record for the whole institution, so the campus has no record of its own.

The automatic sweep already handles case 2 quietly. The manual "Match" button doesn't handle either.

## What I'll build

**1. A clear explanation instead of a dead end**

When the record is already taken, the school's card will say which school already holds it, for example:
"Coastal Carolina University already uses this national record."

**2. Two ways forward, right on the card**

- **"Same school — combine them"**: keeps the school that already has the national facts, moves this entry's baseball/softball teams, rosters, shortlists, notes and saved links onto it, then removes the duplicate. If both sides hold the same sport, the one with more collected data is kept.
- **"Different campus — copy the facts"**: fills in cost, academics and location from the shared national record, notes on the school that it shares a record with its parent, and takes it out of the decision list. No national record is claimed, so nothing conflicts.

Both actions are recorded in the activity history, and the combine action shows what will move before you confirm it.

**3. Same behaviour everywhere**

The automatic sweep will use the same logic, so batch runs and manual decisions stay consistent.

## Technical notes

- `confirmFederalMatch` (`src/lib/federal-data.server.ts`) will detect the unique-index violation on `universities.ipeds_unitid` and return a typed `{ conflict: { unitid, ownerId, ownerName } }` result rather than throwing a raw database error.
- `resolveFederalMatch` (`src/lib/pipeline.functions.ts`) will pass that conflict back to the UI; two new superadmin server functions, `mergeDuplicateSchool` and `linkSharedFederalRecord`, will perform the two actions.
- Merge reassigns dependent rows in dependency-safe order (`programs`, `roster_players`, `roster_snapshots`, `athlete_saved_schools`, `recruiting_intelligence`, `program_relationships`, `interaction_log`, `ingest_queue`, `url_discovery_queue`, `pending_data_changes`) before deleting the duplicate; where the same sport exists on both sides, the program with more roster/snapshot rows survives and the other's dependents move to it.
- `MatchResolver.tsx` gains a conflict state with the two buttons and a plain-English summary; `friendly()` keeps filtering raw database text.
- Directory sweep (`src/lib/federal-directory.server.ts`) switches its inline duplicate handling over to `linkSharedFederalRecord`.
- Verification: re-run one of the failing schools in the browser as superadmin, confirm counts before/after the merge, then typecheck and build.
