# Phase 3 — Recruiting intelligence schema + the family search experience

Adds the three new tables with their (deliberately different) access rules, then builds the
two screens org staff and families will actually live in: college search and the program
profile page.

## 1. Backend

Three new tables, all with RLS enabled, Data API grants, and the existing field-level audit
triggers attached:

- `recruiting_intelligence` — program_id, `field_type` enum (style_of_play,
  recruiting_philosophy, positions_prioritized, preferred_player_profile,
  transfer_juco_tendencies, freshman_tendencies, geographic_tendencies, recruiting_timeline,
  roster_construction_tendencies), content, created_by/updated_by, timestamps.
  **Readable by every signed-in role; writable by superadmin only.**
- `program_relationships` — program_id, relationship_strength (1–5, constrained),
  primary_contact_staff_id, last_meaningful_interaction_at.
- `interaction_log` — relationship_id, staff_id, interaction_date, notes, event_context.

The last two are Power Recruit's internal business data: **every policy is superadmin-only**,
and `anon`/org roles get no grant at all — no org_admin, org_staff, parent, or player can read
them under any circumstance. I'll verify this by querying as a non-superadmin after the
migration, not just by reading the policy.

**My recommendation on the internal CRM UI:** ship schema + RLS only this phase. There's no way
to enter a relationship row without a staff-picker, an interaction timeline, and a "last
meaningful interaction" rollup — that's a real screen, and it belongs with the next staff-tools
prompt alongside the recruiting-intelligence editor. Building half of it now means building it
twice. The tables and policies land now so the next prompt is pure UI.

Also added: an index on `roster_players (program_id, season_year)` so roster-size filtering
stays fast, and a helper view/function that resolves each program's **most recent season on
file** for roster counts.

## 2. Search screen — `/search`

Available to org_admin, org_staff, parent, player — and to superadmin as a read-only preview so
you can see exactly what families see.

Stadium-gradient hero with the search panel layered into it (not a bare form). All filter state
lives in URL search params, so a search is shareable, survives refresh, and the back button from
a profile returns you to your results.

Primary filters, always visible: sport toggle (Baseball/Softball), state, governing body +
division, school-name search.

"More filters", collapsed by default and full-width on mobile: region, conference,
public/private, school size, campus setting, academic classification (from `classifications`),
major offered, religious affiliation, and range controls for tuition, GPA, SAT, ACT, acceptance
rate, and roster size — plus athletic scholarships yes/no.

Results are cards: school name, sport, division badge, city/state, and two or three headline
verified stats with the green verified treatment. Empty state and result count are explicit.
Filtering runs server-side through an authenticated server function so RLS applies as the
signed-in user.

Bottom tab bar gains Search as its primary item for org/family roles.

## 3. Program profile — `/programs/$id`

- Header: university + sport, division badge, location / conference / public-private metadata.
- **Verified Data** grid: individual `--diamond-green-tint` cards, each with the small circular
  checkmark seal and "VERIFIED" label — GPA, cost of attendance, roster size (most recent
  season), acceptance rate, enrollment, tuition, test scores, scholarships. 4 columns desktop,
  2 columns mobile.
- Mono source-citation line beneath the grid, pulling the real `source_url` and
  `last_verified_at` from `data_field_sources`, ending "· Refreshed quarterly".
- A stitch divider, then the **Our Intelligence** block in `--seam-red-tint` with any
  `recruiting_intelligence` rows grouped by field type. With no rows — the common case until the
  next prompt — a quiet single-line empty state: "Recruiting insight for this program hasn't
  been added yet." No empty red box.
- Current roster composition table from `roster_players`, grouped by position with counts by
  class year: tabular numerals, navy header border, zebra striping, plus totals.
- Nothing from `program_relationships` or `interaction_log` appears anywhere on this page.

## 4. Verification before I hand it back

- Sign in as an org/family role and confirm filters return correct results (spot-check a couple
  of combinations against direct database counts).
- Open a program with zero `recruiting_intelligence` rows and confirm the quiet empty state,
  the verified grid, the citation line, and the roster table all render.
- Check the profile and search at mobile width with the bottom tab bar reachable.
- Confirm a non-superadmin read of `program_relationships` and `interaction_log` returns nothing.

## Technical notes

- Reads go through `createServerFn` with the authenticated Supabase middleware; TanStack Query
  in components, Zod-validated `validateSearch` with `fallback()` for the filter params.
- Range filters clamp in the component, per the search-param rules — no bounds in the schema.
- Every new table gets GRANTs in the same migration; `anon` gets none.
- Per-route head metadata, including a program-specific title/description on the profile page.
