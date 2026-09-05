# Clear the last 94 schools with a fast side-by-side picker

Right now every leftover school makes you click "Choose record", wait for a lookup, then read a plain list. Ninety-four schools at three clicks and a wait each is the reason this pile hasn't moved. The fix is to do the looking up in advance and put the best suggestion right next to your school, so each decision is one click.

## What you'll see

A single "Decide the last schools" screen:

- One row per waiting school, showing your school on the left (name, city, state) and the best national record on the right (name, city, state, enrollment, and how close the name is).
- Fields that matter are shown for the suggestion — cost, tuition, enrollment, acceptance rate — so you can tell at a glance whether it's the right place and whether it actually brings data.
- One click on "Yes, that's it" fills the school in and moves to the next row. "Show other options" opens the two or three runners-up. "Search by name" is there for the rare case none fit.
- "Not in the federal data" stays available per row, and stays reversible through the parked list.
- Rows are grouped: the 31 with real suggestions first (those are the quick wins), then the 63 with nothing found yet, so you're not scrolling past dead ends to reach the easy ones.

Suggestions are prepared in one background pass before the list renders, so no row waits on a network lookup while you're deciding.

## Where the suggestions come from

For the 31 "several possible records" schools, the suggestions already exist — the matcher found them but wouldn't guess between them.

For the 63 with nothing found, the plan reuses the full national directory already downloaded for the whole-list check: instead of only reporting confident matches, it also keeps the top three near-misses per school. Those become the suggestions here. Near-misses are clearly labelled as "close, not certain" so they never read as verified.

## Safety

- Confirming a record fills only blank fields; anything that would contradict an existing value goes to the review queue exactly as it does today.
- Every confirmation is recorded with who chose it, so a wrong pick is traceable and reversible.
- The 8 schools that already have cost and enrollment data keep those values; a confirmation adds the missing pieces only.

## Technical notes

- New `suggestFederalMatches` in `src/lib/federal-directory.server.ts`: loads the cached operating-institution directory once, scores every unresolved school with `scoreCandidates` from `src/lib/federal-match.ts`, and returns the top 3 per school above `CONSIDER_SCORE` with `unitid`, name, city, state, `main_campus`, enrollment, and score. No per-school API calls.
- New bounded server function `listFederalSuggestions` in `src/lib/pipeline.functions.ts` wrapping it (superadmin, `clean()`d, chunked reads like `requeueFederal`). Result cached in TanStack Query under `["federal-suggestions"]` so the pass runs once per visit.
- New route `src/routes/_authenticated/admin.federal-decisions.tsx` with its own `head()`; the existing pipeline screen keeps its summary and links here. `MatchResolver` is extracted from `admin.pipeline.tsx` into `src/components/admin/MatchResolver.tsx` and extended to accept pre-loaded suggestions plus the enrollment/cost preview, falling back to on-demand `listFederalCandidates` for the name search.
- Confirmation still goes through the existing `resolveFederalMatch`, so gap-fill, review queueing, and `data_field_sources` behaviour are unchanged.
- No schema migration required.
