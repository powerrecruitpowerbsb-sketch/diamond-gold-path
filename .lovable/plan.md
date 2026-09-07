# Where things stand, and what you do next

## Right now, in plain terms

The collection run is going by itself. It is working through NCAA Division III at the
moment, has 388 teams waiting, 5 in progress, 233 parked for later levels, and nothing
failed. You do not need to keep a page open, and you do not need to click anything for
it to keep going.

What is already solid:
- 1,885 schools, checked against the federal school database.
- 3,115 teams confirmed to actually play baseball or softball; 210 still undecided.
- Rosters for most teams (spring-sport pages that still show 2025-26 are fine for now).
- Coach names are now only saved when the team's own page says in writing that the
  person is the head coach. Four real school pages are locked in as tests so that
  cannot silently break again.

What is still missing:
- 2,192 confirmed teams have no head coach saved.
- 566 confirmed teams are missing an official roster page or staff page.
- 938 found links and 14 data points are waiting on a yes/no from a person.
- 210 teams where we still cannot tell whether the sport is played.

## What you should be doing: nothing but one decision

Your only job right now is to approve the coach pilot below. Everything else is either
running or waiting on that.

## Step 1 - Coach pilot, 25 teams, hand-checked (needs your OK)

Fill in head coaches for 25 confirmed teams using the new proof rule, then show you all
25 side by side with the page each name came from. You spot-check them. If all 25 are
right, we turn coach filling on for the whole country. If even one is wrong, we stop and
fix the rule instead.

## Step 2 - Let the run finish the levels

Nothing for you to do. D3, then NAIA, NJCAA, CCCAA, NWAC. As it goes it also fills in the
566 missing official pages.

## Step 3 - Clear the 952 waiting decisions, mostly without you

Sort the 938 links and 14 data points into three piles automatically: clearly right,
clearly wrong, and genuinely unclear. Only the unclear pile reaches you, and it gets
grouped by school so you decide once per school rather than once per link.

## Step 4 - The 210 undecided sports

Re-run the sport check on those with the newer evidence rules, then hand you whatever is
left as a short list with a yes/no button per team.

## Step 5 - Keep it honest

Weekly random accuracy check, twice-yearly roster refresh, and a 2026-27 roster sweep in
January-March when schools publish their spring pages.

## Technical notes

- Coach writes stay off until the pilot in Step 1 passes review; `coach-audit --apply`
  and broad coach sweeps remain prohibited until then.
- Pilot runs through the existing ingest path so `coachEvidenceVerdict` gates every write,
  with provenance rows in `data_field_sources` and reversible updates.
- Step 3 reuses the existing link classifiers and bulk decision endpoints; no new schema.
- Step 4 reuses `syncSponsorshipBatch` with `recheck: true`.
