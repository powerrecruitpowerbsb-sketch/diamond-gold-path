# Phase 2b: School Comparison + Staff Intelligence & Relationship Tools

## 1. Comparison tool (search results)

- Each result card on `/search` gets an "Add to compare" control (checkbox-style, 44px touch target, gold accent when selected). Max 4; the control disables with a "4 max" hint once full.
- Persistent compare tray: fixed bottom bar above the mobile tab bar, bottom-right card on desktop. Shows selected school chips (removable), the count, "Clear", and a "Compare" button enabled at 2+.
- Selection lives in one small React context so it survives navigating between search and a profile page.
- `/compare?ids=a,b,c,d` — IDs in the URL, so a comparison is shareable and survives refresh (validated, capped at 4, invalid IDs dropped).
- Layout: attribute labels in a sticky left column, one column per school scrolling horizontally on narrow screens. Same rows in the same order for every column so values line up. No shrunken 4-up grid on mobile.
- Rows: school name + division/governing-body badge, sport, location (city/state/region), then the verified stats already on the profile page (avg GPA, avg SAT/ACT, acceptance rate, in/out-of-state tuition, estimated cost, roster size), scholarships, and academic classification. Verified values reuse the existing green-tinted `VerifiedStat` language; differing values are subtly emphasized, no new table style invented.
- Live ad-hoc only — nothing saved to the database.

## 2. Admin program detail page (superadmin)

New route `/admin/programs/{id}` inside the console, reached from the program list. The existing edit form moves to a sibling path so the detail page is not forced to act as its layout. Detail page shows program/school summary, a link to the public profile, and the two new sections below.

### Recruiting Intelligence section

- Add form: field type selector (all nine types) + free-text content.
- List of existing entries for the program, each editable in place and deletable, showing last editor and timestamp.
- Saves go through a superadmin-guarded server function that stamps `created_by`/`updated_by`, then invalidate the program-profile query so the public "Our Intelligence" block reflects the change immediately (verified live, not just in the admin view).

### Relationship section (internal, superadmin-only)

Visually separated from the intelligence block (neutral/graphite framing, clearly labelled internal, never green "verified" styling):

- Relationship strength 1-5 selector, primary contact chosen from users with the superadmin role, and last meaningful interaction date.
- Interaction log below: newest-first dated notes with optional event context, plus a one-line quick-add field.

## 3. Access control

- Every relationship/interaction read and write goes through server functions that re-check `is_superadmin()` server-side and return 403 for anyone else — the route guard is UX only.
- Existing RLS on `program_relationships` and `interaction_log` already restricts them to superadmin; the plan adds no anon or org-scoped policy.
- The public profile route never queries those tables, so relationship data has no code path into a family-facing response.

## Verification before finishing

- Compare with exactly 2, 3, and 4 schools selected, on desktop and at 375px width.
- Add an intelligence entry as superadmin, then load the same program's public profile as a parent/org_admin test login and confirm it appears.
- As that same non-superadmin login, hit `/admin/programs/{id}` and the relationship server functions directly and confirm both are refused, not merely hidden.

## Technical notes

- No database migration needed — `recruiting_intelligence`, `program_relationships`, and `interaction_log` already exist with the right columns and policies.
- New: `src/lib/compare.functions.ts` (public-ish comparison fetch via `requireSupabaseAuth`), `src/lib/intel.functions.ts` (superadmin intel + relationship CRUD), `src/routes/_authenticated/compare.tsx`, `src/routes/_authenticated/admin.programs.$id.tsx`, plus a `CompareTray` component and compare-selection context.
- Search params validated with `zodValidator` + `fallback`, following the existing `/search` pattern.
- Tabular numerals on every numeric cell; `head()` metadata added for the two new routes.
