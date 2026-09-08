# Fix how we read team pages, then re-check the 84 schools that failed

The last pass recorded 157 "couldn't be read" pages that are probably fine. Both pages of a school were fetched at the same moment, the host dropped them, and the failure was recorded as if the link were bad. This fixes the reading, not the links. No stored link is changed by this work.

## What changes

### 1. One shared reader for every page we open

A single new module, `safeFetch`, becomes the only way any part of the system opens an athletics or school page. It owns:

- **One request at a time per website**, with a 2-3 second pause between two requests to the same site. Different sites still run side by side (10-15 at once), so a pass stays fast. The queue is a single shared object, so two different jobs reading the same site still wait for each other.
- **30 seconds** allowed per request, up from 25.
- **Three tries** on failure, waiting 5s, then 15s, then 45s. A "page does not exist" (404) is not retried — that is a real dead link.
- **Normal desktop browser headers**, because several hosts are closing the connection rather than answering, which is bot-blocking.
- **A second attempt through the rendering service** whenever the direct request is refused or useless: a blocked or closed connection, a 403, or a page that opens but comes back with no roster or staff content. Those hosts are refusing the plain request specifically, which is exactly what the service is there to get past.
- A structured answer — worked or not, the response code, the page text, a failure category, and **which path succeeded** (`direct` or `rendered`) — so nothing has to read error wording to know what happened.

- A comment at the top recording *why* the per-site pause exists: parallel requests to one athletics host caused 157 false failures on 2026-09-08. Without that note someone removes it later.

### 2. Everything routed through it

Every page read in the system already funnels through one function, so one change reaches them all. Files changed:

- `src/lib/safe-fetch.server.ts` — new.
- `src/lib/ingest.server.ts` — the shared page reader now calls `safeFetch`; it stops fetching directly and stops firing two pages of a school at once.
- `src/lib/link-audit.server.ts` — drops its own side-by-side grouping (the shared reader handles pacing), and records the new failure category.
- `src/lib/build-stages.server.ts` — passes the school list through to the page check.
- The remaining callers (`roster-recheck.server.ts`, `accuracy.server.ts`, `school-web-fill.server.ts`, `tmpscripts/fetch-cincy.ts`) inherit the new behaviour without edits, because they call that same reader.

After this, **no code path reads an athletics page outside `safeFetch`.** The only remaining direct network calls are fixed data services — federal college data, Wikipedia, the NCAA member list, the EADA sponsorship report, and the URL-finding search/site-map calls. Each gets a short comment saying it deliberately bypasses `safeFetch` because it is a rate-limited data service, not an athletics host, so nobody folds them in later.

### 3. Never let a slow site demote a good link

New table `link_health`, **exactly one row per program and page** (roster or staff) — a unique key on that pair, which the crawler updates in place rather than adding a row each run, so the failure count keeps its meaning:

- `last_verified_ok_at`, `consecutive_failures` (default 0), `link_status` (`verified` / `unverified` / `dead`), and `fetch_method` (`direct` / `rendered`) recording which path last worked. A site that only ever succeeds through the rendering service is a bot-block we can then see over time and route straight there, skipping the wasted first attempt.


Rules:
- A successful read sets `verified`, stamps the time, and resets the failure count to 0.
- A timeout or blocked connection only increments the failure count. Status is untouched. The stored link is untouched.
- A 404, or three failed runs on three separate days, sets `unverified` and surfaces the row for a person.
- A confirmed 404 on two separate runs sets `dead`.

The migration is shown for approval before it runs.

### 4. Clearer failure reasons

The "couldn't be read" log gains a `failure_category`: `timeout`, `connection_blocked`, `http_error`, `empty_content`, `not_found`. The raw error text stays. At a glance you can tell a crawler problem from a bad link.

### 5. A run that cannot run away

The page check requires an explicit list of schools. Called with nothing, it throws and stops — there is no "everything" default. Schools are matched by ID; when matching by name, dashes are normalised first, because several of the 84 names use an en dash and would otherwise be skipped silently.

## The run

One pass over **only** the pages currently sitting in the couldn't-be-read log for the 84 named schools. Nothing wider, nothing recurring. I report the pass rate — how many now open, and how many still fail with which reason — and stop.

## Technical notes

- `safeFetch(url, opts)` → `{ ok, status, html, markdown, failure_category, attempts }`. Per-host queue is a module-level `Map<string, Promise>` singleton; global concurrency limited by a semaphore. Rendering fallback uses the scraping service's wait-for-render option; the first attempt uses a plain request with Chrome headers.
- `auditStoredLinks(supabase, { schoolIds, ... })` gains a required target; `runPagesSlice` and the public runner pass it through. Missing/empty target throws before any network call.
- Migration: `link_health` (program_id, field, last_verified_ok_at, consecutive_failures, link_status enum, distinct-day failure tracking, timestamps) plus grants, RLS (superadmin read, service role write), and the updated-at trigger, following the existing pattern; `unreadable_pages` gains `failure_category`.
- Tests cover per-host serialisation ordering, 404 short-circuit, backoff sequence, en-dash name matching, and the rule that a timeout never changes `link_status`.
