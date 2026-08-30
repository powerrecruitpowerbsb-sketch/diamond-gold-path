# Data Ingestion Pipeline (single program, staff-triggered)

Scrape a program's own source pages, extract fields with AI, and file everything into the review queue. Nothing touches live school/program records without approval.

## How it runs on this stack

This project runs backend logic as server functions inside the app's own server runtime, not as separate Supabase Edge Functions. Same behavior and same secrets, just the pattern this stack supports — the pipeline lives in `src/lib/ingest.*` and is callable only by a superadmin.

## Setup steps

1. Connect the Firecrawl scraping account (connector card in chat). The pipeline reads its key server-side only.
2. AI extraction goes through Lovable's built-in AI Gateway using `google/gemini-2.5-flash` — fast and cheap, well suited to strict-JSON extraction.

## Pipeline behavior

For one program:

1. **Collect URLs** from the school and program records: `website_url`, `admissions_url`, `athletic_website`, `coaching_staff_url`, `roster_url`. Empty ones are skipped, never fatal. If none exist, return a clear "no source URLs on this program" result.
2. **Scrape** each URL to markdown via Firecrawl (main content only). Per-URL failures are recorded and the run continues.
3. **Extract** with the AI Gateway, one call per page group:
   - School pages → GPA, SAT, ACT, acceptance rate, graduation rate, enrollment, tuition in/out of state, room & board, cost of attendance, campus setting, public/private, student:faculty ratio.
   - Athletics/coach pages → head coach, recruiting coordinator, division, conference, scholarships.
   - Roster page → player list (name, position, class year, bats, throws, hometown, state, transfer flags).
   The prompt requires strict JSON with the exact target field names, and requires omitting any field not confidently stated on the page — a gap is acceptable, a guess is not. Each returned field carries a confidence score based on how directly the page stated it.
4. **Propose, never write live.** Every extracted value that differs from — or fills a gap in — the current live value becomes a `pending_data_changes` row (`table_name`, `record_id`, `field_name`, `proposed_value`, `source_url`, `source_type = 'official'`, `ai_confidence`). Values identical to live data are skipped so the queue stays meaningful. Roster players are filed as **one** whole-roster proposal per pull rather than one row per player.
5. **Roster snapshot written immediately** to `roster_snapshots`: position counts, class-year counts, transfer and JUCO transfer counts, season year, source URL. Append-only history, no approval needed.
6. **Run log** returned and stored: each URL with `scraped` / `scrape failed` / `extraction failed` plus the reason, count of proposals created, and whether a snapshot was written. A pull with zero proposals and failed scrapes reads as failed, not quiet success.

A new `ingestion_runs` table records each run (program, started/finished, status, per-URL results, proposal count, error text) so history survives a page refresh and an in-flight run can be detected.

## Staff trigger

On the admin program detail page (`/admin/programs/$id`), superadmin only:

- **Pull latest data** button. Disabled and showing progress while a run is in flight for that program (checked server-side against `ingestion_runs`, so a second tab or refresh can't double-spend credits).
- On completion, a result panel: fields proposed, snapshot written, per-URL successes and failures with readable reasons, and a link into the review queue filtered to this program's new pending items.
- The review queue gains a program filter so that link lands on exactly this program's items.
- Errors surface verbatim enough to act on (bad URL, blocked page, extraction returned nothing). No auto-retry.

## Narrow test before calling it done

Run against **Coastal Carolina University — Baseball** (existing test record with real athletics, coaches and roster URLs). Then compare the resulting review-queue items and roster snapshot against what's actually published on the live site — coach names, roster size, class-year mix — and report the honest diff, including anything the extraction got wrong or missed. No bulk/automated ingestion in this prompt.

## Technical notes

- `src/lib/ingest.server.ts` — scrape + AI extraction + diffing + snapshot math (server-only).
- `src/lib/ingest.functions.ts` — `runProgramIngest`, `getIngestStatus`, `listIngestRuns`, all superadmin-gated.
- Migration: `ingestion_runs` table with grants, RLS (superadmin only), and an index on program.
- `src/lib/review.functions.ts` + `/admin/review` gain an optional program filter.
- Field allow-lists reuse `src/lib/admin-schemas.ts` so the AI can never propose a column that isn't reviewable.
- Long-running call: the button uses a real pending state; no timeouts assumed instant.
