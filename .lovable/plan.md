# Next step: collect program facts at scale, starting with NCAA Division 1

## Where we actually stand (checked just now)

- 1,886 schools and 3,606 programs in the database.
- School facts are effectively finished: 1,826 confirmed against national data, 7 filled in by hand, 52 parked as genuinely not in the national list, and **1 school still undecided**.
- The review queue is **empty** — everything from the pilot has been worked through.
- Collection has barely started: only **19 of 3,606 programs** have ever been read, and just 41 have a roster page on file.
- Waiting to run: 3,576 link-finding jobs and 3,587 page-reading jobs.

So Steps 1 and 2 from the earlier list are done. Step 3 — reading each program's own pages — is what's left, and it's the one that costs real money per program. That's why it goes out in controlled batches rather than all at once.

## What this step builds

### 1. Spend and volume guardrails (before any wide run)

- A per-run ceiling on how many programs, pages and AI reads a batch may use, set on screen before starting.
- A running cost estimate and live tally as a batch works, so you can watch it.
- A daily ceiling that applies no matter how many batches are started, so nothing can run away unattended.
- Stop button that halts the current batch cleanly, leaving unfinished programs waiting rather than half-done.

### 2. Anything suspicious is flagged, never applied quietly

- A four-year program with fewer than 15 players found, a roster year that doesn't look like the current cycle, no players found at all, or a division that disagrees with what we already have — all land in the review queue as flagged, with the reason spelled out.
- Confident facts from a school's own official pages still fill in blanks automatically, as today.

### 3. The NCAA Division 1 batch (618 programs)

Run in two stages so a bad pass is caught early:

1. Find each program's athletics site, roster page and coaching page.
2. Read those pages for coaches and roster.

Order of work: a first batch of 50 D1 programs, then check accuracy on screen before releasing the rest of D1, then the remaining bodies in order (NCAA D2, D3, NAIA, NJCAA, CCCAA, NWAC).

### 4. Progress you can see

- A panel showing, per governing body and division: programs with a current roster, programs never read, programs that failed and why.
- Last-read date on each program, so staleness is visible.

### 5. Loose end

Decide the one remaining school without a national record, so that list reaches zero.

## What we are not doing yet

No scheduled/unattended running (the earlier Step 4) until a couple of manual batches come back accurate. Once they do, the same runner gets put on a timer with the daily ceiling already in place.

## Technical notes

- Volume/spend caps extend `INGEST_POLICY` in `src/lib/ingest.server.ts`; per-run tallies persist on `ingestion_runs` so the daily ceiling survives a page reload.
- Batch selection filters `ingest_queue` by joined `programs.governing_body`/`division`, leasing through the existing `leaseQueueItems`/`completeQueueItem` helpers.
- Anomaly flags reuse the existing proposal reason/contradiction field so they surface in `/admin/review` with no new screen.
- Batch controls and the health panel extend `/admin/pipeline`; the detached bounded-runner pattern from `src/routes/api/public/federal-runner.ts` is reused for program batches.
