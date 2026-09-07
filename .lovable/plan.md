# Where things stand, and what you do next

## Right now, in plain terms

The collection run is going by itself. It is working through NCAA Division III, has
388 teams waiting, 5 in progress, 233 parked for later levels, and nothing failed. You do
not need to keep a page open for it to keep going.

Already solid:
- 1,885 schools, checked against the federal school database.
- 3,115 teams confirmed to actually play baseball or softball; 210 still undecided.
- Rosters for most teams (a page still showing 2025-26 is fine for a spring sport).
- Coach names are only saved when the team's own page says in writing that the person is
  the head coach, with four real school pages locked in as tests.

Still missing:
- 2,192 confirmed teams with no head coach saved.
- 566 confirmed teams missing an official roster page or staff page.
- 938 found links and 14 data points waiting on a person.
- 210 teams where we still cannot tell whether the sport is played.

## Your only job right now

Approve this plan. Then the only hands-on thing is spot-checking 25 coach names in Step 2.

## Step 1 - Fix the "athletics site" links that point at one sport

You are right, and it is a big chunk of the queue. Of 240 athletics-site links waiting,
most are not the athletics home page at all: `sewaneetigers.com/sports/sball/index`,
`calvinknights.com/sports/msoc`, `mutigers.com/sports/cross-country`, plus news
categories, tag pages, blog posts and even a campus bookstore.

Fix, applied to the waiting ones and to every future pull:
- When the address is on a genuine athletics site but the path is a single sport or an
  inside section, trim it back to that site's home page and use that. A tennis page still
  proves the athletics site — just not as the address to keep.
- Where the path names baseball or softball, keep it as that team's page too, not only as
  the athletics site.
- Reject outright: news/tag/blog/category pages, stores, job listings, and unrelated hosts.
- Only genuinely unclear ones reach you, grouped by school.

Expected effect: the 240 athletics-site decisions drop to a small handful, and this stops
refilling.

## Step 2 - Coach pilot, 25 teams, hand-checked

Fill head coaches for 25 confirmed teams under the new proof rule, then show you all 25
side by side with the page each name came from. If all 25 are right, coach filling turns on
nationwide. If even one is wrong, we stop and fix the rule instead.

## Step 3 - Let the run finish the levels

Nothing for you to do. D3, then NAIA, NJCAA, CCCAA, NWAC — filling in the 566 missing
official pages as it goes.

## Step 4 - Clear the rest of the waiting decisions

Sort what is left into clearly right, clearly wrong, and genuinely unclear, and only show
you the unclear pile, one card per school.

## Step 5 - The 210 undecided sports

Re-run the sport check with the newer evidence rules, then hand you a short yes/no list for
whatever is left.

## Step 6 - Keep it honest

Weekly random accuracy check, twice-yearly roster refresh, and a 2026-27 roster sweep in
January-March when schools publish spring pages.

## Technical notes

- Step 1 lives in `src/lib/link-quality.ts` (new `athleticsHomeFor(url)` normalisation plus
  reject codes for news/store/jobs paths), consumed by `classifyLink`, so discovery
  (`src/lib/discovery.server.ts`), the link sweep and the review screen all agree. Then a
  bounded re-sweep of pending `athletic_website` rows rewrites or rejects in place; no
  schema change.
- Coach writes stay off until the Step 2 pilot passes review; `coach-audit --apply` and
  broad coach sweeps remain prohibited until then.
- Pilot runs through the existing ingest path so `coachEvidenceVerdict` gates every write,
  with `data_field_sources` provenance and reversible updates.
- Step 5 reuses `syncSponsorshipBatch` with `recheck: true`.
