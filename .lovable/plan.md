# The two lists from the page check, and what to do with them

Step 1 finished: 5,474 stored team pages read, 166 found to be the wrong school or a non-varsity team, 427 that could not be read.

## The 166 wrong pages

These are already fully handled by the system: each wrong link was removed from the team, remembered as declined so it can never come back, and the team was sent back to search for the right page inside its own athletics site. Nothing needs deciding by hand.

I will still hand you the list so you can see what was thrown out:

- `/mnt/documents/wrong-pages-cleared.csv` — school, sport, which page (roster or staff), the URL removed, and the reason (for example "this page belongs to Penn State, not this school").

## The 427 that could not be read

These were only counted, never written down, so there is no list yet — and that does mean one more read-through of the stored pages to find out which ones they were. It is a much lighter pass than the first run: it only tries to open each page, and does the fuller school-name check on the ones that now open.

Plan:

1. Record failures from now on. Add a small unreadable-pages table so every failed read is stored with school, sport, page, URL, error and time, instead of only being counted. This is the last time a re-read is needed to answer this question.
2. Run one open-only pass over the stored pages, unattended on the existing every-minute helper. A page that opens is checked normally (kept or cleared like any other page); a page that fails is written to the new table.
3. Then export what is left:
   - `/mnt/documents/unreadable-pages.csv` — pages that still cannot be read, with the reason. These are the only ones needing a human look, and most will be "the site blocks automated readers" rather than a bad link.
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
