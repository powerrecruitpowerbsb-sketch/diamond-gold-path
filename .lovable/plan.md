# What to build next, in order

## Where things actually stand (checked just now)

- 1,905 schools, 3,644 programs in the database.
- School facts: 888 schools confirmed against federal data. 932 never found a match, 85 are ambiguous, 802 school-fact jobs still waiting, 184 parked as blocked.
- The queue cleanup worked: the review queue is down from 939 to **67** real items (32 website addresses, 17 rosters, and a handful of state/conference/enrollment facts).
- Collection is barely started: only 21 programs have been scraped, 41 have a roster page on file, and 24 discovered links still await a yes/no.
- Nothing runs on a schedule yet — every stage still needs someone to press a button.

## Step 1 — Fix and correct: make the review queue editable, then close out the pilot

Right now a wrong proposal can only be declined, which throws away a good pull because one detail is wrong (a roster read as 2002 instead of 2026). First change:

- **Approve with a correction.** Every item gets an editable value next to the proposed one — change it, then approve. What gets saved is your value, recorded as a staff correction with a note of what the system proposed.
- **Roster proposals get a season year you can set** before approving, defaulting to the current recruiting year, plus a warning when the scraped year looks implausible. Individual players can be edited or dropped in the same view (name, position, class year, transfer flag).
- **Declining asks why** — wrong school, wrong year, incomplete page, bad source, other (free text). The reason is stored so patterns are visible and the scraper can be tuned against real cases rather than guesses.
- **"Send back for re-scrape"** as a third option, for a page that was simply read badly: it declines the proposal and re-queues that program instead of leaving it done.

Then work the queue:

- Clear the 67 remaining items, correcting rather than declining where the pull is mostly right.
- Confirm the accuracy fixes held: sensible season years, real positions instead of everything as "utility", consistent conference names.
- Re-find Southeastern University's (Florida) athletics links now that wrong-state matches are demoted, and confirm no Oklahoma pages come back.
- Confirm Wallace State's division disagreement shows up as a flagged conflict rather than quietly applying.

Gate: don't start Step 3 wide until this passes.


## Step 2 — Finish school facts (988 schools left)

- Run the remaining 802 waiting jobs to completion.
- 932 schools found no federal match, which is too many to accept. Improve matching (state-aware name matching, common abbreviations, campus suffixes, "&" vs "and") and re-run only the unmatched.
- Build a small "confirm this school match" screen for the 85 ambiguous ones plus whatever the retry leaves undecided — pick from 2-3 candidates, or mark as genuinely not in the federal data (community colleges often aren't).
- Unblock the 184 parked jobs once their cause is fixed.

## Step 3 — Program facts at scale (3,600 programs)

Two stages, run in batches with cost visible:
1. Find each program's athletics site, roster page and coaching page.
2. Scrape coaches and rosters, propose changes.

Guardrails before this goes wide, because it spends real money per program:
- A per-run cap on pages scraped and AI calls, with a running cost estimate shown.
- Batches of a few hundred, so a bad pass can be stopped.
- Anything that looks wrong (roster under 15 for a four-year program, division disagreement, no players found) is flagged, never auto-applied.

Suggested order: NCAA D1 first (~600 programs) as a real-money accuracy test, then the rest by governing body.

## Step 4 — Make it run itself

- A scheduled runner that wakes up and drains a small batch from each stage, so the pipeline continues without anyone watching.
- Refresh rules by age: school facts yearly, rosters and coaches quarterly and before each recruiting cycle, links re-checked when a page starts failing.
- Daily spend ceiling so an unattended pass can't run away.

## Step 5 — Trust and visibility

- A health screen: how many programs have a current roster, which schools are stalest, what's failing and why.
- Sample-based checking: each batch surfaces a handful of random records to eyeball instead of all of them.
- Every fact keeps its source and last-checked date, and the program page shows visibly when something is stale.

## Step 6 — Back to the product

Once the data is flowing on its own, the family/staff side is what's left: search quality against a full 3,600-program universe, comparison, shortlists, and the recruiting intelligence write-up per program.

## Technical notes

- Match improvements and the ambiguous-match screen extend `src/lib/federal-data.server.ts` and the existing `/admin/discovery` pattern.
- Batch runners build on `leaseQueueItems`/`completeQueueItem` in `src/lib/ingest-queue.server.ts`, driven by a public cron route under `src/routes/api/public/` guarded by a shared secret and scheduled with pg_cron.
- Cost/rate guardrails live alongside `INGEST_POLICY` in `src/lib/ingest.server.ts` so both stages share one budget.
- Anomaly flags reuse the existing proposal reason field so they land in `/admin/review` rather than a new surface.
- Health screen extends `/admin/pipeline`.

## Suggested first move

Step 1 in full (it's short), then the Step 2 rerun — that gets school facts near-complete before any money goes into scraping.
