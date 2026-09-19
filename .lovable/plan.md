# Step 5 — Contact continuum, two-way messaging, and the saved-list patterns

Report first, as asked. Nothing is migrated or built until you approve.

## What already exists (findings)

`athlete_saved_schools` is already the continuum in embryo. One row per
(athlete, school-team), with `status`, a free-text `notes`, who added it, and
created/updated timestamps.

- **Stage values on file today:** `researching`, `contacted`, `offered`,
  `committed`, `eliminated` — a fixed database enum (`saved_school_status`),
  identical to the five defaults you named.
- **Every place that reads or writes it:**
  - Writes: the saved-list server code (`saveSchoolToShortlist`,
    `updateShortlistEntry`, `removeShortlistEntry`), and the school-merge
    routine which re-points rows when two schools are merged.
  - Reads: the athlete detail page, the staff dashboard aggregates (by stage,
    division and region), the athlete picker behind "Save to list", the family
    portal, the organizations list (saved-school counts), and the activity log
    (which already names this table "shortlist entry").
  - Screens: athlete detail, family portal, dashboard, search results save
    button, program profile save button.
- **Change history already works.** The table carries the same audit trigger
  used everywhere else in the product — every field change is already written
  to the activity log with actor, field, old value and new value. The continuum
  needs no new audit mechanism, only stage changes flowing through that trigger.
- **Who can write it today:** staff only. Parents have read-only access to
  their athlete's list; a player account has no path at all (the family link
  table covers parents, and the player's own link lives on their user record).
  Letting players and parents move a school is therefore a genuine access-rule
  change, not just a UI change.

## 1. Contact continuum — extend, don't duplicate

**Recommendation: add `org_stage_id` alongside the existing status, keep the
enum column.** Converting the stored column away from the enum would touch all
eleven read sites plus the dashboard's stage aggregates and the family portal's
colour coding in one irreversible step. Instead:

- New `continuum_stages` table: organization, name, sort order, an optional
  `maps_to` pointing at one of the five defaults, active flag. Every existing
  organization and every newly created one is seeded with the five defaults.
- `athlete_saved_schools` gains `org_stage_id`, backfilled to each org's
  matching default stage. The enum column stays and is kept in step with the
  stage's `maps_to`, so the dashboard, family portal and search keep working
  unchanged while every screen starts displaying the organization's own wording.
- Renaming or adding a stage is an owner/admin setting; the five defaults can be
  renamed and reordered but not deleted while schools sit in them.

**Who can move a school:** staff (as today), plus the athlete's parents and the
player themselves — for that athlete only, within their own organization.
Attribution comes from the existing audit trigger, so every move records who,
from what, to what, and when, and shows in the same activity log as everything
else.

This stays separate from Relationship Intelligence: different table, different
screen, org-wide and admin-only as it is now.

## 2. Two-way messaging — schema before building

- `message_threads` — one row per (athlete, school-team) plus organization,
  created-by, created-at, last-message-at, and a flag for whether it is closed.
  Unique on (athlete, program).
- `thread_participants` — thread, user, role on the thread, added-at, and
  `removable` false for parents. When a thread is created, the athlete's linked
  player account and **every** parent on file are added automatically; a coach
  cannot remove a parent.
- `messages` — thread, author, body, sent-at, plus an edit window: an
  `edited_at` and a `body_original` so a correction is visible rather than
  silent. Nothing is ever deleted.
- **Read state:** one `last_read_at` per participant per thread (on
  `thread_participants`), so unread counts are a single comparison against the
  thread's last message — no per-message read rows.
- `message_reports` — thread, optional message, reporter, reason, created-at,
  status. Written by the flag control on every thread; visible on a new console
  screen for Power Recruit staff. No moderation workflow beyond "someone can
  find it".
- **Access rules:** participants read and write their own thread; staff read and
  write threads for athletes they can already see (the same team-assignment rule
  used across the product); superadmin sees everything. Nothing crosses an
  organization boundary, and there is no participant set that excludes a parent
  when a parent exists.

## 3. Search and saved-list patterns (read layer only)

- **Saved list** — filterable by continuum stage, sport and level, in a scroll
  region, no pagination.
- **Results in place** — advanced search results render above the filter panel,
  which stays visible and adjustable; no page navigation. Each row gets "Add to
  list", and a row already on that athlete's list reads "Added" with its current
  stage.
- **Detail overlay** — clicking a saved school opens a sheet over the right
  three-quarters, saved list still clickable on the left, tabs Overview / Roster
  / Intelligence / Notes & Messages, plus "Go to full profile".
- The six always-visible primary filters stay exactly as built; the advanced
  modal is reached from "More filters" and supplements them.

## 4. Program profile redesign — flagged, not built

What it would take, for its own step: a real page header (school mark and colour
space, name, level, conference, location) carrying four or five headline numbers
before any table; a two-column body with a sticky section rail; roster
composition as a visual breakdown rather than count rows; imagery space per
school (we hold no school images today, so that needs a source decision); and
the intelligence blocks restyled as pull-outs rather than tables. Roughly a full
step on its own. Not touched this round.

## Technical notes

- One migration: `continuum_stages`, `athlete_saved_schools.org_stage_id`,
  `message_threads`, `thread_participants`, `messages`, `message_reports`; seed
  of the five default stages per organization; grants and row-level rules for
  each new table; the audit trigger attached to the new tables so changes log
  the same way. Additive — no column dropped, the status enum untouched.
- New write policies on `athlete_saved_schools` for a linked parent and for the
  linked player, scoped to their own athlete; a helper for "this user is the
  athlete, or a parent of the athlete".
- New server code: `continuum.functions.ts` (stage list, stage move, org stage
  settings) and `messaging.functions.ts` (threads, send, mark read, report).
  Existing saved-list functions gain the stage id and keep their enum writes.
- New screens/components: stage settings for owners/admins, the saved-list
  scroll region with stage filter, the school detail sheet with its four tabs,
  the thread view, and a console screen listing flagged threads.
- No `*.server.ts` file is modified except the school-merge remap if the new
  column requires it.
