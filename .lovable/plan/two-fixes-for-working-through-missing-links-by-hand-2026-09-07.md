# Two fixes for working through missing links by hand

Right now the only things you can do on a missing-link card are paste one address, search again, or skip. That is why San Mateo-type mistakes take so long, and why you keep being asked for softball pages at schools that have no softball team. This adds the two decisions you actually need.

## 1. "This is the right athletics site"

On a school's card you type the correct athletics address once (for example `https://scueagles.com`) and it does the whole job for that school:

- Saves that address as the athletics site for every baseball/softball program at the school.
- Marks the item you were looking at as decided.
- Throws away the other waiting guesses for that school's athletics site, and remembers the wrong domain so it is never suggested for this school again.
- Immediately starts a fresh search for that school's roster and coaching pages, looking only inside the correct site — so the follow-up pages come back right instead of being hand-typed too.

You get a short confirmation: what was saved, and that the roster and staff pages are being looked for again.

## 2. "This school doesn't have this sport"

One button on the card, per sport, for cases like a school with baseball but no softball:

- The program stays in the system but is marked "not offered", with a note that you decided it by hand and when.
- Every waiting link request for that program — athletics, roster and staff — is closed out, so it never comes back to your list.
- Its collection jobs are stopped, and it drops out of the build checklist targets and family search.
- Reversible: if the school adds the sport later, an admin can set it back to unverified and collection picks it up again.

## What stays the same

Trust rules, coach handling, roster verification and every automatic write path are untouched. These are two new manual decisions plus the follow-up work they trigger.

## Technical notes

- New server functions in `src/lib/discovery.functions.ts`: `setSchoolAthleticsSite` (writes `programs.athletic_website` for the school's programs, confirms the row, rejects/retires sibling `athletic_website` rows, records the replaced domain in `rejected_values` via the existing rejected-URL memory, then calls the roster/staff discovery for those programs) and `markSportNotOffered` (sets `programs.offering_status = 'not_offered'` with `offering_source = 'manual'`, `offering_verified_at = now()`, closes that program's `url_discovery_queue` rows, and marks its `ingest_queue` rows `skipped`).
- Reuse `applyDiscoveredUrl`, `requeueSchoolForDiscovery`, `normalizeUrl`/rejected memory in `src/lib/discovery.server.ts`, and `retireEmptyDiscoveryRows` patterns from `src/lib/link-sweep.server.ts`.
- Both write `audit_log` rows through the existing trigger, so the change shows up in the activity feed.
- UI: two extra controls on the one-at-a-time card in `src/routes/_authenticated/admin.discovery.tsx`, with the same optimistic "next card" behaviour as the current buttons.
- No schema change needed — `offering_status`, its provenance columns, and the rejected-value memory already exist.
