# Load your 536-row audit, then fix what let the wrong-school links in

Your audit found the thing that matters most: 40+ programs were holding a look-alike
school's roster and staff pages. That is exactly the failure a "Verified Data" product
cannot ship with. This plan loads your corrections, then closes the hole that let them
through in the first place.

## 1. Load your corrections

A one-time loader reads the corrected file, matches each row to the school and sport
already on file, and applies changes only where you supplied one:

- **Athletics site** — saved as you wrote it (lowercase, single `https://`, no stray
  slashes). Fixes UA Little Rock's malformed address and the 74 case-only values.
- **State** — the 139 two-letter codes saved. BC left alone for Simon Fraser.
- **Deep roster/staff link supplied** — saved, the old link recorded as declined so it
  can never come back, and the page queued for a fresh read so nothing counts as
  verified until the scraper has actually fetched it.
- **Root domain only supplied** (your wrong-school rebuilds and non-varsity fixes) —
  the athletics site is saved, the wrong roster/staff link is cleared and remembered as
  declined, and that sport's roster and staff pages go back into the search queue to be
  found inside the correct domain. No guessed deep path is ever written.
- **Season folders stripped** (68) and **http upgraded to https** (5) — saved as given.
- **Cleared false-positive flags** (32) — nothing to write; the live rules already
  compare domains case-insensitively and strip `www`, so that bug was in the one-off
  export query I wrote, not in the app. Confirmed by reading the rules.
- **Note only, no correction** (51 rows, including your 10 missing roster and 14 missing
  staff URLs) — the note is stored with the record and the missing page is queued for
  search. Nothing is overwritten.

Everything runs as a preview first: a count of exactly what would change, per category,
before anything is written.

## 2. The nine records that need a decision

These are duplicate or misnamed schools, not link problems, so the loader will not touch
them. Proposed handling, which I'll carry out unless you say otherwise:

| Record | Proposed action |
| --- | --- |
| College of the Ozarks (MO) vs University of the Ozarks (AR) | Split: keep both schools, move the misfiled links to the AR record |
| "LSU New Orleans" | Rename to University of New Orleans; move the LSU Shreveport links to that school |
| "Mississippi Christian University" | Rename to Mississippi College |
| Central Lakes College (MN) vs Central College (IA) | Split: keep both, move misfiled links |
| "St. Thomas University" vs University of St. Thomas (MN) | Merge into the Minnesota record if the programs match, otherwise split |
| Bryant & Stratton | Fix state to WI to match its links |

Each of these is reversible and recorded in the change history.

## 3. Close the hole: check the page's own school name before trusting a link

Your closing point is the fix. A mascot domain (`gogriffs`, `guhoyas`, `goyeo`) defeats
any name-token test, so the scraper will start reading the school name off the page it
just fetched and compare it with the record:

- A roster or staff page whose own heading names a different school is declined and the
  program is sent back for a fresh search — it is never stored.
- A page that names a **JV, developmental, club or intramural** team is declined the same
  way, which catches the Barry, Fairfield, Emory & Henry and St. Thomas cases you found.
- Where the page proves it belongs to the right school, the link is stored with that
  proof attached, so a later audit can see why it was trusted.

This runs at fetch time, so it protects every future refresh, not just this batch.

## 4. Then re-read only what changed

The programs touched in step 1 (and any wrong-school link the new check declines) go
through the scraper. That confirms the corrected pages are live, pulls the current
rosters, and only then are the records marked verified. Nothing else in the database is
disturbed.

## Notes for the record

- Coach auto-apply stays off. This batch does not change that; the hand-checked
  25-program coach pilot is still the gate.
- Your audit is structural, not a liveness check — nothing loaded here is treated as
  verified until the scraper fetches it, which is why every correction is queued.

## Technical detail

- Loader: temporary script under `tmpscripts/`, run in preview then apply mode, matching
  on `universities.name` + `programs.sport`; writes go through the existing provenance
  and audit path so each field records source `manual` and the change is in `audit_log`.
- Declined links recorded in `rejected_values` and `url_discovery_queue` (status
  `rejected`) so `loadRejectedUrls` suppresses them on re-search.
- Requeues use existing `ingest_queue` stages (`url_discovery`, `program_scrape`).
- School-name/non-varsity verification added to `src/lib/link-quality.ts` (pure string
  tests, unit-tested) and applied at the fetch step in `src/lib/ingest.server.ts` and
  `src/lib/discovery.server.ts`, plus fixtures and tests for the wrong-school cases you
  named (Alfred, Portland State, Georgetown, Chaminade, Laney).
- Entity fixes in step 2 use the existing `school-merge.server.ts` merge / copy-details /
  choose-another-record paths.
