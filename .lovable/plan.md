# Step 4 — the Intelligence layer, built as a workstation

Checked first: all three intelligence tables are empty (recruiting_intelligence 0 rows,
program_relationships 0, interaction_log 0), there is exactly one organization on file
(Power Baseball), and `recruiting_intelligence` is today readable by **every** signed-in
user (policy `USING (true)`) with `UNIQUE (program_id, field_type)` and no
`organization_id`. So the tenant boundary is genuinely missing, and the backfill affects
zero rows — the migration is a pure structure change with nothing to rewrite.

## 1. The migration (additive — reported here, run first)

Nothing is dropped and no column changes type. Roles map to the existing enum:
owner/admin = `org_admin`, coach = `org_staff`.

**recruiting_intelligence**
- `organization_id uuid NOT NULL REFERENCES organizations` (default Power Baseball so the
  column can be added safely; existing rows: none)
- `visibility` enum `intel_visibility` (`org_only`, `shared_with_families`)
- `status` enum `intel_status` (`draft`, `pending`, `approved`, `rejected`, `changes_requested`)
- `structured_value text` — the single-choice structured answers (strong/developing/…)
- `positions text[]` — position multi-selects
- `structured_detail jsonb` — graduation needs by position + year, and future structured shapes
- `author_user_id`, `editor_user_id`, `reviewed_by`, `reviewed_at`, `review_note`
- unique key becomes `UNIQUE (program_id, field_type, organization_id)`
- indexes on `(organization_id, program_id)`, `(organization_id, status)`,
  `(organization_id, field_type, structured_value)` so the structured answers can drive
  filters later with no further migration

**intel_field_type** gains the field types the spec names that don't exist yet: portal
usage, JUCO recruiting, HS vs transfer lean, physical traits valued, coaching staff
reputation, program stability, development philosophy, roster needs, current priorities,
graduation needs, staff notes, players previously recruited.

**program_relationships**
- `organization_id uuid NOT NULL`, `placed_players_before boolean`,
  `primary_college_contact text`, `program_stability_note text`,
  `visibility` (same enum, default `org_only`)
- `relationship_strength` gains a text form (`strong`/`developing`/`minimal`/`none`) kept
  alongside the existing 1–5 integer, so nothing already written stops working
- `UNIQUE (program_id, organization_id)`

**interaction_log** — `organization_id uuid NOT NULL`; stays staff-only.

**Access rules (RLS, replacing the superadmin-only and read-all policies)**
- read: members of the row's own organization, plus superadmin
- families (parent/player) read only rows their organization owns **and** that are either a
  family-visible field type or explicitly flagged `shared_with_families`
- write: `org_admin` directly; `org_staff` may insert/update only its own rows and only
  while status is `draft`/`pending`/`changes_requested`; only `org_admin` sets relationship
  strength; superadmin retains full access
- `interaction_log` and staff-only relationship detail: no parent/player access at all
- GRANTs to `authenticated` and `service_role` on every changed table; no `anon`

## 2. The workstation — `/intelligence`

Visible to `org_admin` and `org_staff` only. Sidebar entry for those roles.

**Left — the program list.** Same filter set as search (sport, location via the shared
region helper, governing body + division, conference) plus: has intelligence / none yet,
relationship strength, written by me / anyone, needs review / rejected / approved, and last
updated before a date. Dense 38px rows: program, level, conference, fields filled (e.g.
`6/14`), relationship strength, who last touched it and when. Selecting a row loads the
panel without leaving the page; the list keeps its scroll position, and a "next program"
control walks the filtered list so eight write-ups in one sitting means no page reloads.

**Right — the editing panel.** All fields on one screen, grouped **Recruiting /
Relationship / Notes**, each field saving on its own with its own state (saved, pending
approval, sent back) — never one giant submit. Structured fields render as selects or
multi-selects; free-text fields as compact textareas. Coaches see relationship strength
read-only. A "log an interaction" box sits under Relationship.

**Two more panels on the same screen:** *My submissions* (what I wrote, what stage each is
at, with the reviewer's note when sent back) and, for `org_admin`, the *approval queue* —
approve, reject, send back for editing, or edit and approve. Edit-and-approve records both
the original author and the editor, and both names show wherever the record is attributed.

## 3. What families see

The profile's existing Our Intelligence block gets wired to real data, scoped to the
viewer's organization.

- Family view: the recruiting conclusions (style of play, philosophy, tendencies, preferred
  profile, positions prioritised, HS/transfer/JUCO, portal usage, geographic, timeline,
  roster construction), relationship strength as the rating word only, a yes/no on whether
  the organization has placed players there, plus anything flagged shared with families.
- Staff view: everything, with org-only material in a separate, clearly marked internal
  block. Each record shows its visibility flag and (for admins) a control to share it with
  families.
- Only `approved` records display on the profile. Pending and rejected stay in the
  workstation.

## 4. Verification before hand-back

- Read as a parent and confirm interaction notes, primary contact, named players and staff
  notes are absent — checked against the database, not just the screen.
- Read as a second organization's member and confirm Power's rows return nothing.
- Coach writes a field, confirm it lands as pending and does not appear on the profile;
  admin edits and approves, confirm both names are recorded and it now displays.
- Confirm a coach cannot set relationship strength through the server function, not only
  that the control is disabled.

## Technical notes

- Reads and writes go through new `createServerFn` handlers in
  `src/lib/intel.functions.ts` (extending it, replacing the superadmin-only gate with an
  organization + role gate). No `*.server.ts` file is touched.
- Structured answers are stored in typed columns (`structured_value`, `positions`,
  `structured_detail`) with indexes, so the later staff/family filters are a UI change only.
- The existing superadmin console keeps its current intelligence and CRM screens; they gain
  the organization scope for free.
- Region and location filtering reuse `src/lib/regions.ts`; the results table reuses the
  step-1 console table components.
- Per-route head metadata on `/intelligence`.
