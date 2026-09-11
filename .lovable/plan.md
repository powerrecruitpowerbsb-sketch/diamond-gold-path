# School data inventory, roster/coach extraction fixes, and a preview with real names

Report only. Nothing is written, no queue is released, no stored address is changed.

Framing kept as stated: school-level facts come from the federal directory wherever they exist; athletics sites are read only for rosters and coaching staff. Nothing about school-level collection is narrowed.

## 1. Complete school-level inventory

One workbook-style set of CSVs, covering every field held at school level — not a selection:

- `school-fields-inventory.csv`: every column on the school record and every school-level column on the program record (governing body, division, conference, athletics site, roster page, coach page), with: what it holds, filled count out of 1,885, source as recorded in provenance, last-refresh timestamp range, and whether refresh is automated or one-time.
- Source labelling is honest: provenance records only "official source" vs "manual", so the source column names the actual mechanism per field from the code path that writes it (federal sync, governing-body feed, scrape, manual, unknown) rather than guessing from the label.
- `federal-vs-scraped.csv`: fields we currently scrape or infer that the federal directory publishes (candidates to re-source federally).
- `federal-not-imported.csv`: a walk through the full IPEDS survey component list (Institutional Characteristics, Admissions, Student Financial Aid, Completions, Graduation Rates, Outcome Measures, Fall Enrollment, Human Resources, Finance, Academic Libraries) naming every publishable field we do not import at all.
- `manual-only-fields.csv`: fields with no reliable source, dependent on manual entry.
- `federal-coverage-by-level.csv`: schools with no federal record broken out by governing body (NCAA D1/D2/D3, NAIA, NJCAA, CCCAA, NWAC, USCAA, none), including what kind of institution each is. Known starting point: 1,826 of 1,885 have a resolved ID, 59 do not.

## 2. Roster extractor diagnosis and rebuild

For USF baseball (217), Wake Forest (208), Vanderbilt (81) and LSU (10), re-read each stored page and report the exact cause per school: navigation and related-links text, other sports on the page, several seasons merged into one list, or rows injected by script after render (under-count).

Then change extraction to read the roster table only: for each player capture name, jersey number, position, class year, plus height, weight and hometown where the page carries them. Script-loaded tables are read through the rendered fetch path rather than raw HTML.

## 3. Row-level validation, no size gate

Roster-size ranges stop being a quality gate; the existing 60-player ceiling is removed.

- A player row needs a name plus at least one of jersey number, position, or class year. A bare name is dropped.
- Rows whose name matches navigation text, a staff title, or a story headline are dropped.
- If a page carries more than one season or sport, only the requested one is extracted and the others are reported.

Shape flags replace size flags: high share of bare-name rows (page furniture), duplicate names (seasons merged), zero rows with jersey numbers (table never found). Every reported count carries the per-attribute counts beside it.

## 4. Head coach by name

Coach extraction returns a head coach name and title specifically, plus assistants where listed. A page with no identifiable head coach is a failure regardless of how many titles it contains. Counts of titles are no longer reported as a result on their own.

## 5. Judge the stored value

The same page-kind and extraction checks run against the value already on file, so "same address already on file" stops counting as a pass. A sport-specific field holding a department-wide staff directory, an all-sports staff page, or an athletics index fails — LSU softball's `lsusports.net/staff-directory` is the example case. Output: how many stored roster and coach addresses across the whole database fail the check, by failure kind.

## 6. Re-run the 20-school preview with real data

Same 20 schools, still writes nothing. Exports:

- `step3-players.csv`: school, sport, player name, number, position, class, source URL
- `step3-coaches.csv`: school, sport, coach name, title, head-coach flag, source URL
- `step3-proposals.csv`: the previous proposal columns plus per-row attribute counts (rows found, with number, with position, with class, bare names, duplicates)

Plus a whole-database report: how many stored roster and coach addresses would fail extraction, and how many programs would end up with a head coach name.

## Technical notes

- Roster parsing moves into a dedicated module with a row-shape validator; `rosterVerdict`/`rosterKeepable` size ceilings in `src/lib/data-quality.ts` are replaced by shape signals, and `src/lib/ingest.server.ts` verification against the source page is kept.
- Coach extraction extends `src/lib/coach-quality.ts` with head-coach identification (title match plus name adjacency) and individual-bio rejection already present in `src/lib/page-purpose.ts`.
- Stored-value auditing reuses `verifyPagePurpose` plus the new extractors, adding department-directory and all-sports detection for sport-specific fields.
- Preview runs through a report-only script in `tmpscripts/`, using `safeFetch` and the existing protected-host quarantine; protected hosts are recorded as unread, never verified.
- Federal field gaps are documented against IPEDS survey components; no new import is built in this step.
- Unit tests cover row validation, season/sport splitting, head-coach identification, and the department-directory rejection.
