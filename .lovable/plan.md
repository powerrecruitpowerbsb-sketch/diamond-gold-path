# Make the collection screens make sense

Two screens have grown into walls of panels. This rebuilds both around one question each:
"what is happening right now?" and "what does this school need from me?"

Nothing about how collection actually works changes — no new scraping, no new rules,
no changes to what gets trusted or written. This is layout, wording and flow only.

## 1. Collection page becomes status + checklist

Today the page stacks twelve panels: totals, accuracy, re-look, five numbered pull
steps, parked schools, non-schools, sponsorship, refresh schedule, activity, needs-you,
plus the runner and completion boards. Everything is visible at once and nothing is
ranked.

The new page, top to bottom:

**Running now** — one wide band. Is it on or off, which level it is working, how far
through, pace and rough finish time, and one Start/Stop control. If it is off, it says
so plainly and offers to start. Nothing else competes with this band.

**Build checklist** — the stages of building the database as a plain tick list, in order,
each with a one-line state:

```text
1. Member schools pulled            done — 1,885 schools
2. School facts from federal data   done — 15 still need a person
3. Which schools play the sport     done — 210 still unconfirmed
4. Team pages found                 in progress — 566 still missing
5. Head coaches confirmed           in progress — 2,192 still missing
6. Current rosters pulled           in progress — 1,725 still missing
7. Keeping it current               on — rosters twice a year, facts yearly
```

A stage that needs a person shows one button that goes straight to that work. No stage
shows its own tools inline.

**Needs you** — the short list of real decisions with counts and a button each: match
decisions, review queue, discovered links, entries that aren't schools.

**Everything else** collapses to a single "Tools" link. Pull lists, re-look at declines,
sponsorship recheck, parked schools, backlog cleanup, accuracy sampling and the raw job
table all move to a separate `/admin/tools` page, grouped and labelled, so the main page
never shows them.

Numbers keep their plain-language hints, and no panel shows a raw stage name or status
word like "held" or "blocked" — those become "waiting its turn" and "needs a person".

## 2. Empty searches become a one-at-a-time card

The 1,239 empty searches are today a paginated list of rows with a text box each —
unworkable. It becomes a single focused card, one school at a time:

- The school's name and state, large.
- What is missing, in words: "We couldn't find Rollins College's baseball roster page."
- A link that opens the school's own website in a new tab, so the address is one click away.
- One box to paste the address, with Save.
- Three other choices: **Search again**, **Skip for now**, **No such page** (for a school
  that genuinely doesn't publish one).
- Saving or skipping advances straight to the next card. A counter shows "1,239 left"
  and how many were done in this sitting.

Skipped items go to the back of the line, not away, so a sitting can be ended and
resumed. The paginated list stays available behind a "See the whole list" toggle for
anyone who wants it.

The links-with-addresses section above it keeps its current group-by-school layout and
Right/Wrong buttons — that part already works — but loses the sweep jargon in its
summary and gains the same "x left" counter.

## 3. Written for staff, not for me

Every heading, hint and button on both pages is re-read as if by a staff member who has
never seen the pipeline: no stage keys, no queue vocabulary, no "sweep", "requeue",
"proposal" or "wave". Levels are named as people say them (NCAA Division I, NAIA, junior
college).

## Technical notes

- `src/routes/_authenticated/admin.pipeline.tsx` (1,088 lines) is split: a slim status
  page keeping the running band, checklist and needs-you list, and a new
  `src/routes/_authenticated/admin.tools.tsx` holding the existing hands-on panels
  moved across verbatim.
- Checklist state is derived from data already fetched by `pipelineStatus`,
  `completion.server.ts` and `waves.server.ts`; no new server functions and no new
  queries beyond what those already return. If a stage needs a count that isn't already
  returned, it is added to the existing completion response rather than a new call.
- `CollectionRunner.tsx` is reduced to the running band; its per-level table moves into
  the checklist's step 4-6 detail behind a disclosure.
- `admin.discovery.tsx` gains a focus-mode component for the no-URL rows driven by the
  existing `listUnfoundLinks` / `setLinkManually` / retry functions, requesting one page
  at a time and stepping through it in memory. "No such page" reuses the existing reject
  path with a note so the school is not searched forever.
- No migrations. No changes to `ingest_queue`, coach handling, sponsorship logic or any
  write path.
