# Roles hierarchy, organization impersonation, and Intelligence visibility

## Answering the question: staff vs coach

There is no difference. Today there are only two staff levels on file:

- **Admin** (`org_admin`) — everything for the organization, including billing fields and logo/colors.
- **Staff** (`org_staff`) — this *is* the coach level. "Coach" is used in conversation, "Staff" on the invite screen. Same permissions, two names — that inconsistency is the whole difference.

There is currently **no separate Owner level**; whoever creates the organization is just an admin.

## Why Intelligence isn't in your menu

Intelligence is only linked for organization admin and staff accounts. Signed in as a Power Recruit super admin, the menu shows Home, Search and Console. That is correct going forward — intelligence belongs to an organization, not to Power Recruit. A super admin reaches it by entering an organization instead (below).

## The hierarchy to build

| Level | Can do |
| --- | --- |
| Super Admin | Everything across all organizations, the console; enters an organization to work as its Owner |
| Org Owner | Everything for their organization **including** billing and logo/colors |
| Admin | Same as Owner **minus** billing and logo/colors |
| Coach / Staff | Roster, intelligence (submissions go to the approval queue), no relationship rating, no invites |
| Player | Own family portal and approved intelligence |
| Parent | Same as Player |

## Work

1. **Add the Owner level.** New role value `org_owner` (additive; nothing removed). Power Baseball's current admin becomes Owner; the older admin account stays Admin.
2. **Owner-only surfaces.** Billing fields and Branding settings become Owner-only. Everything else Admin keeps.
3. **One name for the coach level.** Every screen and invite dropdown reads "Coach / Staff", so it can't be confused with Power Recruit staff.
4. **Invite rules.** Owner invites anyone; Admin invites Coach/Staff, Player, Parent; Coach invites nobody.
5. **Organization impersonation for super admins.** From the console's organizations list, "Enter organization" puts the super admin inside that organization as its Owner: the organization's colors and logo apply, the organization menu appears (Dashboard, Intelligence, Roster, Team, Branding), and a persistent bar across the top names the organization with an "Exit" control. Nothing is impersonated silently — everything written while inside is attributed to the real super admin account, and entering/leaving is recorded.
6. **Intelligence stays out of the super admin menu.** It appears only for Owner, Admin and Coach/Staff — and for a super admin while inside an organization.
7. **Verification.** Sign in as each of the five test accounts plus the super admin, and confirm menus and allowed screens match the table.

## Technical notes

- Migration: add `org_owner` to the `user_type` enum; include it in `is_org_manager()` and every RLS policy that lists `org_admin`; allow Owner through `guard_organization_billing()` where billing edits are intended; set Power Baseball's owner row (`users.user_type` + `user_roles`).
- Impersonation is a server-side acting-organization for super admins only, resolved in the account reader and carried per request — never a client-set organization id, and never a change to the signed-in user's own role rows. Existing RLS already grants super admins full access, so no policy is loosened for this.
- Frontend: one role helper (`isOwner` / `isOrgAdmin` / `isOrgManager` / `actingOrgId`) replacing the ad-hoc checks in `AppShell.tsx`, `intelligence.tsx`, `programs.$id.tsx`, `settings.team.tsx`, and the labels in `invites.functions.ts`.
- Reader functions (`*.functions.ts`) gain `org_owner`; no `*.server.ts` file is touched; screens stay read-only apart from the already-approved organization-management and intelligence writes.
