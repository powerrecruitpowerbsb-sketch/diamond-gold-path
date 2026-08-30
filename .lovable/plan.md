# Review queue: dedupe, plain language, and a queue that survives 3,000 schools

## What's actually wrong (verified in the data)

- **Duplicates are real.** The Coastal Carolina pull filed `campus setting` twice and `conference` twice. Cause: two scraped pages describe the same record (school website + admissions page; athletics site + coaching staff page), and each page's extraction files its own proposal with no dedupe.
- **The roster really only captured 6 players.** The stored proposal contains exactly 6 named players for season 2027 — so the extraction, not the display, is short. The page's roster table is either JS-rendered or only partially returned in the scraped text.
- **Raw table names leak.** `roster_players` and snake_case field names reach the screen in some paths.
- **Volume.** At quarterly scraping across thousands of schools, a flat "approve every field" list is unworkable.

## 1. Stop duplicates at the source

- Merge proposals in-memory per `(table, record, field)` before writing: keep the highest-confidence value; if two pages disagree, keep both only as a single item that shows both candidate values and their sources.
- Skip filing a proposal when an identical pending one already exists for the same record/field/value — instead bump its confidence/source list.
- Add a database uniqueness guard on pending field proposals (one pending row per table + record + field) so no future path can re-introduce it.

## 2. Trust tiers — most changes never need a human

New per-field policy applied at ingest time:

- **Auto-apply (no queue):** filling a field that is currently empty, from an official source, at 0.9+ confidence. Applied live, recorded in the activity log as an automated update, and reversible from that log.
- **Review required:** overwriting an existing non-empty value, any confidence below 0.9, non-official source, brand-new schools/programs, and any roster replacement.
- **Auto-reject:** value identical to what's already stored (never queued at all).

This is what keeps the queue small at scale: only conflicts and low-confidence guesses surface.

## 3. Group the queue by school, not by field

- One card per school/program pull, with its field proposals nested inside and a count ("6 proposed changes").
- Card-level **Approve all** / **Reject all**, plus per-field controls when expanded.
- Sort by risk: conflicts and low confidence first, safe gap-fills last.
- Filters: sport, source type, confidence, "conflicts only", "new schools only", plus a school-name search.
- Pagination (server-side, 25 groups per page) with a total count, so the page never renders thousands of rows.
- A summary strip at top: pending groups, auto-applied this run, conflicts awaiting a decision.

## 4. Make roster proposals legible

- Header reads "Coastal Carolina Baseball — 2027 roster: 6 players (replaces 6 stored)" instead of "roster_players / New submission".
- Expanded view shows the full player table plus a diff summary: players added, players dropped, position and class-year breakdown.
- **Suspicious-roster guard:** a roster of fewer than ~15 players for a four-year program is flagged "likely incomplete scrape" and is not auto-anything — it's marked for scrutiny with a link to the source page.

## 5. Fix the short roster pull

- Log the scraped page's character count and detected player-row count per run so failures are diagnosable instead of silent.
- Scrape roster pages with a rendered-page wait and, if the page paginates by position group, follow those views.
- Extract the roster in chunks and merge, so long tables aren't lost to a single-response size limit.
- Re-test against Coastal Carolina and one other program before this is considered done; if a page genuinely can't be read, the run reports "roster incomplete" rather than filing a 6-player replacement.

## 6. Plain language everywhere

- Audit every review/admin surface so no table name, enum value, or snake_case field reaches the screen: "Roster", "School", "Program", "Campus setting", "Student-faculty ratio".
- Field labels come from one shared label map used by the queue, activity feed, and program pages.

## Technical notes

- Dedupe/merge and the trust-tier decision live in `src/lib/ingest.server.ts` at proposal-build time; the auto-apply path reuses the existing `approvePending` writer in `src/lib/review.server.ts` so live writes and source citations stay on one code path.
- `listPendingChanges` in `src/lib/review.functions.ts` gains grouping, sorting, pagination, and count; `admin.review.tsx` is restructured into grouped cards.
- One migration: partial unique index on pending field proposals, plus a column recording how a change was decided (auto vs human).
- The suspicious-roster threshold and the 0.9 auto-apply cutoff are constants in one place so they can be tuned later.
