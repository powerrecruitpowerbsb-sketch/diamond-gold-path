# Fix the "not in the federal data" button, then make it reversible

## What's broken

The button fails every time. The schools table only accepts four status values — matched, more-than-one-match, no-match, and hand-entered — and the button tries to write a fifth one ("parked, not in the federal directory") that was never added. Nothing was saved, so no school has been wrongly parked.

Confirmed by reading the rule on the schools table: it allows `unmatched`, `confirmed`, `ambiguous`, `manual` only.

## The fix

1. Allow the parked status on the schools table so the button can save.
2. Have the button report success or a plain-English reason instead of raw database text — e.g. "Couldn't park this school — please try again" — and do the same for the other collection-screen actions (match confirm, retry, refresh job list). Raw database wording never reaches the screen.

## Then: make parking reversible

Today, parking a school drops it out of the 121 waiting schools and the "try these again" control skips it, so a mis-click would be invisible. Adding, on the collection screen:

- A **"Parked — not in the federal data"** count and list showing school name, state, and when it was parked.
- A **"Look again"** button per row that puts the school back in line for a fresh federal match attempt.
- A **"Look again at all parked schools"** button for the whole list.
- A confirmation after parking that says it can be undone from that list.

Parking still closes the school's job and leaves its cost and academic fields blank until federal data or a person fills them.

## Technical notes

- Migration: drop and recreate `universities_federal_match_status_check` with `not_in_federal` added to the allowed set.
- New superadmin server functions in `src/lib/pipeline.functions.ts`:
  - `listFederalParked` — universities where `federal_match_status = 'not_in_federal'`, newest `federal_synced_at` first.
  - `unparkFederalSchool({ universityId })` — sets status back to `unmatched`, clears `federal_synced_at`, and resets that school's `stage='federal_data'` queue row to `pending` with `attempts = 0`, `last_error = null`, `leased_at = null`.
  - `unparkAllFederalSchools()` — same, chunked in 100s like `retryFederalUnresolved`.
- `src/routes/_authenticated/admin.pipeline.tsx`: parked panel driven by a `["federal-parked"]` query, invalidated after park/unpark; error handling maps thrown errors to friendly copy rather than surfacing `failure.message` verbatim.
