# Make Intelligence reachable for Power Recruit staff

## What's happening

The Intelligence link is only added to the menu for Power Baseball's admin and coach accounts. When you're signed in as a Power Recruit staff account (`staff@powerrecruit.app` or your Gmail account), the menu shows Home, Search and Console — and no Intelligence, even though the Intelligence screen itself does allow staff in.

So the screen isn't missing, just unlinked for the account you're using.

## The fix

1. Add "Intelligence" to the main menu for Power Recruit staff accounts as well, so it sits next to Console.
2. Add an "Intelligence" entry inside the console's own left sidebar, so it's reachable while you're working in the console.
3. Leave the Power Baseball admin and coach menus exactly as they are (Intelligence already shows there).

Nothing else changes: no new screens, no data or permission changes, reading only.

## How to check it

Sign in as `staff@powerrecruit.app` — Intelligence appears in the menu and opens the workstation. Sign in as `admin@powerbaseball.app` — unchanged.

## Technical notes

- `src/components/brand/AppShell.tsx`: include the `/intelligence` nav item when `isStaff` is true, not only for `isOrgManager`.
- Console sidebar (`ConsoleShell`): add a link to `/intelligence`.
- No changes to any `*.server.ts` file, no schema or migration work.
