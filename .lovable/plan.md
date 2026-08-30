# Data review queue + roster history

Both tables already exist in the database from earlier phases (`pending_data_changes`, `roster_snapshots`), with superadmin-only write policies and signed-in read on roster history. One gap confirmed: neither table has Data API grants, so any read/write from the app would fail with a permission error. That gets fixed first.

## 1. Database fix (one migration)

- Grant Data API access on `pending_data_changes` (superadmin-only via existing policy) and `roster_snapshots` (read for signed-in accounts, writes for superadmin), plus service-role access for the future pipeline.
- No column or table changes — the existing shapes already match the spec (table name, record id, field name, proposed value, source url/type, AI confidence, status, reviewer, timestamps; snapshots with position counts, class-year counts, transfer and JUCO transfer counts, source url).

## 2. Review queue (superadmin only)

New admin screen at `/admin/review`, linked in the admin nav as **Review queue** with a pending-count badge.

- Lists every pending proposal, sorted so the lowest-confidence items come first, with a low-confidence flag on anything under 0.7 (and on items with no score).
- Filters: record type (Schools / Programs / other), confidence band (low / medium / high / none), and "new record" vs "field change".
- Each row expands to a side-by-side comparison: current live value on the left, proposed value on the right, plus source link, source type, confidence, and when it was proposed. Whole-new-record proposals show a field-by-field table of the proposed record.
- **Approve**: writes the proposed value onto the live school/program record (or inserts the new record), records the source url + verified-now timestamp in the field-source table, then marks the item approved with reviewer and time. Existing audit logging on the live tables captures the change automatically.
- **Reject**: marks the item rejected with reviewer and time, touching no live data.
- Checkbox selection with a **Approve selected** action for batch clearing, and a "select all high-confidence" shortcut. Each item is applied independently so one bad row can't silently drop the rest — the result reports how many applied and lists any failures.
- Empty state when nothing is pending, noting that items appear here once the ingestion pipeline runs.

## 3. Roster history on the program admin page

New section on `/admin/programs/$id`:

- Table of snapshots, most recent first: pull date, season year, roster size, transfers, JUCO transfers, and a compact per-position breakdown with class-year counts.
- Small trend strip above it showing roster size and transfer count movement across the available snapshots.
- Empty state: "No roster history yet — this builds up after each quarterly refresh."

## 4. Verification before finishing

Using temporary test proposals against a real school and program:
- an approved field change lands on the live record and creates/updates the matching field-source row with the source url and a fresh verified timestamp;
- an approved new-record proposal inserts the record;
- a rejected proposal leaves live data byte-for-byte unchanged;
- the queue no longer lists resolved items.
Test rows are removed afterwards, leaving only the real data untouched.

## Technical notes

- New `src/lib/review.functions.ts` (list / approve / reject / batch approve) and `src/lib/roster-history.functions.ts`, both behind `requireSupabaseAuth` plus the existing superadmin assertion used by the other admin functions.
- Approval reuses the same source-writing helper as the school/program editors so field-source rows stay consistent.
- Proposed values are validated against the known school/program field lists before being applied, so a malformed proposal is rejected rather than written to a live column.
