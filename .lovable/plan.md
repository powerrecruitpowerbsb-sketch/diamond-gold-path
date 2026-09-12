# One reader, and a guarded composition summary

You are right on both counts. I checked before writing this.

## Report 1: the crawl does not use the tested reader

- The only things that import the structural reader are the tests and my own throwaway measurement scripts. Nothing in the live paths does — not the page-ingest module, not the sweep, not the collection loop, not the roster re-check. Same for coaches: nothing in the live paths imports the coach reader either.
- The crawl's own reader sends page text to an AI model in ~14,000-character chunks and asks for JSON. Every name it returns is then checked back against the page text, which is a real safeguard, but it is the only one.
- Coaches are worse than a two-reader split: the crawl has no coach reader at all. It asks the model for two program fields — head coach name and recruiting coordinator — from whatever page it was pointed at. None of the sport-scoping, section attribution, title/email/phone separation, or ambiguity reporting in the tested coach reader is reachable from the crawl. That is the likeliest cause of the 16% head-coach rate in the coverage sample.

**Which reader should the crawl use: the structural one.** Same input, same output, every time; tested against saved pages; every rejection explainable. Agreed on that.

**What each reader produces that the other does not**

| | Structural (tested) | AI (what the crawl runs) |
|---|---|---|
| Jersey number, height, weight | yes | not even asked for |
| Bats / throws | yes, three page layouts | asked for, unverified |
| Hometown split, transfer flags | being added | asked for, unverified |
| Which columns the page publishes | yes | no |
| Duplicate / furniture / multi-season reporting | yes | no |
| Season year and season wording | collects headings, does not pick one | picks one, checked against a plausible window |
| Prose and unusual layouts | tables and cards only | can sometimes read what tables miss |
| Same answer twice | yes | no |

So the AI reader's only real advantages are the season pick and odd layouts. Both are recoverable.

## Report 2: the composition summary is unguarded

Confirmed. The summary row — position counts, class-year counts, transfer and junior-college counts, source page — is written straight to the database as the page is read: before review, with no source-page or domain check, and regardless of whether the read was flagged suspicious. Player rows are guarded; the numbers we would actually display are not. It is read back by the program screen's roster-history panel and counted on the collection dashboard.

## What I would build

1. **Make the structural reader the crawl's reader.** One entry point used by page ingest, the sweep, the collection loop and the roster re-check. It returns players plus the page-shape report.
2. **Pick the season structurally.** Choose the season from the page's own headings inside the plausible school-year window, with the same wording kept as the label. Nothing about the season should require the model.
3. **AI reader becomes a fallback, only when the structural reader finds nothing.** Never a merge of the two, never a tie-break: a page either reads structurally or falls back whole, and which reader produced a roster is recorded on the rows. Its names keep the existing check against the page text.
4. **Give coaches the same shape.** The crawl calls the tested coach reader for coach pages; the model's two-field ask is the fallback when it finds no staff at all.
5. **Guard the composition summary, same rules as player rows.** No source page or a domain another school holds means refused and parked for review, not written. A suspicious read is written but marked suspect, and suspect rows are withheld from every display and from the dashboard count — visible only in the review screens, labelled.
6. **Prove it.** Extend the saved-page tests to cover the crawl's entry point rather than the reader in isolation, so "the crawl uses the tested reader" is itself tested. Report per saved page: players, coaches, columns published vs captured, which reader ran.

## Where today's half-finished work stands

Before you stopped me I had already added the hometown split, transfer reading, and derived position groups to the structural reader, plus two extra stored position values so "middle infield" is not flattened into "utility". None of it is wired into the crawl, and none of it has run against anything. I would keep it and finish it as part of step 1 rather than unpick it — but say the word and I will strip it back out first.

## Technical notes

- New `src/lib/roster-read.server.ts` and `src/lib/coach-read.server.ts` as the single entry points: fetch text, run `parseRoster` / `extractCoaches`, fall back to `extractRoster` / `extractProgramFields` only on an empty structural result, and return `{ reader: "structural" | "ai", ... }`.
- `ingest.server.ts` keeps the fetch, prompts, chunking and `verifyAgainstSource`, but `ingestProgram` calls the new entry point instead of `extractRoster` directly. `sweep.server.ts`, `collection.server.ts` and `roster-recheck.server.ts` call it too.
- `roster_players.provenance` records which reader produced the rows; the review queue payload carries it so a reviewer can see it.
- Season pick: promote the existing `seasons` headings from `RosterShape` through `canonicalSeasonYear`, preferring the later year of a "2025-26" heading.
- Migration on `roster_snapshots`: `suspect boolean not null default false`, `suspect_reason text`, `source_domain text`, `ingest_run_id uuid`. The insert moves behind `checkRosterSource`, with a refusal logged to `roster_write_refusals` (kind `snapshot`), and `listRosterSnapshots` plus the dashboard count filter `suspect = false`.
- Backfill: existing snapshot rows get `source_domain` from their stored source page, and any whose domain belongs to another school are marked suspect rather than deleted — reversible, its own run id, reported before it applies.
- No crawl until steps 1-6 are in and the tests pass.
