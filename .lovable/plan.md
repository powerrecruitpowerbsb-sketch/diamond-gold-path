# Three sign-in accounts: staff, organization admin, coach

You need working credentials for each of the three views. There are only two accounts on
the system today and no password I can read, so I'll create a clean set with passwords you
choose (or ones I generate and hand to you).

## The accounts

| Sign-in email | Sees | Role |
| --- | --- | --- |
| staff@powerrecruit.app | The full Power Recruit console: database, collection, review queues, organizations | Power staff (superadmin) |
| admin@powerbaseball.app | Power Baseball's own side: dashboard, roster, intelligence workstation with the approval queue, team invites, branding | Organization admin |
| coach@powerbaseball.app | The same organization, coach permissions: writes intelligence that goes to the approval queue, cannot set relationship strength, no billing | Coach |

Both organization accounts belong to Power Baseball, so you can sign in as the coach, write
something up, sign in as the admin and approve it — the whole loop.

The existing accounts are left alone: your Gmail account keeps its staff access, and the
old test account stays as it is.

## Password

All three accounts get the password you gave me: **Power1234!**

I'll confirm each of the three signs in before telling you it's ready.


## Technical notes

- Accounts are created through the Auth admin API with email confirmation already done, so
  there's no confirmation email to click.
- Each gets a matching profile row (`public.users`) with the right `user_type` and Power
  Baseball's organization id, plus a `user_roles` row (`superadmin`, `org_admin`,
  `org_staff`) — roles stay in the separate roles table, never on the profile.
- No schema change; no existing row is modified.
- I'll verify each login in a browser and confirm what each one lands on: staff to the
  console, admin and coach to their dashboard with Intelligence in the nav.
