# Checked: those four are not done yet

I verified against the code rather than the notes. Current state of the roster reader (`src/lib/roster-extract.ts`):

- **Home state — not captured.** The reader stores the hometown as one whole piece of text ("Tampa, FL"). Nothing splits the state off, so the state field on player records stays empty.
- **Home country — not captured.** No country handling at all; an overseas hometown is just text.
- **Transfer / junior-college transfer — not captured.** The reader never looks at previous-school columns or a "TR" class cell. Both flags stay false on every player it reads.
- **Positions — partly there.** The reader recognises positions including the middle/corner infield wordings, but it stores the page's own label as-is; there is no grouping, so "middle infield" and "corner infield" cannot be searched as groups.

One consequence worth naming: the search screen already offers state and transfer as filters, and reads those exact fields, so today those filters have nothing to work with for anything the reader collected.

(An older path that asks an AI model to read a page does fill state and transfer flags. The structural reader — the one the crawl will use — does not.)

## What I would build

1. **Split the hometown into town, state and country.** Handle "Tampa, FL", newspaper style ("Tampa, Fla."), full state names, Canadian provinces, and a bare town under a hometown column. Puerto Rico and other US territories count as US. When the tail names a country, set the country and leave the state empty. Never guess: an unrecognised tail stays part of the town text.
2. **Read transfer signals.** Use previous-school / last-school columns and "TR" style class cells. Mark a junior-college transfer only when the named previous school matches a two-year school on our own list; otherwise a named four-year school is a plain transfer. No named school means no flag.
3. **Group positions.** Keep the page's own label, and add a derived group so middle infield (2B, SS) and corner infield (1B, 3B) are searchable. Outfield stays one group — not split into left/centre/right.
4. **Report published vs captured, per field.** Extend the existing "did the page publish this column" reporting to cover state, country and transfers, so a blank is always attributable either to the page or to us.
5. **Prove it on the saved pages.** Run items 1-3 against the four saved real pages already in the project and report, per page, what the page publishes versus what we now capture. New tests for each rule; existing player counts must not drop.

## Technical notes

- All changes in `src/lib/roster-extract.ts` plus a new town/state/country splitter with its own tests; `parseRoster` gains `home_state`, `home_country`, `is_transfer`, `is_juco_transfer`, `previous_school`, and a derived `position_group`.
- Write path: `replaceRoster` in `src/lib/review.server.ts` already writes `home_state`, `is_transfer`, `is_juco_transfer`; it will pass the new values through. `home_country` already exists on `roster_players`. Position grouping is derived at query time from the stored position — no new column, no enum change, so no migration.
- The junior-college test uses our own `universities` rows (two-year federal flag / NJCAA-CCCAA-NWAC governing body) rather than a keyword list.
- Report only until you approve; no crawl, no writes to player rows.
