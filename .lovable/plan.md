# Phase 4 — Power's own athlete roster, ingestion, and org branding

## What gets built

### 1. Org athlete schema
Three new tables, all scoped to an organization:

- **org_athletes** — name, grad year, primary position, bats (R/L/S), throws (R/L), plus two placeholder columns held for later phases (`linked_parent_user_id`, `linked_handled_profile_id`) and `athlete_data_source` (manual / csv / handled / curve_testing, default manual).
- **athlete_saved_schools** — links an athlete to a college program with a status (researching, contacted, offered, committed, eliminated), who added it, and notes.
- **org_player_notes** — staff notes on an athlete, with a `visible_to_parent` flag (kept false-by-default; families are wired up in a later prompt).

Access rules: org admins and org staff can see and manage every athlete, saved school, and note belonging to **their own** organization and no other. Power Recruit superadmins can see across all organizations. Parent/player access is intentionally not granted yet — that arrives with family accounts. Timestamps auto-update, and changes are audited like the rest of the platform.

### 2. One shared ingestion path
A single `upsertAthlete` service handles athlete create/update. Manual entry and CSV import both call it, and future Handled / Curve Testing integrations plug into the same function — no per-source duplication.

**Manual entry:** short form (name, grad year, position, bats, throws), source stamped `manual`.

**CSV import:** upload → map columns to fields → preview parsed rows → import. The preview flags rows that look like an existing athlete (same name + grad year) and lets staff choose per row: update, skip, or create anyway. Missing required columns and malformed rows are reported inline with row numbers, not as a generic failure, and nothing is written until the import is confirmed. Source stamped `csv`.

### 3. Athlete roster (org staff-facing)
- Roster list showing every athlete in the org, with grad year and position at a glance, name search and a grad-year filter.
- Athlete detail view: their info, saved schools, and notes — deliberately simple, since the next prompt builds it out.
- Both org_admin and org_staff can add, import, and edit athletes.

### 4. Organization branding settings (org_admin only)
- Logo upload (PNG or SVG, 2MB cap) into a public `org-branding` bucket at `{organization_id}/logo…`, saved to `organizations.logo_url`. Upload policies restrict writes to that org's own folder.
- Primary brand color picker → `brand_primary_color`, with a contrast check that warns when white header text would be hard to read. Warning only — saving is never blocked.
- Optional accent color → `brand_accent_color`.
- Live header preview using the pending logo/colors before saving.

**Applying it:** the app shell reads the signed-in user's organization branding and sets `--org-primary` / `--org-accent` as CSS variable overrides through the existing `OrgTheme` mechanism — the same approach as the theme demo, driven by real values. Missing logo or color falls back to Power Recruit navy/gold; the header never renders blank or broken while branding loads.

**Superadmin console stays unthemed:** the admin console explicitly renders outside org theming, so it always shows fixed Power Recruit navy/gold regardless of any org values — not merely because superadmins have no organization.

Org branding applies everywhere an org user goes (search, profiles, roster, settings); `/admin` is always exempt.

## Verification before finishing
- Set a logo and color for Power Baseball, then sign in as an org account and confirm the header changes; confirm the superadmin console is still navy/gold.
- Add one athlete manually and import a small CSV (including a duplicate row and a malformed row) and confirm `org_athletes` is populated correctly with the right source values.
- Confirm an org account cannot read another organization's athletes, saved schools, or notes.

## Technical notes
- Enums: `bats_hand` / `throws_hand` already exist and are reused; new enums for `athlete_data_source`, `saved_school_status`.
- RLS uses the existing `current_org_id()` and `is_superadmin()` security-definer helpers; child tables check ownership through `org_athletes.organization_id`. Every new table gets explicit GRANTs alongside its policies.
- New server functions in `src/lib/athletes.functions.ts` (roster reads, `upsertAthlete`, CSV commit) and `src/lib/org-branding.functions.ts`; role checks live server-side, not just in the UI.
- New routes under `src/routes/_authenticated/`: `roster.index.tsx`, `roster.new.tsx`, `roster.import.tsx`, `roster.$id.tsx`, `settings.branding.tsx`. A "Roster" nav item appears for org staff only.
- Branding is fetched once at the shell level via the existing session-gated account hook, so anonymous/pre-session renders don't fire unauthorized calls.
- CSV parsing is done client-side for mapping/preview; the confirmed rows are sent to the server for the actual writes.
