# Clearing the 3,203 waiting items — and stopping the pile from rebuilding

## What the overnight run actually left you

I looked at every waiting item. Almost none of them are real decisions:

- **1,783 rosters (56%)** — full team lists. Every scraped roster gets the same middling trust score, so none of them can ever clear on their own, no matter how clean it is. Of these, 1,375 look completely normal (20-60 players). The rest are the ones worth your eyes: 379 look too short, 30 too long, and 502 are labelled with a season that isn't this recruiting year (2024, 2025 or 2027).
- **483 "state" items** — pure formatting. The page says "Kansas", we store "KS". Same fact, written differently, in all 483 cases. Zero of them disagree with what we have.
- **~940 remaining school and program facts** — enrollment, tuition, conference, coach names, campus setting and so on. Most fill a field that is currently blank from an official source; a minority genuinely differ from what we store.

So the honest number of real decisions in there is a few hundred, not three thousand.

## And yes — this will keep happening

Once sweeps run on a timer, every pass re-reads pages we already read and re-proposes facts we already store. Without changes, each sweep would add roughly the same pile again. The fix has to sit **before** items reach your queue, not in how fast you can click through them.

## What to build

**1. Compare like with like, before queuing.**
Teach the collector to treat "Kansas" and "KS" as the same answer, and to do the same for money, percentages, ratios, enrollment counts and web addresses. Anything that matches what we already store is never proposed again. This alone removes the 483 state items and prevents them recurring.

**2. Judge rosters on the roster, not on a fixed score.**
A roster is checked instead of guessed: is it from the program's own official roster page, is the season the current recruiting year, is the squad size in a believable range, are the names distinct and non-blank, do positions and class years look like real values. A roster that passes every check goes in automatically. A roster that fails any check comes to you, labelled with the reason ("only 6 players found", "says 2027 season") so you can fix the season or decline in one click.

**3. Fill blanks automatically, ask only about disagreements.**
An official source filling an empty field is applied. A source that would change a value we already hold always comes to you, with old and new side by side. Two sources disagreeing always comes to you.

**4. Clear the current backlog with these rules.**
A one-time pass over the 3,203 items applies the new rules: matching items are dismissed, clean rosters and blank-field fills are applied, and everything else stays for you — grouped by reason, worst first. Expected result: roughly 200-400 items left, all of them genuine.

**5. Tell you what happened, instead of making you find out.**
After each timed sweep the data collection page shows a short summary: how many facts applied on their own, how many rosters accepted, how many items need you and why. Your queue becomes an exceptions list.

## Technical notes

- Normalization and validation live in a shared module used by both the ingest path (`src/lib/ingest.server.ts`, `src/lib/collection.server.ts`) and the review sweep, so a proposal is suppressed at creation time and again at review time. Extend the existing `valuesEquivalent` / `isEmptyValue` helpers in `src/lib/review.server.ts` rather than adding a second comparison path.
- State handling: map full US state names to the two-letter codes stored in `universities.state` in both directions.
- Roster gating replaces the flat `ai_confidence = 0.7` with a rule-based verdict (`auto` / `needs_review` + reason). Season window is derived from the existing season constants, not hardcoded.
- Auto-apply stays restricted to `source_type = 'official'` and to fields that are currently empty; overwrite and contradiction paths keep going to `pending_data_changes` untouched, so nothing already reviewed changes.
- Backlog pass reuses `sweepReviewQueue` in `src/lib/review.functions.ts`, run in bounded batches with a preview count before it applies anything.
- Review screen additions: a reason label per flagged item and grouping by reason; the existing correct-and-approve and decline-with-reason actions stay as they are.
