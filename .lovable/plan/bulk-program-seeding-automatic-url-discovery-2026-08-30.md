# Bulk program seeding + automatic URL discovery

Two additions: a CSV importer that creates school/program skeletons in bulk, and a discovery step that finds each school's athletics site, roster page, and coaching page — with every discovered link staged for staff confirmation before it touches live data.

## 1. Schema

- Add `CCCAA` and `NWAC` to the program governing-body list, alongside NCAA / NAIA / NJCAA. They are treated as peer governing bodies, not NJCAA subsets. Division stays free text so CCCAA-style structures fit.
- New `url_discovery_queue` table: school, optional program, discovery type (athletics site / roster page / coaching staff page), the discovered URL, confidence (high / low / failed), status (pending review / confirmed / rejected), who reviewed it and when, created timestamp. Superadmin-only access.
- The governing-body additions also flow into the admin program form dropdown and the search filters so the new bodies are selectable and filterable.

## 2. Seed importer (superadmin only)

New admin page **Bulk import** with the same three-step feel as the athlete importer: paste or upload CSV, review a parsed preview, then commit.

- Columns: `university_name, state, sport, governing_body, division, conference`.
- Preview table shows each row's outcome before committing: *new school*, *existing school*, *new program*, or *updates existing program*. Malformed rows (missing name, bad state, unknown sport or governing body) are flagged inline with a plain-language reason and skipped — the rest of the batch still imports.
- Rows are matched to schools by normalized name + state, so a school appearing twice (baseball and softball) shares one school record instead of duplicating.
- New schools are created as skeletons: name and state only, everything else left empty for later enrichment.
- One shared server function, `upsertUniversityAndProgram`, does the school match/create plus program create/update. The bulk importer calls it per row, and the existing single-record admin create paths are pointed at the same function so there is one code path, not two.
- Result summary after commit: schools created, programs created, programs updated, rows skipped with reasons. Every write lands in the audit log as today.

## 3. URL discovery

Run per school (not per program) from the school's admin page, plus a "discover for selected" action on the bulk-import result screen so the 20-school test batch can be kicked off in one go.

- Step 1 — real web search (not model recall) for the school's official athletics site, using Firecrawl's search capability with the school name and state.
- Confidence is assigned by rules, not by the model: **high** only when the domain plainly belongs to the school and looks like an official athletics host, and the school name matches; **low** when the domain looks off, the name only loosely matches, or several near-identical candidates came back. Nothing found is recorded as **failed** so it shows up as a gap rather than silently vanishing.
- Step 2 — from that athletics site, enumerate its URLs (Firecrawl site mapping) and pick the sport-specific roster page and coaching/staff page by matching baseball/softball plus roster/coach/staff patterns in the path. Each is written as its own queue row tied to the relevant program.
- Every result lands in `url_discovery_queue` with status *pending review*. Nothing writes to the school's website/athletics fields or the program's roster/coaching URLs at this stage.
- Discovery runs bill Firecrawl scrapes to Power's own Firecrawl account, same as the existing data pull, and reuse its out-of-credits messaging.

## 4. Review screen (superadmin only)

New **Discovered links** page in the admin console, grouped by school, with **low** confidence items surfaced first and failures listed after.

- Each row: school (and program/sport when relevant), what kind of link it is, and the URL as a clickable link opening in a new tab for quick eyeballing.
- **Confirm** writes the URL into the real field it belongs to (school website/athletics site, program roster URL, program coaching staff URL) and marks the row confirmed with reviewer and timestamp. **Reject** marks it rejected and changes nothing live.
- A pending-count badge appears on the nav item, matching the existing review queue.

## 5. Narrow test before any scale

1. Import a ~20-school CSV spanning NCAA, NAIA, NJCAA, CCCAA and NWAC, and confirm no duplicate school records where a school appears for both sports.
2. Run discovery on those 20 only.
3. Review results against the real schools by hand — spot-check several **high** confidence rows too, not just the low ones, to confirm high isn't being handed out too freely, then adjust the matching rules before going wider.

## Technical notes

- Migration: `ALTER TYPE governing_body ADD VALUE` for CCCAA and NWAC (separate statement, committed before use), plus `url_discovery_queue` with GRANTs to `authenticated`/`service_role` and superadmin-only RLS policies.
- Server: `src/lib/seed-import.server.ts` (parse + `upsertUniversityAndProgram`) and `src/lib/discovery.server.ts` (Firecrawl `/search` and `/map`, rule-based confidence scoring), each fronted by thin `*.functions.ts` server functions with the existing superadmin guard.
- Firecrawl calls reuse the existing gateway pattern and `FIRECRAWL_API_KEY_1` from `ingest.server.ts`; `ENUM_FIELDS.governing_body` there is extended with the two new values.
- Routes: `src/routes/_authenticated/admin.seed-import.tsx` and `admin.discovery.tsx`, each with its own head metadata.
- CSV parsing reuses the athlete importer's parser rather than a second implementation.
