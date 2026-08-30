# Clean up "Recent activity" + fix the School vs. Program language

## First: what "university" vs "program" actually means today

The database splits every school into two layers, and that split is correct — it's the naming that's confusing:

- **University** = the institution. One row per school. Holds academics and cost: enrollment, GPA/SAT/ACT, acceptance rate, tuition, net price, majors, campus setting, location.
- **Program** = one athletic team at that school. Vanderbilt has a *baseball* program and a *softball* program — two rows, one university. Holds governing body (NCAA/NAIA/NJCAA), division, conference, head coach, roster, roster URL, and our recruiting intelligence.

So families don't shortlist "Vanderbilt" — they shortlist "Vanderbilt Baseball", because the division, coach, and roster fit are program-level facts.

The fix is language, not structure. Everywhere staff and families see it:

- "Universities" becomes **Schools**
- "Programs" becomes **Programs (Baseball / Softball)** in nav, and each row/title reads **"Vanderbilt — Baseball (NCAA D1)"** instead of a bare school name
- Admin nav gets one-line helper text: *Schools = academics & cost. Programs = the baseball or softball team.*

No table or column renames — the schema stays as is.

## Should both programs be assumed for every school?

Mostly yes, so the UI should behave that way — but "both always exist" isn't safe as a hard rule: plenty of schools carry one sport and not the other (baseball-only at some NAIA/JUCO schools, softball-only at women's colleges, and D3 programs get cut or added). Collapsing to one row per school would then force us to invent divisions, conferences, and coaches that don't exist, and later force a painful un-merge.

The workable middle ground, which also sets up the crawler cleanly:

- When a school is added, the system **creates both a baseball and a softball program shell automatically**, each starting in an `unverified` state with no fabricated data. Staff never hand-create programs.
- Each program carries a **sport-offered state**: `verified` (confirmed the school sponsors it), `not_offered` (confirmed it doesn't), or `unverified` (nobody has checked yet). Search shows verified programs; `not_offered` is hidden from families but visible in the admin console.
- The school page shows **both sports side by side** — one tab/column each — so staff see the pair as one school, not two disconnected records. Families searching softball simply never see baseball rows.
- **Crawler-ready:** the crawler is handed a list of program shells with `unverified` status and fills in governing body, division, conference, coaches, and roster URL, or flips the program to `not_offered` — no row creation, no de-duplication guessing, and every field it writes lands next to a source URL and verified date in the existing `data_field_sources` table.

This is a small addition to the current schema (one status column on `programs`, plus auto-creating the pair on school creation), and it makes the language honest: a school always *has* both slots, but only the verified ones are real programs.

## Second: the Recent activity panel

The current panel prints raw database rows: table names in monospace (`org_athletes`, `athlete_saved_schools`), the vague word "changed", no indication of *which* athlete or *which* school, and no person. It's a debug dump wearing a card.

Replace it with a plain-English feed. Each entry answers: who, what they did, to whom, when.

Target reading:

```text
Mike Torres  moved Jake Miller's Vanderbilt Baseball to Contacted     2 hours ago
Mike Torres  added a staff note on Jake Miller  (parent-visible)      2 hours ago
Mike Torres  added Vanderbilt Baseball to Jake Miller's shortlist     yesterday
System       created athlete Jake Miller                              yesterday
```

Changes:

- **Human sentences** instead of table + "changed". A per-table phrasing map turns each audit row into a sentence.
- **Real record names.** The feed resolves `record_id` into an athlete name, school/program name, or note subject, so entries name the person and the school.
- **Actor shown**, with an avatar-style initials chip. "System" for automated writes.
- **Relative timestamps** ("2 hours ago"), grouped under **Today / Yesterday / Earlier** date headers, with the exact time on hover.
- **Field-level noise collapsed.** Multiple field changes to the same record in the same write become one entry ("updated 3 fields on Jake Miller"), expandable to see before/after.
- **Value changes** shown as `Researching → Contacted` chips using the status colors already in the design system, not monospace text.
- Kept to the 8 most recent, "View full log" unchanged.

The full audit log page (`/admin/audit`) keeps its detailed table for forensic use, but gains the same friendly record labels and actor chips so the two screens agree.

## Technical notes

- `getAdminStats` (in `src/lib/admin.functions.ts`) currently returns raw `audit_log` rows. It gains a label-resolution step: batch-fetch the referenced `org_athletes`, `universities`, `programs`, and `athlete_saved_schools` rows by `record_id` and attach `{ recordLabel, subjectLabel, sentence }` to each entry, plus a `groupKey` for collapsing same-write field changes. Same enrichment is applied in `listAuditLog`.
- New presentational component `src/components/admin/ActivityFeed.tsx` renders the grouped, sentence-based feed; `admin.index.tsx` and `admin.audit.tsx` both use it.
- Program display naming centralizes in a small helper (`programLabel(program)` → "Vanderbilt — Baseball (NCAA D1)") used by admin lists, search results, compare, shortlists, and program profiles.
- Label/nav copy updates touch `admin.tsx` nav, `admin.universities.index.tsx`, `admin.programs.index.tsx`, `search.tsx`, and the shortlist/compare cards. No migrations.
