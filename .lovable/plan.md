# Phase 2 — Authentication + Superadmin Admin Console

Replaces the bare confirmation table with real auth screens and a full staff admin console, on the established Ink Navy / gold, Source Serif 4 + Public Sans design system.

## Decisions locked in

- Signup requires a shared **org invite code**; valid code joins Power Baseball as `org_admin`.
- New accounts must **confirm their email** before signing in.
- Universities list is a **card grid** (with search + state/sport filters).
- Per-field source + verified date uses an **inline compact control** under each key field.

## Security fixes shipped in this phase

- Signup no longer trusts client-supplied role metadata. The signup path forces `org_admin` + Power Baseball server-side; the role is inserted only by trusted server code, so nobody can self-grant `superadmin`.
- Invite codes live in a new table, hashed, with expiry and optional max-use count. Redemption happens server-side.
- Audit logging is enforced by **database triggers**, not by form code, so no write can bypass it.

## 1. Authentication screens

- **Log in** (`/auth`): on-brand card over a subtle navy gradient with a warm radial highlight, serif headline, gold focus rings. Inline errors, "forgot password" link.
- **Sign up**: name, email, password, invite code. Success state = "check your email to confirm", not a fake logged-in state.
- **Forgot password** (`/forgot-password`) and **Reset password** (`/reset-password`) — the reset route is public and handles the recovery link properly.
- **Post-login routing** reads the authoritative role from `user_roles`:
  - `superadmin` → `/admin`
  - `org_admin` / `org_staff` → `/dashboard` ("Org dashboard — coming in Phase 3")
  - `parent` / `player` → `/family` ("Family portal — coming in Phase 3")
- Header reflects session state (account menu + sign out), with clean sign-out cache teardown.

## 2. Superadmin admin console (`/admin`)

Superadmin-only, gated at both the route and every server function.

**Console home** — stat cards (universities, programs, majors, recent edits), a prominent **Add a New School** call to action, and a recent-activity feed drawn from the audit log.

**Universities**
- Card grid: name, city/state, public/private, size, enrollment, plus verified indicators and a gold "programs" count. Search by name, filter by state, size, setting, public/private.
- Create/edit form in sections: School Profile · Academics & Admissions · Tuition & Cost · Location & Travel. Every column on the table is editable.
- Inline source control under each key field (GPA, SAT/ACT, acceptance rate, graduation rate, tuition, room & board, cost of attendance, net price, enrollment): source URL, source type, verified date. Writes to `data_field_sources`.
- Detail page: profile summary, verified-source citations, classifications panel, and linked baseball/softball programs.

**Programs**
- Create/edit linked to a university via a searchable select. Sport is a two-option Baseball/Softball toggle. Covers governing body, division, conference, links, coaching staff, scholarship info.
- List filterable by sport, governing body, division, and state.

**Majors**
- Add / rename / remove majors, with in-use protection before delete.
- Assign majors to a university from the university detail page (many-to-many).

**Add a New School** (prominent guided flow)
1. University info (same sectioned fields, progressive)
2. Add one or more programs (baseball and/or softball)
3. Review and confirm

Saves atomically in a single server call — no orphan university if a program step fails. The result is indistinguishable from any other entry; no pending state in this phase.

**Classifications**
- On university and program detail pages: set `academic_bucket` (Academic+ / Academic / Standard Admission), `campus_culture` (evidence text required), `school_size_bucket`, `campus_setting`.
- Manual entries automatically set `is_staff_overridden = true` and leave `ai_suggested_value` null, ready for the Phase 4 pipeline.

## 3. Audit logging

Field-level diff triggers on `universities`, `programs`, `majors`, `university_majors`, `classifications`, and `data_field_sources` write one `audit_log` row per changed field with actor, table, record, field, old value, new value, and action. An **Audit log** screen in the console lists recent activity with filters by table and actor.

## Verification before this is called done

Sign in as the seeded superadmin, add a school through the guided flow, edit several fields (including a sourced one), set classifications, and confirm the matching rows appear in the audit log and on the Audit screen. Also verify a non-superadmin is denied the console, and that signup without a valid invite code is rejected.

## Technical notes

- Database migration adds: `org_invites` table (hashed code, expiry, max uses, uses, created_by) with grants + RLS; a `redeem_invite`-style server-side signup completion path; unique constraint on `data_field_sources (table_name, record_id, field_name)` for upserts; unique constraint on `programs (university_id, sport)`; an `audit_log` insert policy for the trigger path; the audit diff trigger function and triggers; hardening of `handle_new_user` so it ignores client role metadata.
- All reads/writes go through `createServerFn` with `requireSupabaseAuth`; each mutating function re-checks `has_role(userId, 'superadmin')` server-side before writing.
- Routes live under `src/routes/_authenticated/` for gated screens; `/auth`, `/forgot-password`, `/reset-password` stay public.
- Forms use react-hook-form + Zod with shared schemas reused by the guided flow and the flat edit forms.
- Email confirmation stays on; the guided-flow and audit verification runs against the existing seeded superadmin account.
