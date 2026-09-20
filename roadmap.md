# Power Recruit roadmap

## Done (this round)
- Roster/coach provenance: source page, domain, read time, run id on every player row and coach name; roster and coach writes refused without a source page, or when the domain belongs to another school (logged to roster_write_refusals).
- Provenance sweep: 87 rosters from another school's domain (2,530 players), 209 with no traceable source.
- Duplicate-squad sweep + cluster resolution applied: 84 wrong-school rosters removed, 2,298 players, run 665eac0c-340a-4df0-aeca-34eafed8649f.
- Name matcher: league shorthand ("Everett", "Modesto", "Loyola (La.)") now matches when only one school in the pool answers to it; sibling shorthand still refused. Both league passes re-issued.
- Coverage measurement on 100 stratified programs.

## Pre-crawl cleanup (approved 2026-09-20)
- [x] Wrong-school rosters cleared: only 24 player rows from a rival domain remained; deleted.
- [x] Duplicate composition summaries cleared: 3,779 extra rows removed, newest kept per program+season; 2,650 remain.
- [x] Unique index roster_snapshots (program_id, season_year); the crawl now replaces a season's summary instead of stacking another.
- [x] Coach staff-page fallback (coach-path.ts): when the stored address cannot be read and no staff name came out of the run, try the common /sports/<slug>/<coaches|staff|…> paths on the school's OWN athletics host; the page must still name this school, and the stored address is never rewritten.

## Open
- [x] League pass applied 2026-09-20: 149 league + 65 NJCAA rows marked not_offered (run 99db7ebf, 207 already were), and 17 of the 556 matched rows confirmed as offered (run 119ec3f2; the other 539 were already verified). Both reversible from program_level_archive. Counts now: 3,123 verified / 369 not_offered / 112 unverified.
- Crawl itself: NOT started, awaiting the go-ahead.
- Coach extraction only names a head coach on 16% of sampled programs; 36% of coach addresses are 404 and 15% blocked (fallback above should lift this; measure on the next crawl).

## Extraction gaps to close before the crawl (requested 2026-09-12)
- [ ] home_state — split the hometown cell ("Tampa, FL", "Tampa, Fla.", full state names)
- [ ] home_country — set when the hometown names a country; PR/territories count as US
- [ ] is_transfer / is_juco_transfer — previous-school columns, "TR" class cells; JUCO checked against our own school list
- [ ] position — confirm middle (2B+SS) and corner (1B+3B) infield groupings are derivable; do NOT split OF
- [ ] Prove 1-3 against the saved fixtures: what each fixture publishes vs what is captured
- [ ] Position groups derived from the STORED position value, never the page's wording (MIF and SS land together); OF stays one bucket
- [x] Report on the second reader (the AI page reader in ingest.server.ts): reported; it is now the fallback only.

## One reader + guarded snapshot (approved 2026-09-12)
- [x] Single entry points (roster-read.server.ts, coach-read.server.ts); the crawl and the roster re-check call them; AI reader is fallback only, on an empty structural read
- [x] Season year and wording picked structurally from the page's own headings
- [x] Coaches: the crawl calls the tested coach reader; the two-field AI ask is the fallback
- [x] Which reader read the page recorded on player rows and on the composition summary
- [x] Composition summary guarded by the source-page and domain check; suspicious reads written marked suspect and withheld from display and dashboard counts
- [x] Crawl-path tests against the saved fixtures (13 tests): structural reader ran, model never called, fallback fires only on a page with nothing to read, summary guarded before the write
- [ ] Apply the summary backfill: 3,052 summaries, 2,962 own-page, 90 to mark suspect — reported, awaiting go-ahead

## Full crawl (2026-09-12)
- [x] Athletics-only crawl over every program not marked not_offered (3,238), resumable, guarded writes
- [ ] Quarantined sites: one attempt each at the end of the run; report which respond
- [ ] Seven reports (coverage, reader split, refused writes, no-data reasons, composition at scale, league disagreements, head coach titles)

## Player card, measurables & schedules (2026-09-19)
- [x] Athlete contact + parent contact, home town, high school, club team, GPA/SAT/ACT, eligibility ID, socials, highlight links
- [x] Measurables kept as dated rows with a source (hand-entered, Curve Testing, HandledReports, Perfect Game, PBR) so outside services can feed in later
- [x] Team schedules posted by staff auto-appear on assigned athletes; families can add their own guest-play events
- [x] Shareable scout card: public link per athlete, on/off plus a contact-details switch
- [x] Coach email addresses + outreach composer (Email coach tab on the school sheet)
- [x] True-fit meter: academic Safety/Target/Reach from published bands, depth + senior turnover at the athlete's own position group, recruiting footprint by state — a school with no roster on file is labelled pending, never marked down or hidden

## Player photo + direct social links (2026-09-20)
- [x] Player photo upload on the card; empty state falls back to the org logo, then initials
- [x] X / Instagram show as icon links straight to the handle, on the internal card and the shareable card
