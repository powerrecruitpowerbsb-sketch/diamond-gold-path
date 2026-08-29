# Create the real superadmin account

Right now the only account in the system is the temporary test account `superadmin@powerrecruit.test`. There is no account for `powerrecruit.powerbsb@gmail.com` yet.

## What I'll do

1. Create the account `powerrecruit.powerbsb@gmail.com` with the password you gave, already email-confirmed so you can sign in immediately with no confirmation email.
2. Give it full superadmin access: profile record with type `superadmin`, no organization scope, plus the authoritative superadmin role row.
3. Verify by signing in through the app and loading the admin console, confirming the console and its screens render for this account.

## Password note

The password will work as given. Since it was shared in chat, I recommend changing it from the reset-password flow after the first sign-in.

## Housekeeping question handled by default

I'll leave the existing test account in place but strip its superadmin role so only your real account has full access. Tell me if you'd rather keep or fully delete it.

## Technical details

- Create the auth user via the admin API with `email_confirm: true`; the signup trigger will create the `public.users` row (defaults to `player` with no invite code).
- Follow with SQL to set `public.users.user_type = 'superadmin'`, `organization_id = null`, and insert `('superadmin')` into `public.user_roles` for that user id (removing the stray `player` role row).
- Remove the `superadmin` row from `public.user_roles` for `superadmin@powerrecruit.test`.
- No app code changes; RLS and `is_superadmin()` already key off `user_roles`.
