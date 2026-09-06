# Fix the "Check 12 at random" error

Clicking the spot-check button fails because the check asks the schools table for a field name that doesn't exist ("website"). The correct field is the school's website address column ("website_url").

## Change

- In `src/lib/accuracy.server.ts`:
  - Update the query to select `universities(name, website_url)` instead of `universities(name, website)`.
  - Update the read to `program.universities?.website_url ?? null` when passing the school website into the coach-evidence check.

No database change, no other behavior change.

## Verify

- Run the accuracy sample from the collection page and confirm it reports counts instead of an error.
- Run typecheck, tests, and build.
