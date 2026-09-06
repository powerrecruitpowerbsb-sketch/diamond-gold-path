# Yes — with two clean-ups first, then the run in waves

The safety work from the pre-flight list is now done and checked against live data:

- The random accuracy check works: 12 checks recorded, all 12 agreed with the school's own page.
- Coach rules are tested against three real staff pages (UCF, Texas Tech, Cincinnati's archived page, which is correctly refused).
- UCF's coach is set to Rich Wallace by hand, with the official page recorded as the source.
- Wrong-school link contamination was cleared (209 links across 58 teams) and those teams are back in line.
- The heartbeat check runs every five minutes and frees stuck work, retries temporary failures, and restarts a run that has gone quiet. No jobs are stuck or failed right now.
- The waiting pile is down to 24 real fact decisions and 152 real link decisions.

So: yes, ready to turn coach writing on and start the nationwide run — after two small clean-ups so the queue does not immediately refill with noise.

## Step 1 — Clear the two piles of noise (before the run)

- 1,054 waiting link rows have no link at all: they are failed searches, not decisions. Retire them and put those teams back in line for a fresh search instead of leaving them in your review list.
- 24 fact decisions and 152 look-alike-domain link decisions stay for you; they are genuinely ambiguous. I'll leave them alone.

## Step 2 — Turn on coach writing, guarded

Coach names get written automatically only when all of these hold, otherwise the item comes to you:

- the page is on the school's own site (or its athletics site), proven by name and address
- the page is for that sport specifically
- the page states the person is head coach in plain words
- the name looks like a person's name and isn't a placeholder
- a blank never replaces a stored name
- every write records the page it came from, and can be undone from "Report a mistake"

## Step 3 — Confirm the 215 unknown sponsorships

Finish deciding which of the 215 unconfirmed teams actually field the sport, so the run never spends effort on teams that don't exist.

## Step 4 — Run in waves, with a hand check between the first two

Order: D1 → D2 → D3 → NAIA → NJCAA → CCCAA → NWAC.

After the D1 wave, stop and I'll spot-check 20 teams by hand (coach name and roster against the school's own page) and report exactly what agreed and what didn't. Only then do the remaining waves go.

Target for "done" per team: sport confirmed, official roster and staff pages recorded, a current 2026-27 roster stored, and a head coach proven from the school's own page — for at least 95% of the 3,115 confirmed teams, with the exceptions named.

## What you'll watch while it runs

The progress board shows last activity, whether the run stopped unexpectedly, how many teams are complete, and the weekly accuracy score. You can navigate away; the run continues on its own.

## Technical notes

- Retire no-URL `url_discovery_queue` rows (`status='pending_review'`, `discovered_url is null`) as `rejected` with a reason, then `enqueueGapWork` for those programs' `url_discovery` stage.
- Enable coach auto-apply only where `coachEvidenceVerdict` returns the proven verdict; `flagged`/`rejected` continue to route to `needs_review`/`no_change`. Keep `tmpscripts/coach-audit.ts --apply` unused.
- Sponsorship: `runSponsorshipCheck` rounds over the 215 `unverified` programs; conflicts surface in the pipeline UI.
- Waves: drive `ingest_queue` (1,101 pending) by governing body/division through the existing collection runner; watchdog cron already covers stalls.
- Record every coach write in `data_field_sources` plus `audit_log`; keep `rejected_values` memory in force so cleared bad names can't return.
