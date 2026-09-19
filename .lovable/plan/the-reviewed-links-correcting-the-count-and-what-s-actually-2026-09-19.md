# The reviewed links: correcting the count, and what's actually at risk

## What I found when I pulled the nine

There are not nine. My earlier count compared full web addresses (`gocardinals.gadsdenstate.edu`) instead of school domains (`gadsdenstate.edu`) — the comparison the fixed check actually makes. Seven of the nine are the school's own athletics section on the school's own domain, so the fixed check still confirms them exactly as before. They were never at risk.

Two remain, and both belong to one record — Irvine Valley College baseball:

| School | Field | Address on the audit record |
| --- | --- | --- |
| Irvine Valley College | Roster page | athletics.imperial.edu/sports/bsb/2025-26/roster |
| Irvine Valley College | Staff page | athletics.imperial.edu/sports/bsb/coaches |

Those addresses belong to Imperial Valley College, a different college. The broken check would have waved them through; the fixed one has no reason to trust them.

Two things make this less alarming than it looks:

- Irvine Valley's baseball record no longer holds either address — both fields are empty, and it has no players stored. The bad addresses were already removed by the earlier wrong-link cleanup.
- Imperial Valley College holds those same two addresses on its own baseball record, where they are correct.

So what's left is two leftover audit rows still reporting "verified" for a school that no longer has those links. Nothing in the product is presenting another college's roster as Irvine Valley's.

## What I'd like to do

1. Clear the two stale audit rows for Irvine Valley baseball, so the audit stops reporting verified links for addresses that aren't on the record. Nothing else is touched.
2. Re-issue the second-look list using the school-domain rule, which brings it from 326 to **275** (131 roster pages, 144 staff pages). Same handling as agreed: the single re-read at the end resolves them, no separate action now.
3. Correct the numbers in the running record so the 9 and the 326 don't get quoted later.

No pages are read for any of this.

## Technical notes

- `link_health` rows are keyed by `(program_id, field)`; the two rows to remove are on program `e328aa62-d8ac-4ee5-9635-ac160a9eb8f4` (Irvine Valley baseball) with `field in ('roster_url','coaching_staff_url')`. Removal via a data statement, not a migration.
- The corrected comparison mirrors `registrableDomain()` in `src/lib/program-ownership.ts` (last two labels, with `co.uk`-style tails kept at three) against `universities.website_url` and `programs.athletic_website` — the two addresses `verifyPageIdentity` now treats as independent proof.
- The refreshed export replaces `/mnt/documents/links-needing-a-second-look.csv` with a v2 file so the earlier one isn't silently overwritten.
