# Make "not in the federal data" reversible

Today, parking a school as "not in the federal directory" is a one-way choice: it drops out of the 121 waiting schools and the "try these again" control skips it, so a mis-click is invisible. This adds a visible list of parked schools and a way to send any of them back.

## What you'll see

On the collection screen, next to the schools that need a match decision:

- A **"Parked — not in the federal data"** count and list, showing school name, state, and when it was parked.
- A **"Look again"** button on each row, which puts that school back in line for a fresh federal match attempt.
- A **"Look again at all parked schools"** button for the whole list.
- After parking a school, a brief confirmation noting it can be undone from that list.

Nothing else about the flow changes: parking still closes the school's job and leaves its cost/academic fields blank until federal data or a person fills them.

## Technical notes

- New server function `listFederalParked` (superadmin, paged): universities with `federal_match_status = 'not_in_federal'`, ordered by `federal_synced_at` desc.
- New server function `unparkFederalSchool({ universityId })`: sets `federal_match_status = 'unmatched'`, clears `federal_synced_at`, and resets that school's `stage='federal_data'` queue row to `pending` with `attempts = 0`, `last_error = null`, `leased_at = null`.
- Bulk variant `unparkAllFederalSchools()` does the same in chunks of 100 ids (existing `.in()` chunking pattern).
- Both live in `src/lib/pipeline.functions.ts` alongside `markNotInFederal` / `retryFederalUnresolved` and reuse `assertSuperadmin`.
- `src/routes/_authenticated/admin.pipeline.tsx` gains the parked panel driven by a `["federal-parked"]` query, invalidated after park/unpark.
- No schema change: `federal_match_status` already carries the value.
