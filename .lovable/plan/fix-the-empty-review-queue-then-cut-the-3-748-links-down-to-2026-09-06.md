# Fix the empty review queue, then cut the 3,748 links down to real decisions

Two separate things are going on.

## 1. The review queue looks empty (it isn't)

There are 1,076 items waiting. Opening the page takes 25–45 seconds, and while it
loads the counter honestly reads "0 schools · 0 items", so it looks broken. Once
it finally loads, items do appear — 38 pages of them. Two problems confirmed:

- The whole page waits on one very large read before showing anything.
- Many cards say "New submission" instead of a school name, because the lookup
  that maps a program back to its school is asked for hundreds of records in one
  request and quietly comes back short.

Fixes:

- Show a proper loading state and the real waiting count immediately, instead of
  zeros. The count comes from a fast separate read that already exists.
- Load one page of schools at a time instead of the entire backlog, so the screen
  appears in about a second.
- Batch the program-to-school lookup so every card shows its real school name.

## 2. Pare down the 3,748 links waiting for approval

What is actually in that pile today:

| What it is | Count | What should happen |
| --- | --- | --- |
| Nothing was found at all (no link to approve) | 1,208 | Should never have been a "decision" — move off this screen |
| Link is for the wrong sport (soccer, wrestling, basketball, esports…) | 265 | Auto-decline and search again |
| Link is an old season archive (e.g. /2021-22/) | 214 | Auto-decline and search again |
| Link is a news article or tag page | 98 | Auto-decline and search again |
| Athletics site guess that is really the school's own homepage | 325 | Auto-decline and search again |
| Obvious junk hosts (course catalogs, social media, recruiting sites) | ~8 | Auto-decline and search again |
| Correct-sport roster/coach page on an already-confirmed athletics domain | 66 | Auto-approve |
| Everything else (mostly athletics-site guesses like nguathletics.com) | ~1,550 | Real decisions — make them fast |

Planned work:

1. **A one-click "Tidy these links" sweep**, matching the tidy button the facts
   queue already has. It previews what it would clear, then on confirm:
   auto-declines the wrong-sport, old-season, news, junk and school-homepage
   guesses (each one goes back for a fresh search, and the bad address is
   remembered so it can't come back), and auto-approves the correct-sport pages
   that sit on a school's already-confirmed athletics domain. Expected effect:
   roughly 3,748 down to about 1,550.
2. **Take "nothing found" out of the approval screen.** Those 1,208 rows carry no
   link, so there is nothing to say yes or no to. They move to a separate
   "Couldn't find these pages" list with two actions — search again, or type the
   address in yourself — and they stop counting toward the approval badge.
3. **A fast picker for what's left.** One school per row: school name and state,
   the suggested address, a preview link that opens in a new tab, and Approve /
   Wrong buttons, keyboard-friendly, 50 to a page, with "approve all on this
   page" once you've scanned it. Wrong sends it back for a fresh search.
4. **Stop the pile rebuilding.** The same rules run at the moment a link is
   proposed, so wrong-sport, old-season and news links never enter the queue
   again on future automatic sweeps.

## Technical notes

- New `src/lib/link-quality.ts`: URL classifiers (`wrongSportPath`,
  `archiveSeasonPath`, `newsPath`, `junkHost`, `isSchoolHomepage`,
  `matchesProgramSport`) shared by the sweep, the picker and
  `discovery.server.ts` proposal creation, so the screen and the automation never
  disagree.
- `src/lib/discovery.functions.ts`: add `sweepDiscoveredLinks({ apply })`
  (bounded, ≤1,000 rows per call, returns per-reason counts), change
  `listDiscoveredUrls` to exclude `confidence = 'failed'`, take page/pageSize, and
  order by school name; add `listUnfoundLinks` plus `setLinkManually`.
  `countPendingDiscoveries` counts only rows that have a URL.
- Rejections continue to flow through the existing `requeueSchoolForDiscovery`
  path with the rejected URL recorded, capped at 3 attempts.
- `admin.discovery.tsx`: split into "Decide these links" (paged picker) and
  "Couldn't find these pages", with the tidy-sweep preview panel on top.
- `review.functions.ts`: page `pending_data_changes` at the database level rather
  than pulling 3,000 rows and slicing; batch the `programs` id lookup in
  `groupPending` in chunks of 100.
- `admin.review.tsx`: header count comes from `countPendingChanges` while the
  list is loading; skeleton instead of zeros.

Nothing goes live without your approval except the correct-sport pages already
sitting on a confirmed athletics domain, and every auto-decline is reversible via
the audit trail.
