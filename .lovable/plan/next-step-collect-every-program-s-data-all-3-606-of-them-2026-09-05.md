# Next step: collect every program's data, all 3,606 of them

## Where we actually stand (checked just now)

- 1,886 schools and 3,606 programs in the database.
- School facts are effectively finished: 1,826 confirmed against national data, 7 filled in by hand, 52 parked as genuinely not in the national list, and **1 school still undecided**.
- The review queue is **empty** — everything from the pilot has been worked through.
- Collection has barely started: only **19 of 3,606 programs** have ever been read, and just 41 have a roster page on file.
- Waiting to run: 3,576 link-finding jobs and 3,587 page-reading jobs.

Steps 1 and 2 from the earlier list are done. What's left is the big one: finding each program's own pages and reading them. We run it wide and continuously until the database is full.

## What this step builds

### 1. A runner that just keeps going

- Kick off a nationwide run that works through link-finding and page-reading back to back, program after program, without anyone pressing a button per batch.
- Many programs handled at once, and it picks itself back up if something stalls part-way, so an interrupted run resumes instead of starting over.
- A single stop button, plus a live counter of programs done, players found and failures, so you can watch it fill.
- Same runner then goes on a timer, so new and stale programs keep refreshing on their own once the first full pass lands.

### 2. Accuracy flags, so a fast run doesn't fill the database with junk

- A four-year program with fewer than 15 players found, a roster year that isn't the current cycle, no players found at all, or a division that disagrees with what we already have — flagged into the review queue with the reason spelled out, never applied quietly.
- Confident facts from a school's own official pages still fill in blanks automatically, as today.
- Programs that fail are recorded with the reason and retried automatically a couple of times before being set aside.

### 3. Progress you can see

- A panel showing, per governing body and division: programs with a current roster, programs never read, programs failing and why.
- Last-read date on each program, so staleness is visible.
- A spot-check view that surfaces a random handful of freshly collected programs to eyeball, instead of reviewing all of them.

### 4. Order of work

Run order is NCAA D1 (618) → NCAA D2 (522) → NCAA D3 (775) → NAIA (458) → NJCAA (937) → CCCAA (220) → NWAC (72), simply so the most important programs land first. Nothing pauses between them.

### 5. Loose end

Decide the one remaining school without a national record, so that list reaches zero.

## Technical notes

- Batch selection filters `ingest_queue` by joined `programs.governing_body`/`division`, leasing through the existing `leaseQueueItems`/`completeQueueItem` helpers with stale-lease reclamation.
- The continuous runner reuses the detached bounded-runner pattern from `src/routes/api/public/federal-runner.ts`, chaining passes and running several workers in parallel with pacing tuned to Firecrawl and AI Gateway rate limits, not to spend.
- Anomaly flags reuse the existing proposal reason/contradiction field so they surface in `/admin/review` with no new screen.
- Run controls, health panel and spot-check view extend `/admin/pipeline`; per-run tallies persist on `ingestion_runs`.
