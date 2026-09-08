# Make step 1 finish in under an hour instead of overnight

## Why it is crawling

Three separate things are holding it back, and only the first was fixed so far.

1. **Each page was fetched one after another.** A batch does 12 pages, waiting for each site to answer before starting the next. Sites answer in 2–8 seconds, so a batch spends almost all its time waiting on one page at a time. There are about 5,990 stored pages to check (3,003 roster pages, 2,984 staff pages, across 3,017 teams) and 154 are done. At the current pace that is most of a night.

2. **The unattended helper cannot get in yet.** The minute-by-minute helper now calls your live address, but the live address is still running the older code, so it answers "not allowed". Until you press Publish once, the only progress is what happens while you sit on the page with it open — which is exactly what you have been seeing.

3. **Nothing is banked as "already proven".** Progress is kept as a position in the list, so a restart resumes correctly, but a page that was proven correct is not remembered. Any future sweep pays for all 5,990 pages again.

On money: each page read costs one page credit, once. Checking pages side by side does not cost more than checking them one at a time — it is the same 5,990 reads, finished in a fraction of the time. The only genuine waste so far is pages retried after a timeout, which the 25-second cut-off now stops.

## The fix

1. **Check pages side by side.** Each batch reads 10 pages at once instead of 1, and does 120 pages per batch instead of 12. Same reads, same cost, roughly ten times the pace: about 120 pages a minute, so the whole 5,990 finishes in under an hour once running unattended.

2. **Remember what has been proven.** When a page proves whose team it is, stamp the team as checked with the date. Future sweeps skip anything proven in the last few months, so a re-run costs almost nothing and only looks at what changed.

3. **Publish once.** That puts the current code on the live address the helper calls, and step 1 then runs on its own — you can close the page.

4. **Show a real pace and finish time.** Step 1 displays pages per minute and an estimated finish, so you can see it moving rather than guessing.

## What you will see

Press "Check the pages" once, press Publish once, then leave it. The count climbs by roughly a hundred a minute with a visible finish time, and it switches itself off and marks step 1 done at the end. Wrong-school and non-varsity pages keep being cleared and re-searched automatically; only genuinely unclear pages come to you.

## Technical notes

- `auditStoredLinks` in `src/lib/link-audit.server.ts`: replace the sequential per-program loop with a bounded-concurrency map (10 in flight) over the page URLs, keeping the existing per-URL cache so shared staff pages are still fetched once. Verdict handling and clearing rules are unchanged.
- Raise the runner slice to `limit: 120`, `budgetMs: 45_000` in `src/routes/api/public/collection-runner.ts`, comfortably inside the 55-second request wait.
- Add a `links_verified_at` timestamp on `programs`, set when both stored pages are confirmed; the audit query skips programs verified within 120 days. Keeps re-runs cheap.
- `src/lib/build-stages.server.ts`: keep pace (checked per minute since `started_at`) and expose it plus remaining count for the step 1 card in `src/routes/_authenticated/admin.build.tsx`.
- No change to what counts as a wrong page, and coach filling stays held back as it is.
