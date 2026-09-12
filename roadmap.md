# Power Recruit roadmap

## Done (this round)
- Roster/coach provenance: source page, domain, read time, run id on every player row and coach name; roster and coach writes refused without a source page, or when the domain belongs to another school (logged to roster_write_refusals).
- Provenance sweep: 87 rosters from another school's domain (2,530 players), 209 with no traceable source.
- Duplicate-squad sweep + cluster resolution applied: 84 wrong-school rosters removed, 2,298 players, run 665eac0c-340a-4df0-aeca-34eafed8649f.
- Name matcher: league shorthand ("Everett", "Modesto", "Loyola (La.)") now matches when only one school in the pool answers to it; sibling shorthand still refused. Both league passes re-issued.
- Coverage measurement on 100 stratified programs.

## Open
- Decide on the 87 provenance wrong-school rosters (report only so far) and the 209 untraceable ones.
- Apply the re-issued league pass (556 matched, 149 proposed not_offered) — awaiting go-ahead.
- Coach extraction only names a head coach on 16% of sampled programs; 36% of coach addresses are 404 and 15% blocked.

## Extraction gaps to close before the crawl (requested 2026-09-12)
- [ ] home_state — split the hometown cell ("Tampa, FL", "Tampa, Fla.", full state names)
- [ ] home_country — set when the hometown names a country; PR/territories count as US
- [ ] is_transfer / is_juco_transfer — previous-school columns, "TR" class cells; JUCO checked against our own school list
- [ ] position — confirm middle (2B+SS) and corner (1B+3B) infield groupings are derivable; do NOT split OF
- [ ] Prove 1-3 against the saved fixtures: what each fixture publishes vs what is captured
