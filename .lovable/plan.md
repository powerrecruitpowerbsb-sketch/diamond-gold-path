# Data-quality diagnostic (read-only)

Nothing in the database changes. Every step is a read, and the output is a set of spreadsheets you can open and review, plus headline counts in chat.

Confirmed already: 1,885 schools, 3,604 programs, 1,826 schools with a federal institution ID, 30,625 provenance records (30,624 marked "official source", 1 entered by staff).

## What gets produced

1. **Coverage** — `coverage.csv`: filled vs empty counts for athletics site, roster page, staff page, institution ID, governing body, division, conference, state.
2. **Collisions** — four spreadsheets:
   - `collision-athletics-domains.csv`: any athletics domain attached to two or more different schools, with every school on it — plus each school's state, number of programs, and level/division, so the real owner is obvious without a lookup.
   - `collision-page-urls.csv`: any roster or staff page used by two or more different programs, with the same school, state, program count and level/division columns.
   - `collision-similar-names.csv`: school pairs whose names are near-identical or where one contains the other, with both states and domains.
   - `collision-state-mismatch.csv`: schools whose stored state differs from the state on their federal institution record.
3. **Identity** — `identity.csv`: how many schools have a resolved institution ID vs matched by name only vs unmatched/parked, using the stored match status. Plus `no-federal-id.csv`: every school (currently 59) with no federal institution ID, with state and athletics domain — the group most likely to be misidentified.
4. **Provenance** — `provenance.csv`: per field, how many values have a recorded source, what kind of source it was, and when it was last checked. Fields with no recorded source are reported as "not tracked" rather than guessed. Note up front: only two source kinds are actually in use, so "AI inference" cannot be distinguished from other automated capture — that will be stated plainly, not inferred. Because of that, the same file adds a breakdown of the top 30 source websites by record count, which shows what is really feeding the database.
5. **Random sample** — `audit-sample-100.csv`: 100 programs stratified across NCAA D1/D2/D3, NAIA and JUCO (NJCAA/CCCAA/NWAC), with school, state, division, conference, athletics site, roster page, staff page. Seed fixed at **20260908** and stated in the reply.

## Technical notes

- Read-only SQL only; no writes, no migrations, no crawler runs, no scheduled work.
- Domain comparison reuses the existing `registrableDomain` normalisation so subdomains of one school's site do not read as a collision.
- Name similarity uses trigram/edit-distance plus containment, restricted to pairs (no full cross join) and capped for readability.
- State mismatch joins `universities` to `federal_directory` on the stored institution ID.
- Provenance comes from `data_field_sources` (field, source kind, source URL, last verified) joined to the populated program/school fields.
- Sampling is deterministic: seeded ordering per stratum, proportional to each level's program count.
