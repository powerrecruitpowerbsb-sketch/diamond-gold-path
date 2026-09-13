# Five sign-in accounts: staff, admin, coach, parent, player

You need working credentials for each view. There are only two accounts on the system today
and no password I can read, so I'll create a clean set, all with the password you gave me.

## The accounts

| Sign-in email | Sees | Role |
| --- | --- | --- |
| staff@powerrecruit.app | The full Power Recruit console: database, collection, review queues, organizations | Power staff |
| admin@powerbaseball.app | Power Baseball's side: dashboard, roster, intelligence workstation with the approval queue, invites, branding | Organization admin |
| coach@powerbaseball.app | Same organization, coach permissions: writes intelligence that goes to the approval queue, cannot set relationship strength, no billing | Coach |
| parent@powerbaseball.app | The family portal for one player: shortlist, school and program pages, the family-visible intelligence only | Parent |
| player@powerbaseball.app | The same player's own view | Player |

All four organization accounts belong to Power Baseball, so you can sign in as the coach,
write something up, sign in as the admin to approve it, then sign in as the parent to check
exactly what a family sees — and confirm the staff-only material stays hidden.

Password for all five: **Power1234!**

The existing accounts are left alone: your Gmail account keeps its staff access, and the old
test account stays as it is.

## One test player

Power Baseball currently has no players on file, so the parent and player accounts would
have nothing to look at. I'll add one test athlete — "Test Player", graduating 2027,
shortstop — and link both the parent and the player account to him. Nothing else in the
organization changes.

## Technical notes

- Accounts created through the Auth admin API with email already confirmed, so there is no
  confirmation link to click.
- Each gets a `public.users` profile row with the right `user_type` and Power Baseball's
  organization id, plus a `user_roles` row (`superadmin`, `org_admin`, `org_staff`,
  `parent`, `player`) — roles stay in the separate roles table, never on the profile.
- One `org_athletes` row for the test player; the parent linked through
  `athlete_family_links`, the player through `users.linked_org_athlete_id`.
- No schema change; no existing row is modified.
- I'll sign in as each of the five in a browser and confirm where each one lands and that
  the parent sees no staff-only intelligence.
