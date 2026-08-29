# Email invites for families and staff

Today no parent, player, or staff account can be invited by email: the only signup path is a shared org invite code that always creates an `org_admin`. This adds one email-invite flow used for both families and staff, and makes family invites automatic when staff bulk-upload athletes.

Emails will go out from Lovable's default sender for now (unbranded). When you set up your own domain later, the same invites become branded with no rework.


## 1. Invite a parent from an athlete's page

On each athlete's detail page, a "Family access" panel:

- Enter a parent's email and send an invite.
- The invite email links to a set-password screen; the new account gets the `parent` role, is joined to your organization, and is linked to that athlete.
- Panel shows current state per invited email: Invited (with sent date), Accepted, or Expired — with resend and revoke.
- An athlete can have more than one family contact (e.g. both parents).

## 2. Automatic invites on bulk upload

The CSV importer gains an optional **Parent email** column in the mapping step.

- The preview shows, per row, whether an invite will be sent, skipped (no email), or skipped (already invited/registered).
- On confirm, athletes are created as today and one invite is sent per new parent email — automatically, no extra step.
- A summary after import: athletes created/updated, invites sent, invites skipped and why.
- Duplicate rows and re-imports never re-send to an address already invited or registered.

## 3. What a parent sees after accepting

Parents land on the existing family portal, scoped to their linked athlete(s):

- The athlete's shortlist grouped by status.
- Only staff notes marked "Visible to parent".
- Read-only access to the shared college database, search, and program profiles — no roster-wide, org-wide, or staff-intelligence access.

## 4. Player accounts

Same mechanism, kept explicit: the invite panel lets staff choose whether the address is a **Parent** or the **Player**, so an older athlete can have their own login with the same athlete-scoped view.

## 5. Staff invites — same path, same UI

A "Team members" panel on the organization settings screen, using the exact same invite component and email flow, just without an athlete attached:

- `org_admin` enters an email and picks **Admin** or **Staff**, then sends the invite.
- Same states per row: Invited (sent date), Accepted, Expired — with resend and revoke.
- Existing members are listed alongside pending invites, with their role.
- Only `org_admin` can invite or revoke staff; `org_staff` can invite families but not other staff. Nobody can invite a superadmin from this screen.
- Superadmins get the same panel per organization inside the admin console, so Power Recruit staff can seat a new club's first admin.

## Technical notes

- One `org_member_invites` table serves both flows: organization_id, email, invited_role (`org_admin` | `org_staff` | `parent` | `player`), org_athlete_id (null for staff), status, invited_by, accepted_user_id, timestamps; unique on (organization_id, lower(email), coalesce(org_athlete_id, ...)). GRANTs plus org-scoped RLS for staff, superadmin full access, no anon. `superadmin` is rejected by a check constraint.
- New `athlete_family_links` table (many-to-many athlete ↔ user) so multiple guardians can be linked; replaces sole reliance on `org_athletes.linked_parent_user_id`, which stays populated for the first parent for backward compatibility.
- Sending uses the Auth Admin invite API from one `sendOrgInvite` server function that verifies the caller's role server-side: `org_admin` for staff invites, `org_admin`/`org_staff` for family invites, plus organization match. Role assignment and athlete linking happen in trusted server code on acceptance — never from client metadata, so no self-granted roles.
- One shared `InvitePanel` component and one `sendOrgInvite` function back the athlete page, the settings screen, and the CSV import path, mirroring the existing single-`upsertAthlete` pattern.
- CSV import calls it per new parent email inside the existing import server function, collecting per-row outcomes for the summary; a failed invite never aborts the athlete import.
- Acceptance handled on the existing public reset/set-password route, extended to complete the invite (consume the row, grant role, link athlete when present) before redirecting by role.

- Family reads go through new athlete-scoped server functions with `requireSupabaseAuth`; RLS policies allow a parent/player to read only athletes linked to them and only notes with `visible_to_parent = true`.
