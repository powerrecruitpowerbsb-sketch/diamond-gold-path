# Clear both queues automatically

Right now 1,107 waiting facts and 1,790 waiting links are almost all things a machine can decide. This plan makes the system decide them, so what's left for you is a short list of real judgement calls instead of days of clicking.

## What you'll see

- One button, "Clear what you can", that shows a preview (how many will be accepted, declined, or kept for you) and then runs through the **whole** pile in repeated passes on its own — you can close the page while it works.
- Athletics home pages like landerbearcats.com get accepted automatically. Addresses that are plainly not athletics sites (course catalogs, staff directories, PDFs, the school's own home page) get declined and sent back for a fresh search.
- Roster and coach pages get accepted when the address names the right sport, is the current season, and sits on that school's athletics site.
- School facts from an official school site are applied automatically, including when they replace a value we already had. Only genuinely odd values (impossible numbers, two sources disagreeing, or a value that fails a sanity check) stop for you.
- Conference names stop being noise: "Siac", "SIAC", "Big 10" and "Big Ten Conference" are recognised as the same thing, so those items disappear instead of asking you.
- Rosters we pulled are saved even when short, and the program goes back in line for a fuller pull later; short rosters are labelled so you know one is coming.
- A results panel afterwards: how many were accepted, declined, re-queued, and what's left for you — grouped by school with per-group "accept all" and "decline all".

## Expected outcome

Of the 1,790 links, roughly 1,200 athletics home pages plus the clearly-wrong ones resolve without you. Of the 1,107 facts, the ~240 conference items and ~440 roster pulls plus every official-source field resolve without you. What remains should be in the dozens, not thousands.

## Technical detail

**Link classification (`src/lib/link-quality.ts`)**
- Add `looksLikeAthleticsHost(url, schoolWebsite)`: host differs from the school host, host contains an athletics signal (`athletic`, `sports`, `go*`, team-nickname `.com`, `sidearmsports`, `prestosports`, `presto`) and is not `catalog.`/`directory.`/`library.`/`people.`, path is root or one shallow segment, not a `.pdf`.
- `classifyLink` for `athletic_website`: approve on that test; reject `.pdf`, catalog/directory hosts, and the existing school-homepage / junk-host cases.
- Roster/coach approval broadens: right sport in path + current season + host equals the program's confirmed athletics host **or** any confirmed athletics host for that school **or** passes `looksLikeAthleticsHost`.

**Sweep runs to completion (`src/lib/link-sweep.server.ts`, `discovery.functions.ts`)**
- Keep the 1,000-row bounded pass, but add a loop driver that repeats passes until `moreWaiting` is false or a pass makes no progress, reporting cumulative counts. Fix the requeue guard to `>= REJECT_RESEARCH_LIMIT` and pass `discovery_type` into `requeueSchoolForDiscovery` so the per-kind cap is honoured.

**Facts: value equivalence (`src/lib/data-quality.ts`)**
- Add `canonicalConference()` (case-fold, strip "Conference"/"Athletic Conference", expand a known abbreviation↔name table: SIAC, RMAC, WIAC, SCIAC, SCAC, MAC, PacWest, NWAC, Big Ten…) and use it inside `valuesEquivalent` for `conference`.
- General text comparison: case- and punctuation-insensitive for `campus_setting`, `city`, `state`, `student_faculty_ratio`, `division`, `governing_body`.

**Facts: sweep policy (`src/lib/review.server.ts`, `review.functions.ts`)**
- Dedupe identical pending proposals (same table/record/field/value) to the newest, decline the rest as duplicates.
- Auto-apply official-source values that pass `coerceForColumn` + range validation, whether the field is blank or already filled (your choice: trust the school site). Hold only: contradicting alternates present, value fails validation/range, or the proposal isn't from an official source.
- Roster proposals: accept when season is plausible (coerce implausible seasons to the current recruiting year) and at least one named player; when the player count is under 20, still save, mark the program for a fresh roster pull via the existing ingest queue, and note "partial roster — re-pull queued".
- Extend the sweep's reason tally and labels (`src/lib/link-sweep-labels.ts`, `data-labels.ts`) for the new codes so every number in the results panel reads in plain language.

**Screens (`admin.review.tsx`, `admin.discovery.tsx`)**
- Replace the single-batch sweep buttons with preview → "Clear what you can" → progress/summary panel driven by polling, plus per-school "accept all"/"decline all" on whatever is left.
