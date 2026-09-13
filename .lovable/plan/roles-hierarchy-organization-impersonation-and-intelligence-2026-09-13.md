# Roles hierarchy, organization impersonation, and Intelligence visibility

## Why admin@powerbaseball.app can't see Intelligence

The live (published) site is running an older version of the app — the Intelligence page doesn't exist there yet (the address returns "not found"). Intelligence was built after the last publish, so it only exists in the preview. Publishing the app makes it appear for that account. No code change is needed for this part.

Separately, a Power Recruit super admin account never sees Intelligence in the menu, which matches how you want it (below).

## Answering the question: staff vs coach

There is no difference. Today there are only two staff levels on file:

- **Admin** (`org_admin`) — everything for the organization, including billing fields and logo/colors.
- **Staff** (`org_staff`) — this *is* the coach level. "Coach" in conversation, "Staff" on the invite screen. Same permissions, two names — that inconsistency is the whole difference.

There is currently **no separate Owner level**; whoever creates the organization is just an admin.

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

1. **Publish** so the current app — including Intelligence — is live for the Power Baseball accounts.
2. **Add the Owner level.** New role value `org_owner` (additive; nothing removed). Power Baseball's current admin becomes Owner; the older admin account stays Admin.
3. **Owner-only surfaces.** Billing fields and Branding settings become Owner-only. Everything else Admin keeps.
4. **One name for the coach level.** Every screen and invite dropdown reads "Coach / Staff", so it is never confused with Power Recruit staff.
5. **Invite rules.** Owner invites anyone; Admin invites Coach/Staff, Player, Parent; Coach invites nobody.
6. **Organization impersonation for super admins.** From the console's organizations list, "Enter organization" puts the super admin inside that organization as its Owner: the organization's colors and logo apply, the organization menu appears (Dashboard, Intelligence, Roster, Team, Branding), and a bar across the top names the organization with an "Exit" control. Nothing happens silently — anything written while inside is attributed to the real super admin account, and entering and leaving are recorded.
7. **Intelligence stays out of the plain super admin menu** — it belongs to an organization. It shows for Owner, Admin, Coach/Staff, and for a super admin while inside an organization.
8. **Verification.** Sign in as each of the five test accounts plus the super admin and confirm the menus and allowed screens match the table.

## Technical notes

- Migration: add `org_owner` to the `user_type` enum; include it in `is_org_manager()` and every RLS policy listing `org_admin`; allow Owner through `guard_organization_billing()` where billing edits are intended; set Power Baseball's owner row (`users.user_type` + `user_roles`).
- Impersonation is a server-resolved acting organization for super admins only, carried per request — never a client-supplied organization id, and never a change to the signed-in user's own role rows. Existing RLS already grants super admins full access, so no policy is loosened.
- Frontend: one role helper (`isOwner` / `isOrgAdmin` / `isOrgManager` / `actingOrgId`) replacing the ad-hoc checks in `AppShell.tsx`, `intelligence.tsx`, `programs.$id.tsx`, `settings.team.tsx`, and the labels in `invites.functions.ts`.
- Reader functions (`*.functions.ts`) gain `org_owner`; no `*.server.ts` file is touched; screens stay read-only apart from the already-approved organization-management and intelligence writes.
