# The two lists from the page check, and what to do with them

Step 1 finished: 5,474 stored team pages read, 166 found to be the wrong school or a non-varsity team, 427 that could not be read.

## The 166 wrong pages

These are already fully handled by the system: each wrong link was removed from the team, remembered as declined so it can never come back, and the team was sent back to search for the right page inside its own athletics site. Nothing needs deciding by hand.

I will still hand you the list so you can see what was thrown out:

- `/mnt/documents/wrong-pages-cleared.csv` — school, sport, which page (roster or staff), the URL removed, and the reason (for example "this page belongs to Penn State, not this school").

## The 427 that could not be read

These were never written down anywhere — only counted — so there is no list to hand over yet. Most of them are very likely temporary: a slow site, a timeout, or a page that blocks automated reading. A page that fails once often reads fine the second time.

Plan:

1. Record failures from now on. Add a small unreadable-pages table so every failed read is stored with school, sport, page, URL, error and time, instead of only being counted.
2. Re-read those pages once, unattended, using the same helper that ran Step 1. Anything that reads fine is checked normally (kept or cleared like any other page) and drops off the list.
3. Split what is left into two groups and export them:
   - `/mnt/documents/unreadable-pages.csv` — pages that still cannot be read after the retry, with the reason. These are the only ones needing a human look, and most will be "site blocks readers" rather than a bad link.
   - Pages whose site is gone entirely get their link cleared and the team sent back to search, same as any wrong page.
4. Show the count on the build screen next to Step 1 so this never becomes an invisible number again.

Only pages that stay unreadable after the retry come to you, and that list is expected to be small.

## After that

Step 1 is then genuinely complete and Step 2 (finish rosters) can start. Coach filling stays off until its self-check passes, as before.

## Technical notes

- Cleared pages export: `rejected_values` rows created during the sweep window, joined to `programs`/`universities`.
- New table `unreadable_pages` (program_id, field, url, error, first_seen_at, last_seen_at, resolved_at) with superadmin read plus service-role write, following the existing grant-then-RLS pattern.
- `auditStoredLinks` in `src/lib/link-audit.server.ts` records `verdict: "failed"` rows into that table when `apply` is true; verdict logic itself is unchanged.
- A retry mode walks `unreadable_pages` where `resolved_at is null` instead of walking programs, reusing the same fetch/identity path, driven by the existing every-minute runner in `src/routes/api/public/collection-runner.ts`.
