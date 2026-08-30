# Getting to every baseball and softball school in the country

## What we built, and what it's missing

What exists today works, and none of it is wasted: the seed importer, the link-discovery step, the review queues, and the scrape-and-extract pipeline are the right machinery. But right now the database holds 22 schools and 27 programs, and only 6 schools have cost data. The gap isn't the machinery — it's that two things are being done by hand or the hard way:

1. **Nothing tells the system which schools exist.** The seed importer expects a CSV you assemble yourself. For ~2,000 baseball and ~2,000 softball programs, hand-building that CSV is the bottleneck.
2. **School data is being scraped when it can be downloaded.** Tuition, enrollment, acceptance rate, SAT/ACT, graduation rate, campus setting, public/private and majors are all published as free government datasets. Scraping each school's own pages for them is slower, costlier and less accurate than pulling the dataset.

Fix those two and the pipeline becomes almost fully automated, with scraping reserved for the handful of things no dataset has.

## The three-layer approach

```text
Layer 1  WHO EXISTS      governing-body directories  ->  schools + programs + division + conference
Layer 2  SCHOOL FACTS    federal education dataset   ->  cost, admissions, enrollment, majors
Layer 3  PROGRAM FACTS   scrape the school's site    ->  coaches, roster, roster composition
```

### Layer 1 — Import the universe from the governing bodies

Rather than a CSV per batch, pull each governing body's own member/sport-sponsorship directory once and treat it as the source of truth for who exists:

- NCAA's directory can be filtered by division, state and sport, so a baseball or softball query returns exactly the sponsoring schools with their division and conference already attached.
- NAIA, NJCAA, CCCAA and NWAC each publish their own member/sport lists, handled the same way.

Each body gets its own small importer that produces the same normalized rows the existing `upsertUniversityAndProgram` function already accepts — so this is a new front door onto code that already works, not a second pipeline. Output: every school, every baseball/softball program, correct division and conference, no hand-typed CSVs. The CSV importer stays for one-offs and corrections.

### Layer 2 — Get school data from the federal dataset, not from scraping

Match each school to its federal ID (IPEDS unitid) and pull its record from the College Scorecard API. That single call covers tuition in/out of state, room and board, cost of attendance, net price, enrollment, acceptance rate, average SAT/ACT, graduation rate, student-faculty ratio, urban/suburban/rural setting, public/private, and the school's fields of study for the majors list.

Benefits over scraping: one request per school instead of several, no AI extraction cost, values are consistent year over year, and the source is authoritative — so most of this can auto-apply without review. Storing the unitid also gives every school a stable identity for future refreshes and for de-duplicating name variants.

Name matching is fuzzy by nature, so unmatched or ambiguous schools go to a small "couldn't match this school to the federal dataset" review list rather than guessing.

### Layer 3 — Scrape only what no dataset has

That leaves the genuinely school-specific material for the existing Firecrawl pipeline: athletics site, roster page, coaching page, head coach and recruiting coordinator, and roster composition. This is the part where per-school scraping is unavoidable and where the discovery queue and review queue earn their keep.

## Making it run without you

- **A work queue instead of button-clicking.** One table tracks, per school and per program, what stage it's at and when each stage last succeeded. A batch runner picks up the next N items, so a run can be stopped and resumed and never redoes finished work.
- **Scheduled passes.** Roster and coach data refresh on a season cadence; federal data refreshes annually when the new release lands. Governing-body directories re-run before each season to catch programs added or dropped.
- **Exception-only review.** Federal-source and directory-source values auto-apply. Human review is reserved for scraped conflicts, low-confidence link discovery, and unmatched schools — which is what the existing trust-tier logic already does.
- **A coverage dashboard.** One screen answering "how complete is this?": schools by governing body, programs missing a roster URL, programs never successfully scraped, schools unmatched to federal data, failures by reason. That's how you know when it's done rather than guessing.

## Cost and effort at full scale

Directory imports and federal data are free and involve no AI. The scraping layer is the only cost: roughly 3-4 pages per program plus AI extraction — which, at the rates measured on the Coastal Carolina run, is on the order of a dollar or two of AI credits for a full national pass, plus Firecrawl scrapes billed to your own account.

## What you have to gather yourself: essentially none of it

The lists are produced by the system, not by you. To be specific:

- **The school and program lists** — produced automatically. Each governing body publishes its own member and sport-sponsorship lists on its own site, and the importers read them directly. You don't visit them or assemble spreadsheets.
- **Division and conference** — comes with those same lists.
- **Cost, admissions, enrollment, majors** — pulled from the federal dataset by ID. Nothing typed.
- **Athletics site, roster page, coaching page** — found by the discovery step already built.
- **Coaches and rosters** — scraped from each program's own pages.

What actually needs you is judgment, not data entry:

- Reviewing the low-confidence discovered links (the queue already surfaces those first).
- Deciding on schools the federal match couldn't resolve confidently — a short list, not thousands.
- Spot-checking a sample per governing body before we run wide, so we catch a parser reading a directory wrong early.
- Anything Power knows that no public source publishes: recruiting intelligence, relationship notes, coach tendencies.

One caveat worth naming up front: I can't verify from here exactly how each of the five bodies exposes its member list — some are clean pages, some may be behind a search form or an interactive widget. If one turns out to be genuinely unreadable, the fallback for that body is a one-time list from a reputable aggregate source or a single CSV, then the automated refresh takes over from there. I'll confirm each source as I build its importer rather than assume.

## Suggested order of work

1. NCAA directory importer, run for baseball and softball across all three divisions — the largest single chunk of the universe.
2. Federal dataset matching and enrichment for everything imported, with the unmatched list.
3. NAIA, NJCAA, CCCAA, NWAC importers.
4. Work queue plus batch runner, then point link discovery and scraping at it.
5. Coverage dashboard.
6. Scheduled refresh passes.

Each step is verified on a small slice before running wide, same as we've been doing.

## Technical notes

- New `src/lib/directory-import.server.ts` per-body parsers, all emitting the row shape `upsertUniversityAndProgram` already takes; new `*.functions.ts` fronting them with the superadmin guard.
- New `src/lib/federal-data.server.ts` for College Scorecard lookups; add `ipeds_unitid` to `universities` (unique, nullable) plus a `federal_match_status` for the unmatched review list. Majors map from the API's fields of study into the existing `majors` / `university_majors` tables.
- New `ingest_queue` table: school/program, stage, status, attempt count, last error, last success timestamp; a batch server function that leases and processes items in bounded chunks so a single invocation never runs long.
- Federal and directory writes go through the existing `approvePending` writer at auto-apply tier so citations and the activity log stay on one code path.
- Refresh scheduling via a cron-triggered route under `src/routes/api/public/` with caller verification.
