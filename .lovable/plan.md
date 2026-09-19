# Three remaining monitoring issues

Seven of the ten findings are fixed already. These three need decisions, so they are
grouped into one change.

## 1. The wrong-school safeguard passes almost everything

Today the check asks "is this page on an address already saved on this record?" and
the caller hands it the very address being tested — so it always says yes, and a
roster page belonging to another college can never be caught.

Fix: the check keeps its address shortcut, but only against addresses that were
independently established for the school — its official website and its athletics
site — never the roster or staff address currently under test. The name comparison
that was removed comes back after that, so a page on a domain we don't recognise is
compared by school name as before.

Files: `src/lib/page-identity.ts` (stop trusting `ownDomains` for the page being
tested), `src/lib/link-audit.server.ts`, `src/lib/ingest.server.ts`,
`src/lib/roster-provenance.server.ts` (stop passing the tested field as its own
proof). Nothing is crawled; this only changes what the audit reports.

## 2. Confirming or typing a link in can't be saved

A reviewer pressing Confirm, or typing the right address by hand, is blocked
whenever the program already has a different address on file, or whenever the new
page can't be read (blocked or slow sites) — which is exactly when a person needs to
intervene.

Fix: keep the automatic gate for machine-proposed links, and let a deliberate human
action through. A reviewer's confirm and a typed-in address save the value, record
that a person overrode the check, and note the reason (stored value replaced, or page
unreadable) so it stays visible in the record rather than silently accepted.

Files: `src/lib/discovery.server.ts` (`applyDiscoveredUrl` gains a "human decided"
path), `src/lib/discovery.functions.ts` (`reviewDiscoveredUrl`, `setLinkManually`
pass it), `src/lib/page-purpose.ts` unchanged.

## 3. Admin progress board times out

The progress board counts completion by reading the whole programs table, the whole
roster table and the whole sources table page by page on every visit — tens of
thousands of rows each time. The database cancelled 92 of these queries in one day,
so admins see errors or a screen that never finishes.

Fix: do the counting in the database instead of in the app. Add read-only counting
functions that return the completion numbers directly (programs per level, programs
with a current roster, programs with a sourced coach, queue state), and have the
board call those. The page then makes a handful of small requests instead of
thousands of rows of paging.

Files: new migration with the counting functions, `src/lib/completion.server.ts`,
`src/lib/pipeline.functions.ts`, `src/lib/build-stages.server.ts`. The collection
runner reads the same numbers, so it stops stalling too.

## Notes

- No crawling happens as part of this. The audit and the progress numbers only read
  what is already stored.
- Tests cover the roster reader and the coach-name checks; the identity check gets
  test cases for a page on another college's domain and a page on the school's own.
