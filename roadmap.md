# Roadmap

## In progress
- [ ] Roster provenance (root cause): add source_url/source_domain/extracted_at/run id to roster_players and coach rows; require source_url in replaceRoster; verify domain ownership before write, else queue for review; backfill from stored roster_url, mark rest unknown-provenance; report rosters whose source domain belongs to another school.

## Done
- [x] 60% duplicate-name overlap sweep (161 pairs, 113 clusters, 248 programs) — kept as second check
- [x] Carolina University vs UNC Chapel Hill determination

## Queued
- [ ] Re-run the 32 "league list may be incomplete" programs against the league lists with the fixed name rule; reword verdict to "match failure until proven otherwise"
- [ ] Delete confirmed wrong-school rosters (13 + sweep additions) with archive run id, clear roster/coach URLs, no re-search
- [ ] Coverage measurement: 100 programs stratified by governing body, per-program extraction outcome, coverage table by governing body (read-only)
