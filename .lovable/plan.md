# How a school leaves the "needs a decision" pile

## What happens today

A school in the pile has one of two labels: no federal record found, or several possible records. Three things can move it out:

1. **Choose record** — you pick the right federal record and its cost, academic, size and location details are pulled in. The school is marked confirmed.
2. **Not in the federal data** — the school is parked. It stops asking for a decision and stays fully searchable, but its cost and academic details stay blank. Reversible from the parked list.
3. **A later automatic retry finds a match** — "Try the unresolved again" re-runs matching with the improved name matching, which is how the last big batch dropped from 447 unresolved to 65.

What is missing: there is no way to say "this school genuinely isn't in the federal directory, so I typed its details in myself, and it's now complete." A school whose details you fill in by hand on its edit screen still reads as parked or unresolved, and its typed-in numbers carry no note about where they came from.

## What to add

**1. A "filled in by hand" state**

Give a parked school a third outcome: marked complete because a person entered the details. On the school's edit screen, a short banner appears for any school that is parked or unresolved:

- Explains in one line that federal data has nothing for this school, so its cost and academic details have to be typed in.
- Lists which of those details are still blank.
- A "Mark as filled in by hand" button, enabled once the key cost and academic fields have values. It records who did it and when.

These schools then read as complete in the console counts and never come back into the decision pile or the parked list.

**2. Show the parked reason where staff actually look**

On the school page and program profile, a school with no federal record shows a quiet line — "Cost and academic details entered by hand" or "Cost and academic details not yet available" — instead of blank fields with no explanation. Families and staff stop wondering whether the data is missing or the school is free.

**3. A worklist for parked schools**

The parked list gets a "details still blank" count per school and a link straight to its edit screen, so working through them is a queue rather than a hunt. Sorted so the schools your athletes have shortlisted come first.

**4. Undoing stays honest**

"Look again" already sends a parked school back for another automatic try. A school marked as filled in by hand keeps its typed-in values if a federal match later turns up — the automatic pass only fills blanks, never overwrites a person's entry, and anything it disagrees with goes to the review queue instead.

## Technical notes

- `universities.federal_match_status` already permits `manual`; nothing writes it today. Use it for the filled-in-by-hand state and include it in the confirmed-style counts in `src/lib/pipeline.functions.ts` (`pipelineStatus`, `listFederalBlocked`, `listFederalParked`).
- New server function `markFederalManual({ universityId })` in `src/lib/pipeline.functions.ts`: sets status `manual`, stamps `federal_synced_at`, closes the `federal_data` queue row, and writes `data_field_sources` rows with `source_type: 'manual'` for the fields that have values, so the citation line on the program profile keeps working.
- Completeness check driven by `SOURCED_UNIVERSITY_FIELDS` in `src/lib/admin-schemas.ts` — a small shared helper returns the blank sourced fields for a school and is reused by the edit banner and the parked worklist.
- Gap-fill in `src/lib/federal-data.server.ts` already treats non-null values as authoritative; add `manual` to the statuses it will not overwrite so a later match can't clobber typed-in numbers.
- No schema migration required.
