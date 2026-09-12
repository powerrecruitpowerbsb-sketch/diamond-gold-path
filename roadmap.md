# Power Recruit build roadmap

## Now
- [x] Export the list of wrong pages cleared in the page check (`/mnt/documents/wrong-pages-cleared.csv`)
- [x] Record every page that can't be read (new `unreadable_pages` record) instead of only counting it
- [x] Re-read the stored pages so the unreadable ones are named, then export `/mnt/documents/unreadable-pages.csv` (170 pages still unreadable)

## Next
- [ ] Step 2: finish rosters (drain pending/stuck roster work)
- [ ] Step 3: coach pilot — 25 hand-checked programs; broad coach auto-fill stays off until the self-check passes
- [ ] Step 4: close out leftovers (unconfirmed sponsorship, remaining found pages and proposed changes)
- [ ] Schedule refreshes (rosters twice a year, school facts yearly) and weekly accuracy samples

## Roster extractor fixes (2026-09-12, report only)
- [ ] FURNITURE regex: \b on both sides; never run against a player name, judge the row's origin (link/heading/story); same in parseCards
- [ ] Report players dropped into the furniture bucket across the database, with names
- [ ] Accept "Last, First" / "Last, First Middle", normalize to "First Last"
- [ ] jerseyNumber: accept 0-3 digits
- [ ] hometownValue: accept comma-less town under a hometown column
- [ ] Remove dead `|| true` clause
- [ ] Re-run 20-school extraction; report per-program player gains
