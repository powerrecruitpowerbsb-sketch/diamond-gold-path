# Power Recruit — Foundation (Phase 1)

Set up the design system, the backend schema with role-based security, and one internal
verification screen. No public search UI in this phase.

## 1. Design system

Define every color as a CSS custom property in `src/styles.css` and register it as a Tailwind
token so components use `bg-org-primary`, `text-seam-red`, etc. — never raw hex in components.

- Themeable: `--org-primary` (#1F3A5F Ink Navy), `--org-accent` (#D3A94E gold), plus
  `--navy-deep` (#12233A) for gradients.
- Fixed, never themeable: `--seam-red` (#9A2B2B) + `--seam-red-tint` (#FBEFEF) for "Our
  Intelligence" and primary CTAs; `--diamond-green` (#2F6B45) + `--diamond-green-tint`
  (#EAF3EC) for "Verified Data" indicators.
- Neutrals: `--chalk` (#F0F1F4) page background, `--graphite` (#23262B) body text,
  `--steel` (#6B7280) secondary/metadata.

Enforcement of the fact-vs-opinion rule: org theming will only ever write `--org-primary`
and `--org-accent` at runtime (inline style on a provider element). The seam/diamond tokens
live in `:root` and are never emitted by the theming path, so they cannot drift.

Typography (Google Fonts loaded via `<link>` in the root route head):
- Source Serif 4 — display/headings, bold, hero headlines 40px+.
- Public Sans — body/UI.
- IBM Plex Mono — small metadata and source citations.
- A `.tabular` utility applying `font-variant-numeric: tabular-nums` for tables, stats, rosters.

Component defaults, built now as reusable primitives:
- `Card` — soft shadow, 12–14px radius (not flat outlines).
- `StadiumHero` — navy → deep-navy gradient with a warm radial highlight, large serif headline,
  stat callouts.
- `VerifiedChip` (diamond green tint) and `IntelBlock` (seam red tint) — the two semantic
  data treatments.
- `SourceLine` — mono "Source: … · Last verified: …".
- `AppShell` — top nav on desktop; below 680px a fixed 4-item bottom tab bar (icon + label)
  plus hamburger for overflow. Minimum 44px touch targets. Verified-data grids: 4 cols
  desktop → 2 cols mobile.

Avoided per your direction: purple/blue gradients, glassmorphism, condensed all-caps sports
fonts, neon checkmarks, glossy 3D badges, stock athlete photos, universal pill buttons,
emoji icons.

## 2. Backend

Enable Lovable Cloud (database + auth + server functions; no external accounts needed), then
create all tables exactly as specified, with RLS enabled on each and Data API grants:

`organizations`, `users`, `universities`, `majors`, `university_majors`, `programs`,
`roster_players`, `data_field_sources`, `classifications`, `audit_log` — with the enums you
listed (`user_type`, `billing_status`, `campus_setting`, `school_size_bucket`, `public_private`,
`sport`, `governing_body`, `class_year`, `position`, `bats`, `throws`, `source_type`,
`classification_type`, `audit_action`).

One security change to your spec, and it matters: the role must not be readable/writable on the
same row a user can update, or org_admins can escalate themselves to superadmin. I'll keep
`user_type` as the app-facing value but store the authoritative role in a separate
`user_roles` table read by a `security definer` function (`has_role`, `current_org_id`), which
all policies call. Same behavior, no privilege-escalation hole and no RLS recursion.

Auth: email/password sign-in at `/auth`, protected app routes behind the authenticated layout.
A trigger creates the `users` row on signup.

### Access rules
- superadmin — full read/write on the shared college database, classifications,
  data_field_sources, audit_log, organizations; reads all orgs.
- org_admin / org_staff — read-only on universities, majors, university_majors, programs,
  roster_players, classifications, data_field_sources. Can see only users whose
  `organization_id` matches their own.
- parent / player — same read-only shared-database access; can read only their own user row.
- No anonymous access to any table in this phase.

Seed data (literal INSERTs in the migration): the "Power Baseball" organization
(`is_founding_free_org = true`, `billing_status = 'active'`), plus a small set of sample
universities, majors, programs and roster players so the verification screen has real rows to
prove the schema end to end.

## 3. Verification screen

`/admin/data` — superadmin only, behind the auth gate and enforced by RLS. Two dense, flat,
legible tables (the one place minimal styling is intentional):
- Universities: name, city/state, region, setting, size bucket, public/private, enrollment,
  cost figures — tabular numerals.
- Programs: university, sport, governing body, division, conference, head coach,
  scholarships, last verified — with a verified chip and mono source/verified line.

Non-superadmins hitting the route see a clear "not authorized" state rather than an error.

## Technical notes

- Data reads go through `createServerFn` with the authenticated Supabase middleware, so RLS
  evaluates as the signed-in user; route loaders use TanStack Query.
- Every `CREATE TABLE` is followed by GRANTs to `authenticated`/`service_role` in the same
  migration; `anon` gets nothing.
- `users.linked_org_athlete_id` is created as a plain uuid column with no FK, as specified.
- Head metadata (title/description/OG) set per route.
