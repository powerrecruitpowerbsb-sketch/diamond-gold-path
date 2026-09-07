# Load your corrected athletics websites and re-pull the missing pages

You sent back 380 schools with the right athletics address. 374 have an address filled in, and 254 of those differ from what we were holding — those wrong guesses are what has been blocking the roster and coach pages.

## What happens

1. **Match each row to the school** in the database by name and state, using the school website and current guess as tie-breakers. Anything that can't be matched with confidence is listed for you rather than guessed at.
2. **Save the corrected athletics address** for every baseball/softball program at that school. The old wrong address is remembered as declined, so it is never suggested again.
3. **Re-search from the corrected address** for exactly the pages your file lists as missing — baseball roster, baseball coaching staff, softball roster, softball coaching staff. Confident finds are saved; anything uncertain lands in "Links to check" as usual.
4. **Close the six schools with no athletics** — the ones whose note says athletics was discontinued or there are no varsity programs. Baseball and softball are marked "not offered" with your note as the reason, they drop out of family search, rosters and every queue, and the decision stays reversible.
5. **Shared and campus-selector sites are saved as given** (City Colleges of Chicago, Coastal Alabama and similar). If a page search later lands on the wrong campus, it shows up as a normal link to check.
6. **Report back**: how many schools were updated, how many roster and staff pages were found straight away, how many need your eye, and any rows that couldn't be matched.

Because this touches 374 schools and each one needs live web searches, it runs in the background in bounded batches rather than in one go — the same runner that already collects nationwide. You don't have to keep a page open.

## Notes on scale

Roughly 1,140 missing pages across 374 schools. Expect most baseball/softball roster and staff pages on a real athletics domain to be found automatically; the leftovers arrive in "Links to check" as a much shorter list than the 1,280 you were facing.

## Technical detail

- New server-side import in a bounded batch runner: read the CSV rows (stored as a one-off data load), resolve `universities` by normalised name + state, then reuse the existing `setAthleticsSiteByHand` path in `src/lib/discovery.server.ts` so the write, rejection memory and program-page re-discovery behave identically to the hand-entered case.
- Closed schools go through the existing `markProgramNotOffered` path with manual provenance, so the reversal path already in the UI keeps working.
- Only the specific `discovery_type`/sport pairs named in each row are requeued, so nothing already confirmed is re-opened.
- No schema change. No change to trust rules, coach guards, or sponsorship logic. Coach auto-apply stays disabled.
