# Accuracy fixes + a queue you can actually clear

## What the data says right now

I checked all 968 pending items.

**The 939 school-fact items are almost entirely noise:**
- 633 are website addresses that differ from what's stored only by a trailing slash or `www` (e.g. stored `https://www.msstate.edu`, proposed `https://www.msstate.edu/`). Zero information.
- 283 are "religious affiliation: yes" for schools whose stored value is the default "no" (Shorter, Loyola Marymount, Thomas More, Earlham). These are correct federal facts, all at top confidence — they should never have needed a human.
- Only ~23 are real, substantive facts (city, state, enrollment, tuition, cost, graduation rate, campus setting).

They landed in the queue because the trust rules send *any* overwrite of a non-empty value to review, regardless of whether the value actually changed in meaning.

**Real accuracy problems in the Step 3 scrape (12 program items, 17 rosters):**
1. **Wrong school scraped.** Southeastern University (NAIA, Florida) got proposals from Southeastern Oklahoma State's site — "NCAA" and "Great American Conference". Link discovery matched on a name prefix. This is the serious one: it can write another school's facts onto a school.
2. **Impossible season years.** Stetson roster tagged 1953, Faulkner 2002 — a stray page number read as a season.
3. **Conference names are inconsistent.** "NWAC" vs "Northwest Athletic Conference" for the same conference; "South East Conference" vs "SEC".
4. **Division mismatch ignored.** Wallace State is NJCAA D1 in our records; the scrape proposes D2 with no flag that it disagrees.
5. **Positions collapse to UTIL.** Roughly a third of players come back UTIL because "INF" and unqualified "P" map there, losing real position data.
6. Roster sizes themselves look right (25-52 for four-year programs, 13-17 for the small JUCO/CCCAA squads).

## 1. Stop generating noise

Applied at proposal time, so these never reach the queue again:
- **Normalize before comparing.** Web addresses compared with scheme, `www`, and trailing slash ignored; text trimmed and case-folded; numbers compared numerically. Identical after normalization = discarded, not queued.
- **Default-value fills auto-apply.** A federal fact at 0.9+ from an official source overwriting a column that only holds its default (religious affiliation "no", empty text, null) is treated as a gap-fill and applied live, logged as an automated update.
- **Only real disagreements queue:** a genuinely different value, low confidence, non-official source, or a cross-source conflict.

## 2. Clear the 939 that already exist

A one-time cleanup pass over the current queue using the same rules: drop the no-change items, auto-apply the high-confidence default fills, and leave the ~23 substantive facts for you. Reported as counts before it runs so you see what will be swept.

## 3. Bulk controls in the review queue

So this never becomes one-at-a-time again:
- **Approve all high-confidence official facts** — one button, with the count and a per-field breakdown shown first.
- **Filter, then approve everything matching** — by field, source type, confidence band, governing body, sport.
- Select-all across the filtered set (not just the visible page), with a running selected count.
- Every bulk action is one undoable entry in the activity log listing what changed.

## 4. Fix the accuracy problems

- **School-match verification before scraping.** A discovered URL is only confirmed when the page's own school name matches ours strongly (full-name match, not prefix) and, where available, the state agrees. Prefix-only matches go to the discovery review list. Southeastern University's bad URLs get cleared and re-discovered.
- **Sanity bounds on season year:** must be within a couple of years of the current recruiting cycle, otherwise recorded as unknown rather than a bogus year.
- **One canonical conference list.** Scraped names map to a single stored form (both "NWAC" and "Northwest Athletic Conference" store the same value); an unrecognized name is kept but flagged as new.
- **Contradiction flagging.** A scraped division or governing body that disagrees with our directory-sourced value is marked as a conflict in the queue and never auto-applied — that's how the Wallace State D1/D2 and Southeastern NAIA/NCAA cases surface instead of quietly landing.
- **Better position extraction:** keep the page's own position text, map "INF" to the specific infield spot when the page gives one, and only fall back to UTIL when the page truly lists a utility player.

## 5. Verify before finishing

- Re-run the cleanup on a copy of the counts and confirm the queue drops from 939 to roughly 20-25 school-fact items.
- Re-scrape Southeastern University (NAIA) and Wallace State and confirm: correct school's pages, division conflict flagged, no bogus season year.
- Spot-check one D1, one NAIA, one JUCO roster against the live page for player count and position fidelity.

## Technical notes

- Normalization + trust-tier decisions live in one comparison helper used by both the ingest path (`src/lib/ingest.server.ts`) and the federal sync (`src/lib/federal-data.server.ts`) so the two paths can't diverge.
- Cleanup runs as a superadmin server function in `src/lib/review.functions.ts` (dry-run counts first, then apply) reusing the existing `approvePending` writer so live writes and source citations stay on one code path.
- Bulk approve gets a filtered-set variant server-side; the UI never loads thousands of rows to select them.
- Conference canonicalization and season-year bounds are constants in one module, tunable later.
