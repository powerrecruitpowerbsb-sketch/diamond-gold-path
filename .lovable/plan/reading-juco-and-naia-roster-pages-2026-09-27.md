# Reading JUCO and NAIA roster pages

## Goal
Lift roster coverage for NJCAA (56.6%), CCCAA (45.8%), NWAC (67.3%) and NAIA (68.7%) toward the NCAA level (~88–91%), with the new rosters landing in live data automatically.

## Steps
1. **Sort the misses.** For every JUCO/NAIA team with a roster address but no players, record why: page wouldn't load, wrong page (schedule/news), PrestoSports layout, SIDEARM variant, PDF roster, or custom site. Show the counts so we fix the biggest group first.
2. **PrestoSports reader.** Most JUCO sites run on PrestoSports. Add a reader for its roster table and card layouts (number, name, position, class, B/T, height, weight, hometown / high school / previous school).
3. **SIDEARM variants and PDFs.** Handle the less-common SIDEARM layouts and roster PDFs that the current reader skips.
4. **Wrong-page fixes.** When an address points at the team home or schedule, follow the "Roster" link on the page and save the corrected address.
5. **Test on a sample of 30** teams across the four leagues, compare against the pages by hand, and report accuracy before anything else is written.
6. **Backlog run.** Pull the ~300 unread teams through the improved reader, writing rosters and transfers to live data. Anything still unreadable goes to the "Needs you" list in the Command Center.
7. **Keep it running.** The daily autopilot uses the same reader, so these teams refresh on their own after this.

## Rules kept
- Bare school names count as colleges only if they read like one or match the schools directory.
- JUCOs are never assumed to not offer the sport.
- A re-read that finds far fewer players than before is held for review, not saved.

## Technical details
- New layout detectors inside `src/lib/roster-extract.ts` (PrestoSports table/card), PDF text path in the fetch step, roster-link follow in `roster-read.server.ts`.
- Failure category stored per program so the Command Center can count them.
- Regression tests added per new layout using real page samples.
