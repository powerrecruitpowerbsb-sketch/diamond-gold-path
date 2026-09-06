# All 1,885 schools are there — the lists were cut off at 1,000

Good news first: nothing is missing from the database. Rollins College (FL) and Radford University (VA) are both in it, both confirmed against the federal data, and both have verified baseball and softball programs.

What is wrong is what the screens ask for. Every school list asks for the schools in alphabetical order but the data service returns a maximum of 1,000 rows per request, and no screen asks for the rest. Alphabetically, school number 1,000 is "Mt. San Jacinto College" — so everything from "Muhlenberg College" onward simply never arrives. That is why the list looks like it stops in the middle of the M's, and why searching for R-names finds nothing: the search box filters the rows that arrived, not the whole database.

The same 1,000-row ceiling silently trims three other places.

## What to fix

1. **School list (admin Schools)** — fetch every school in 1,000-row pages instead of one request, so all 1,885 appear and the name search covers all of them.
2. **Program list (admin Programs)** — same problem, worse: 3,604 programs, only 1,000 arriving. Page through all of them and order by school name.
3. **"Choose a school" picker** when adding a program — currently only offers the first 1,000 names; page through all.
4. **Family/staff school search** — it asks for 400 matches with no defined order, so an unfiltered browse shows an arbitrary 400 and the count is misleading. Add a stable order (school name) at the data level and report when more matches exist than are shown.
5. **Filter dropdowns** (states, regions, conferences, divisions) — these are built by reading every school and program row, so they are also capped at 1,000 and can be missing conferences. Build them from a distinct-value read instead of a capped row scan.

Once this is in, I'll verify by loading the Schools list and confirming the total reads 1,885, and by searching "Rollins", "Radford", and a few other late-alphabet names on both the admin and family search screens.

## Technical notes

- Root cause: PostgREST caps rows per request (1,000 here). `listUniversities`, `listPrograms`, `listUniversityOptions`, and `getSearchFacets` in `src/lib/admin.functions.ts` / `src/lib/search.functions.ts` have no `.range()` pagination.
- Add a shared page-through helper (`.range(offset, offset + 999)` looping until a short page) and use it in all four server functions.
- `searchPrograms` also needs `.order("name", { referencedTable: "universities" })` before `.limit(400)`, and should return a flag when the cap was hit so the UI can say "showing first 400 — narrow your filters".
- Facets: replace the full-table scans with distinct value reads (dedicated views or `select` on the column with pagination) so no facet is truncated.
- No schema changes, no migration, no data repair needed.
