# Phase 5 — Shortlists, athlete status tracking, and the staff dashboard

Wires search and program profiles to real athlete shortlists, upgrades the athlete detail page, and replaces the placeholder dashboard with the org's recruiting engine.

## 1. Save to shortlist (search + program profile)

- Add a "Save to shortlist" action to each search result card and to the program profile header.
- Context-aware behavior:
  - Arriving from an athlete's detail page (an athlete context carried in the URL), the school saves straight to that athlete with status Researching, and the button reads "Save to <athlete first name>".
  - From general search with no athlete context, a small dialog opens with a searchable dropdown of the org's athletes; picking one saves immediately.
- Saves are idempotent: saving the same school twice for the same athlete updates the existing row rather than creating a duplicate, and the button switches to a "Saved" state (with the current status) once the school is on that athlete's list.
- Parent/player roles are not addressed here; they will only ever see their own athlete's context in the next phase.

## 2. Athlete detail page: shortlist board + notes

Shortlist section becomes a status board with five groups — Researching, Contacted, Offered, Committed, Eliminated — each a column on desktop and a stacked, collapsible group on mobile, with a count per group.

Each saved-school card shows:
- School name, sport, and a division badge (governing body + division).
- An inline-editable notes field (saves on blur).
- A "Move to…" status dropdown.
- A link into the full program profile.
- A remove action (confirm first) that deletes the shortlist row entirely — kept visually distinct from marking the school Eliminated, which keeps the record.

Staff notes section:
- Timestamped notes with author, newest first.
- Explicit per-note badge: gold "Visible to parent" vs. gray "Internal only", plus a toggle on each existing note so visibility can be corrected after the fact.
- The add-note form defaults to internal, with the consequence spelled out next to the toggle.

## 3. Staff dashboard (`/dashboard`)

For org_admin and org_staff, built with the existing design system (stadium-gradient hero, soft-shadow cards, tabular numerals, mono metadata labels):

- Hero band with org name and headline totals: athletes, schools saved, offers, commits.
- Aggregate cards:
  - Targets by division — D1 / D2 / D3 / NAIA / JUCO counts across every athlete's shortlist, as a labeled horizontal bar breakdown.
  - Targets by region — same treatment using the university region/state data.
  - Pipeline by status — the five statuses with their signature colors.
- Roster-wide athlete list: one card per athlete (grad year, position) with a compact colored status-count strip (e.g. "3 researching · 2 contacted · 1 offered") and a total. Each card links straight to that athlete's detail page. Searchable and filterable by grad year.
- Mobile: aggregate cards stack full-width; the athlete list stays a card list at narrow widths (no horizontal table). All controls keep 44px touch targets.

## 4. Verification before finishing

Signed in as an org_admin against real data: save a school from search via athlete picker and from an athlete context, confirm it appears in the right status group on the detail page and in that athlete's dashboard counts; change status and reload to confirm persistence; edit and remove a shortlist note/row; toggle a note's parent visibility and confirm the badge and stored value match.

## Technical notes

- One database migration only: a unique constraint on `athlete_saved_schools (org_athlete_id, program_id)` so the save path can upsert. Existing RLS on `athlete_saved_schools`, `org_player_notes`, and `org_athletes` is already org-scoped via `is_org_manager()` + `current_org_id()`, with superadmin full access — no policy changes needed.
- New `src/lib/shortlist.functions.ts` holding auth-gated server functions: `saveSchoolToShortlist` (single upsert write path used by search, profile, and detail page), `updateShortlistEntry` (status + notes), `removeShortlistEntry`, `listAthletePicker`, and `getOrgDashboard` (aggregates computed in one server call).
- `athletes.functions.ts` gains `setNoteVisibility`; `getOrgAthlete` extends its saved-school select with conference/state so cards can show region.
- New components: `ShortlistSaveButton` (with athlete-picker dialog) under `src/components/brand/`, plus dashboard stat components; search and program-profile routes gain an optional `athleteId` search param to carry athlete context.
- Dashboard aggregation reads programs + universities joined through the shortlist rows in a single query, grouped in JS — no new SQL functions.
