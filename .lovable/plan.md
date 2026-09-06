# Stop reviewing coaches and rosters by hand

## The short answer on a coaches database

There is no free, complete, current list of college baseball and softball coaches to cross-reference against. What exists:

- Each school's own athletics site staff page — the actual authority, and what we already scrape.
- Governing-body member directories (NAIA, NJCAA, CCCAA, NWAC) — partial, often a general athletic-department contact rather than the sport's head coach.
- Paid recruiting directories (Perfect Game, NCSA, coach-contact lists) — licensed, restricted for redistribution, and frequently stale for lower divisions.

So the fix is not a second database to compare against. The fix is to stop treating "the school's own page says X" as something a person needs to confirm, and to only ever surface the small number of genuine contradictions.

## The new rule: decide it, don't queue it

Everything gets a decision at pull time. A person only sees an item when two official sources actively disagree, or when nothing believable could be read at all.

Coaches:
- The sport's own staff page on the school's athletics site is accepted outright, including when it replaces a name we already hold. No queue item.
- Names that clearly aren't a head coach (blank, "TBA", "Interim", an assistant title, an email address, a page that belongs to the other sport) are discarded, not queued.
- If a second official page names a different coach, keep the sport staff page's name and record the disagreement as a flag, not an approval request.

Rosters:
- A roster is only accepted for the current season. The season is read from the page heading and the address, and archived seasons (2023-24, 2024-25, and similar) are discarded instead of queued — the current-season roster address is requested again instead.
- A current-season roster that looks sane (believable size, plausible positions, named players) is saved automatically. Partial reads are saved and a fuller pull is queued, as today.
- Only a school where no current roster page can be found at all reaches a person, as a short "needs an address" list.

## Watch it instead of approving it

Approvals are replaced by two much smaller screens:

- Changes worth a glance: coach changes, roster size swings beyond a threshold, conference/division changes, and source disagreements — already applied, each with one-click undo.
- Spot check: a small random sample (roughly 2%) of automatic decisions each week, so accuracy is measured on a sample rather than by reading everything.

## Clearing the current backlog

One retroactive sweep applies the same rules to everything outstanding:

- Archived-season roster proposals: discarded, current-season address requeued.
- Coach names from the sport's own staff page: applied.
- Junk coach values: discarded.
- Already-matching values: closed as no change.
- Leftovers: a genuine exceptions list, expected to be small.

The sweep runs in bounded batches in the background and reports what it did, so it can't stall the screen.

## Schools that don't field these sports

Of the links still waiting on you, 149 belong to sports slots we have never confirmed and 95 aren't tied to a sport at all — those are the ones you keep seeing for schools with no baseball or softball. Fix:

- Nothing reaches the review screens until the sport is settled as offered. Unconfirmed slots wait for the federal sponsorship check instead of asking you.
- School-level links with no sport attached are attributed to a confirmed program or dropped.
- Anything belonging to a sport marked not offered is cleared immediately, and the same filter is applied to the current backlog.
- The remaining undecided slots stay on the collection screen's one-click Offered / Not offered list, which is where that question belongs.

## Approving shouldn't reload the world

Today each approve or decline refreshes the whole schools list, the whole programs list, the queue page, and an exact count — that's why it stalls. Fix:

- A decided row disappears from the list immediately; nothing else is refetched.
- Counters update by subtraction and are refreshed cheaply in the background.
- Bulk decisions post in one request instead of one per item.
- Batch buttons on each group: accept everything the rules already trust for this school, in one click.


## Technical notes

- Extend `pendingVerdict` in `src/lib/review.server.ts` with coach-name sanity/authority rules and a season-currency rule for rosters, so review, the pull-time settlement path, and the sweep all share one judgement.
- Add season-currency helpers to `src/lib/data-quality.ts` (heading + URL season parsing, current-season window) and a coach-name validator (rejects titles, blanks, emails, wrong-sport pages).
- `src/lib/ingest.server.ts`: on an archived-season roster page, derive/request the current-season roster address and requeue discovery rather than writing a proposal.
- Record applied automatic decisions in `pending_data_changes` with `decided_via = 'auto'` (already the pattern) plus an `original_value` snapshot for undo, and drive the "changes worth a glance" and "spot check" views from those rows.
- New route `admin.changes.tsx` (glance + undo + spot check) and shrink `admin.review.tsx` to true exceptions only.
- Backlog sweep: extend `sweepReviewQueue` batching in `src/lib/review.functions.ts` and expose a "clear the backlog" control on the collection screen with progress counts.
- Gate the review/discovery listings on `programs.offering_status = 'verified'` and resolve or drop `program_id is null` discovery rows; extend the not-offered retirement sweep in `src/lib/sport-sponsorship.server.ts` over the existing backlog.
- `admin.review.tsx` / `admin.discovery.tsx`: drop `invalidateQueries` on `admin-universities` / `admin-programs`, remove decided ids from the cached page via `setQueryData`, keep counts as a low-frequency cached query with local decrement, and batch decisions into a single server call.
