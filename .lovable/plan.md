# Getting Power Recruit to a Real, Full, Self-Maintaining Database

## Where things stand today (verified)

- 22 schools, 27 programs in the database — a test slice, not the universe.
- 18 schools have confirmed federal (IPEDS/College Scorecard) facts; 4 failed and need a match decision.
- 6 majors total, 18 school-major links — placeholder data, not a real major catalog.
- 14 roster players, 1 roster snapshot — one test program scraped.
- Work queue: 18 jobs waiting on "find athletics links", 27 waiting on "coaches & roster scrape".
- Automatic scraper: the pipeline exists and runs end to end, but only when someone presses a button. Nothing is scheduled, so nothing refreshes itself yet.
- Only the NCAA directory importer is built. NAIA, NJCAA, CCCAA and NWAC are not, so those programs cannot enter the universe yet.
- Review queue is empty right now, and high-confidence gap-fills already auto-apply, so the "thousands of links" fear is handled by policy, not by clicking.

## What's left, in order

### Step 1 — Load the whole universe (no clicking)
- Import all NCAA divisions (D1/D2/D3) baseball + softball via the existing directory importer, in batches with progress.
- Add importers for NAIA, NJCAA, CCCAA and NWAC. These block automated requests, so they run through the scraper with AI extraction instead of a clean API, then land as reviewable school lists rather than silent inserts.
- Result: roughly 2,500–3,000 programs created as skeletons, automatically queued for the next stages.

### Step 2 — Fill school facts automatically
- Run the federal sync across the full universe in batches: tuition, enrollment, size, setting, admissions, SAT/ACT, graduation rate, net price.
- Build a real major catalog: Scorecard publishes degree fields per school, so majors get generated from that instead of hand-entered — one catalog of standard fields of study, plus per-school links.
- Only genuinely ambiguous name matches surface for a decision; expect tens, not thousands.

### Step 3 — Fill program facts automatically
- Run link discovery, then the coach/roster scrape across the queue in batches.
- Roster composition, coaches, scholarship notes proposed per program; high-confidence gap-fills apply themselves, conflicts and low-confidence values queue for review.

### Step 4 — Make it self-maintaining (the missing piece)
- Add a scheduled runner that wakes up on its own and drains the queue in small batches: federal refresh yearly, roster/coach refresh quarterly and before each recruiting cycle, link re-checks when a page starts failing.
- Add re-enqueue rules based on staleness, so schools automatically come back around without anyone remembering to trigger them.
- Add cost and rate guardrails per run so an unattended pass can't burn the Firecrawl or AI budget.

### Step 5 — Make the data trustworthy without mass clicking
- Sampling-based QA: each batch surfaces a small random sample to eyeball instead of the whole batch.
- Automatic sanity rules that flag rather than accept: roster under 15 players, tuition outside plausible range, coach name unchanged while roster fully turned over, division/conference mismatch.
- Every field keeps its source URL and last-verified date, and the profile page shows stale fields visibly so users know what's fresh.
- A health screen: coverage per stage, % of programs with a roster this season, oldest un-refreshed schools, failure reasons.

## Your ongoing job once this is done

Per quarter, roughly: approve a handful of ambiguous school matches, review flagged anomalies, and eyeball one sample batch. Everything else runs unattended.

## Technical notes

- Directory importers extend `src/lib/directory-import.server.ts`; non-NCAA bodies use Firecrawl + AI extraction with results staged in a review table.
- Batch runners build on `leaseQueueItems`/`completeQueueItem` in `src/lib/ingest-queue.server.ts`, called from a public cron route under `src/routes/api/public/` guarded by `LOVABLE_CRON_SECRET`, scheduled with pg_cron.
- Majors come from Scorecard CIP program fields inside `src/lib/federal-data.server.ts`, upserted into `majors` + `university_majors`.
- Staleness re-enqueue uses `last_success_at` on `ingest_queue` plus `last_verified_at` / `federal_synced_at`.
- Anomaly flags become a new proposal reason so they land in the existing review queue rather than a new surface.
- Health screen extends `/admin/pipeline`.

## Suggested first move

Step 1 NCAA full import plus Step 2 federal sync at full scale, since both are already built and just need batch orchestration — that alone takes the database from 22 schools to the real national list with cost and academic data.
