# Show where the run is, and move to the next level by itself

Right now the level buttons only say how many teams are waiting. There's no sign of which level is being worked on, how far through it is, or when it's finished — so you have to guess when to click the next one.

## What you'll see

A "Working on now" line at the top of the level panel:

- The level currently released (for example "NCAA Division I")
- A progress bar with plain numbers: done of total for that level, plus how many are in flight
- Time estimate based on the recent pace ("about 35 min left at the current pace")
- A finished state: "NCAA Division I is complete" with the next level named

Each level button gets the same three numbers — done, left, waiting its turn — and a tick when that level is fully collected, so the whole board reads at a glance.

## Move to the next level automatically

Add a switch, on by default: **Work through the levels in order**. When the released level runs out of work, the run releases the next one on its own (D1 → D2 → D3 → NAIA → NJCAA → CCCAA → NWAC) and notes the handover in the activity line. Turn the switch off to stay on one level and choose the next yourself, exactly as today.

Clicking a level by hand still works and always wins — it just becomes the new current level for the auto-order to continue from.

## Technical notes

- `waveProgress` in `src/lib/waves.server.ts`: also count `done` and `running` per level so each level reports done/total, and return the currently released level (the one with released work) plus a per-level `complete` flag.
- Store the chosen level and the auto-advance switch on `collection_state` (new `current_wave text`, `auto_advance boolean default true` columns) so both the UI and the scheduled runner agree.
- Advance inside the scheduled pass: in `src/routes/api/public/collection-runner.ts`, when a pass comes back idle and `auto_advance` is on, call `setCollectionWave` for the next level in `WAVES` order and keep running instead of marking the whole run finished; only mark finished when no level has work left.
- Pace/ETA: derive from `ingest_queue` rows completed in the last 10 minutes (server-side, returned with wave progress) rather than computing in the browser.
- `CollectionRunner.tsx`: current-level header with progress bar, per-level done/left/waiting counts, completion ticks, and the auto-advance toggle; poll wave progress every 30s while running.
