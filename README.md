# Diamond Prospector

I'm building "Power Recruit," a college baseball and softball recruiting research platform. Before building any screens, set up the following foundation.

=== DESIGN TOKENS ===

Establish these as the design system for every component from here forward — don't use default Tailwind/shadcn colors or fonts.

Colors (use these exact hex values as CSS custom properties):

- --org-primary: #1F3A5F (Ink Navy) — default brand color, header/nav chrome, primary UI structure. This will later be overridable per-organization (see Organizations table below) but defaults to this value.

- --navy-deep: #12233A — darker navy for gradients

- --org-accent: #D3A94E (warm gold) — default accent, overridable per-organization

- --chalk: #F0F1F4 — page background, cool off-white (not warm cream)

- --seam-red: #9A2B2B — FIXED, never themeable. Reserved exclusively for "Our Intelligence" content (proprietary staff insight) and primary CTA buttons.

- --seam-red-tint: #FBEFEF — light red background tint for Our Intelligence content blocks

- --diamond-green: #2F6B45 — FIXED, never themeable. Reserved exclusively for "Verified Data" indicators (sourced, factual information).

- --diamond-green-tint: #EAF3EC — light green background tint for Verified Data chips

- --graphite: #23262B — body text

- --steel: #6B7280 — secondary text, captions, metadata

Critical rule: --seam-red and --diamond-green (and their tints) are fixed platform-wide and must NEVER be affected by organization theming. Only --org-primary and --org-accent are themeable per-organization. This is a functional distinction (fact vs. opinion), not a decorative one — don't let it drift.

Typography:

- Display/headings: Source Serif 4 (Google Font) — bold, confident sizing for hero/headline moments (40px+ for main headlines), not just a quiet label font

- Body/UI: Public Sans (Google Font)

- Metadata/source citations: IBM Plex Mono (Google Font), small size, for anything like "Source: ... · Last verified: ..."

- Apply tabular numerals (font-variant-numeric: tabular-nums) to all numbers in tables, stats, and roster data so figures align in columns

Visual approach — this matters: build with real energy and depth, not a flat/minimal admin-panel look. Cards get soft shadows and 12-14px border radius, not thin flat outlines. Any hero/landing area should use a navy-to-deep-navy gradient with a subtle warm radial highlight (like stadium floodlights), a large bold headline, and stat callouts. Reserve flat/minimal treatment specifically for dense data tables (rosters) where legibility matters most — everywhere else should feel considered and premium, not sparse.

Mobile is a first-class target, not an afterthought: below ~680px, replace top navigation with a fixed bottom tab bar (icon + label, 4 items max) and a hamburger menu for anything else. All interactive elements need minimum 44px touch targets on mobile. Verified-data grids that show 4 columns on desktop should drop to 2 columns on mobile, not shrink illegibly.

Explicitly avoid: purple-to-blue gradients, glassmorphism/frosted glass, Bebas Neue or Oswald or other condensed all-caps "sports app" fonts, neon green checkmarks, glossy 3D badge icons, stock photo athletes, pill-shaped buttons on everything, emoji as UI icons.

=== DATABASE SCHEMA (Supabase) ===

Set up the following tables with Row Level Security enabled on all of them from the start.

**users** (extends Supabase auth.users)

- id (uuid, FK to auth.users)

- email, name

- user_type: enum('superadmin', 'org_admin', 'org_staff', 'parent', 'player')

- organization_id: uuid, nullable, FK to organizations (null for superadmin)

- linked_org_athlete_id: uuid, nullable (used later once org_athletes exists — leave the column, no FK constraint needed yet)

- created_at

**organizations**

- id, name, billing_contact_email

- billing_status: enum('trial', 'invoice_sent', 'active', 'suspended', 'canceled'), default 'trial'

- is_founding_free_org: boolean, default false

- annual_fee_amount: numeric, nullable

- stripe_customer_id, stripe_invoice_id, stripe_invoice_url: text, nullable (used in a later phase)

- invoice_sent_at, paid_at, access_expires_at: timestamp, nullable

- logo_url: text, nullable

- brand_primary_color: text, nullable (hex value; falls back to default Ink Navy in the UI if null)

- brand_accent_color: text, nullable (hex value; falls back to default gold if null)

- created_by: uuid, FK to users

- created_at

Seed one row: name = "Power Baseball", is_founding_free_org = true, billing_status = 'active'.

**universities**

- id, name, city, state, address, region

- campus_setting: enum('urban', 'suburban', 'rural')

- undergrad_enrollment: integer

- school_size_bucket: enum('small', 'medium', 'large')

- public_private: enum('public', 'private')

- religious_affiliation: boolean, religious_tradition: text nullable

- website_url, admissions_url

- nearest_airport: text, distance_to_airport_miles: numeric

- avg_gpa: numeric, avg_sat: integer, avg_act: integer, acceptance_rate: numeric

- test_optional: boolean

- graduation_rate: numeric, student_faculty_ratio: text

- tuition_in_state: numeric, tuition_out_state: numeric, room_board: numeric

- est_cost_of_attendance: numeric, est_net_price: numeric

- tuition_source_url, financial_aid_url

- created_at, updated_at

**majors**

- id, name

**university_majors** (join table)

- university_id FK, major_id FK

**programs**

- id, university_id FK

- sport: enum('baseball', 'softball')

- governing_body: enum('NCAA', 'NAIA', 'NJCAA')

- division: text (e.g. "D1", "D2", "D3")

- conference: text

- athletic_website, coaching_staff_url, roster_url, facility_url: text

- head_coach_name, recruiting_coordinator_name: text

- scholarships_available: boolean

- scholarship_details: text nullable (e.g. "partial scholarship sport, ~11.7 equivalencies")

- last_roster_pull_at, last_verified_at: timestamp

**roster_players**

- id, program_id FK, season_year: integer

- name, class_year: enum('FR','SO','JR','SR','GR')

- position: enum('C','1B','2B','3B','SS','OF','UTIL','RHP','LHP','TWO_WAY')

- bats: enum('R','L','S'), throws: enum('R','L')

- hometown, home_state, home_country: text

- is_transfer: boolean, is_juco_transfer: boolean, two_way: boolean

- sport_specific_attributes: jsonb, nullable (flexible field for baseball/softball-specific data that doesn't warrant its own column)

**data_field_sources**

- id, table_name: text, record_id: uuid, field_name: text

- source_url: text, source_type: enum('official', 'aggregator', 'manual')

- last_verified_at: timestamp, verified_by: uuid FK to users nullable

**classifications**

- id, university_id FK nullable, program_id FK nullable (one or the other set depending on classification_type)

- classification_type: enum('academic_bucket', 'campus_culture', 'school_size', 'geographic_region', 'campus_setting')

- value: text, ai_suggested_value: text nullable

- is_staff_overridden: boolean, default false

- override_reason: text nullable

- evidence_text: text nullable, evidence_source_url: text nullable

- confidence_score: numeric nullable

- reviewed_by: uuid FK to users nullable, reviewed_at: timestamp nullable

**audit_log**

- id, actor_id: uuid FK to users

- table_name: text, record_id: uuid, field_name: text nullable

- old_value: text nullable, new_value: text nullable

- action: enum('create', 'update', 'override')

- created_at: timestamp

=== ROLE-BASED ACCESS (RLS) ===

Set up Supabase auth with email/password. Implement Row Level Security so that:

- superadmin: full read/write on universities, majors, programs, roster_players, classifications, data_field_sources, audit_log, organizations. Can read all organizations' data.

- org_admin / org_staff: read-only on universities, majors, programs, roster_players, classifications (the shared college database) — no write access to these. Scoped to their own organization_id for anything organization-specific (which doesn't exist as a table yet in this phase — just make sure the users table itself correctly scopes an org_admin/org_staff to only see other users within their own organization_id).

- parent / player: same read-only access to the shared college database as org_admin/org_staff. No access to other users' data.

No public-facing search UI yet in this phase — build a simple internal screen (accessible to superadmin only) that lists universities and programs in a plain table, just to confirm the schema and data entry work end to end. Full search/filter comes in the next phase.

Confirm the design tokens, schema, and this basic confirmation screen are working before we move to the next prompt.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://diamond-gold-path.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/22d6cec7-bc5c-43e5-82ee-df62e50746fc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
