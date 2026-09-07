# Fix the fake "4,000 decisions" number, then split out the not-found links

## What's actually true right now

- The review queue has **14 real items waiting** (13 roster pulls, 1 school state) — not ~4,000.
- The links screen has **1,321 waiting**, but only **90** of those have a suggested link you can approve or reject. The other **1,231** are rows where the search found nothing at all, so the tidy-up correctly reported "nothing to tidy" — there was nothing there it could judge.

So two separate problems: a badge showing a made-up number, and a list padded with rows that aren't decisions.

## 1. Stop showing an estimated count as if it were real

The number on the Review queue tab comes from a counter that, when the exact count is slow, silently falls back to the database's rough guess. That table now holds 35,698 rows (almost all already decided), and the guess for "still waiting" lands near 4,000 — which is what you saw.

- Count only the waiting rows, in a way that stays fast regardless of how much history the table holds.
- If the count genuinely can't be produced, show a dash instead of a guessed number. Never display an estimate as a fact.
- Same treatment for the tile on the admin home page so both agree.

## 2. Move the "couldn't find" rows off your decision list

- The links screen keeps two lists: **Links to check** (rows with a suggested link — 90 today) and **Couldn't find** (1,231 today).
- Only "Links to check" feeds the tab badge and the decision count, so the number matches the work.
- "Couldn't find" stays visible with its own count, grouped by school, with the manual-entry box and the "search again" button it already has. Nothing is deleted.
- The tidy-up reports plainly what it looked at, e.g. "90 links judged; 1,231 rows had nothing found — moved to Couldn't find."

## 3. Tidy the remaining 90 so the real pile is small

Run the tidy pass over those 90 and report what's left. Anything the rules can't call stays for you, but it should be a short list rather than a thousand-row page.

## 4. Trim the decided history

35,698 rows of mostly-finished proposals is what made counting slow in the first place. Keep recent decided items for the activity trail and archive the rest, so every count on these screens is exact and instant.

## Technical notes

- `countPendingChanges` in `src/lib/review.functions.ts`: drop the `count: "planned"` fallback; count pending rows with a bounded exact read (or a covering index on `status`), and return `null` on failure so the UI renders a dash.
- `countPendingDiscoveries` in `src/lib/discovery.functions.ts` already separates `pending` (has URL) from `unfound`; `src/routes/_authenticated/admin.tsx` must badge only `pending`.
- `src/routes/_authenticated/admin.discovery.tsx`: promote the existing unfound list to a clearly labelled second section with its own heading and count; keep pagination.
- `src/lib/link-sweep.server.ts`: include a `skippedNoUrl` figure in the sweep summary so the report explains the zero.
- Migration: add index on `pending_data_changes (status, created_at desc)`; archive decided rows older than a retention window (keep `approved`/`rejected` from the last 30 days).
- Unchanged safety gates: automatic coach saving stays off; no coach backlog sweeps.
