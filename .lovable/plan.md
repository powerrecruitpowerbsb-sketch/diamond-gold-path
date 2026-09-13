# Roles hierarchy + making Intelligence visible

## Answering the question: staff vs coach

There is no difference. Today there are only two staff levels on file:

- **Admin** (`org_admin`) — can do everything for the organization, including billing fields and logo/colors.
- **Staff** (`org_staff`) — this *is* the coach level. The word "coach" is used in conversation and on some screens, "Staff" on the invite screen. Same permission set, two names. That inconsistency is the whole difference.

There is currently **no separate Owner level** — the admin who creates the organization is just an admin.

## Why Intelligence isn't in your menu

The Intelligence link is only added for organization admin and staff accounts. Signed in as a Power Recruit staff (superadmin) account, the menu shows Home, Search and Console — no Intelligence, even though the screen itself lets staff in. So it exists, it's just unlinked for that account.

## The hierarchy to build

| Level | Can do |
| --- | --- |
| Super Admin | Everything, all organizations, the console |
| Org Owner | Everything for their organization **including** billing and logo/colors |
| Admin | Same as Owner **minus** billing and logo/colors |
| Coach / Staff | Roster, intelligence (submissions go to the approval queue), no relationship rating, no invites of admins |
| Player | Reads own family portal and approved intelligence |
| Parent | Same as Player |

## Work

1. **Add the Owner level.** New role value `org_owner` (schema change — additive, nothing removed). Power Baseball's current admin becomes the Owner; the second existing admin account stays Admin.
2. **Owner-only surfaces.** Billing fields and Branding settings become Owner-only (and Super Admin). Everything else Admin keeps.
3. **One name for the coach level.** Every screen and invite dropdown says "Coach / Staff" for `org_staff`; the word "Staff" alone stops being used for it, so it can't be confused with Power Recruit staff.
4. **Invite rules.** Owner can invite anyone; Admin can invite Coach/Staff, Player, Parent; Coach cannot invite.
5. **Menu fix.** Intelligence appears for Owner, Admin, Coach/Staff and Super Admin, and also inside the console's own sidebar.
6. **Verification.** Sign in as each of the five test accounts and confirm the menu and the allowed screens match the table above.

## Technical notes

- Migration: add `org_owner` to the `user_type` enum; update `is_org_manager()` and every RLS policy that lists `org_admin` to include `org_owner`; keep `guard_organization_billing()` but allow Owner (currently superadmin-only path) where billing edits are intended; set the one Power Baseball owner row (`users.user_type` + `user_roles`).
- Frontend: a single role helper (`isOwner` / `isOrgAdmin` / `isOrgManager`) replacing the ad-hoc checks in `AppShell.tsx`, `intelligence.tsx`, `programs.$id.tsx`, `settings.team.tsx`, and the role labels in `invites.functions.ts`.
- Reader functions (`*.functions.ts`) get `org_owner` added to their role lists; no `*.server.ts` file is touched.
- Screens stay read-only apart from the already-approved organization-management and intelligence writes.
