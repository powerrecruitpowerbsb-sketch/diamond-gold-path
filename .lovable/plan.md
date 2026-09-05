# Make collection run itself, then simplify what you see

Two problems to fix before adding features: the run needs you to babysit a browser tab, and the admin screens show you the machinery instead of the results. After that, we build out the three product areas you picked.

## Phase 1 — The run keeps going without you

- Collection runs on the server on a schedule (every minute), whether or not any page is open. You press "Start collecting" once and can close the laptop.
- Each scheduled tick does a small, bounded amount of work and stops, so nothing can run away. Work already in flight is picked back up automatically if a tick dies.
- "Stop" still stops it; "Start" resumes exactly where it left off.
- The panel becomes a live read-out (schools searched, teams collected, players read, problems) instead of the thing driving the work.
- If server scheduling can't be turned on for this project, fallback: the same schedule is driven by an always-on background caller, and I'll tell you plainly which one is in use. Either way you don't keep a tab open.

## Phase 2 — One screen, plain language, issues only

Today the pipeline page is a wall of steps, stages, queues and tables. It becomes a single **Data collection** page with three ideas in this order:

```text
1. WHAT WE HAVE      schools · teams · how many are fully collected
2. WHAT NEEDS YOU    only real decisions, grouped, with a count
3. WHAT'S RUNNING    one line of status + start/stop + last activity
```

- **What needs you** is the only place with work in it: schools whose national record couldn't be settled, links the system wasn't sure about, facts that contradict what we already have, rosters that looked wrong. Each item says what's wrong in a sentence and offers the fix.
- Everything healthy and automatic disappears from view — no "stages", no "queue", no "jobs", no raw table names.
- The import steps (membership lists, national database, school websites) stop being buttons you sequence by hand. They become part of one automatic flow, with a rarely-needed "Advanced" drawer for manual re-runs.
- Vocabulary throughout: Schools, Teams, National records, School websites, Rosters. Nothing else.

## Phase 3 — Product build-out (in this order)

**A. Family & athlete experience**
- School search: clearer filters, saved searches, results that read like a school profile rather than a data dump.
- Program page: what a family actually asks — cost, academics, roster makeup, where players come from, who to contact.
- Shortlist: simpler statuses, progress at a glance, notes families can see.
- Family portal: one page per athlete with their list and what staff shared.

**B. Coach & staff daily tools**
- Team page per season: who's on it, jersey numbers, quick add/move between teams.
- Athlete assignment that respects seasons (move players forward, archive graduates).
- Staff notes and shortlist review in the flow of a team, not a separate admin area.

**C. Data quality dashboard**
- Per-school completeness and freshness, with the weakest data surfaced first.
- Spot-check tool: open a school, see each fact, its source link and when it was last verified, and correct it in place.
- Trust badges on program pages driven by that same record.

## Technical notes

- Scheduling: enable `pg_cron` + `pg_net`, store the runner secret in Vault, and schedule a POST to the existing `/api/public/collection-runner` route each minute with small per-tick limits. The route already authenticates the caller, leases work, and honours the stop flag, so no pipeline logic changes.
- The browser-driven loop in `CollectionRunner.tsx` is removed; the component becomes read-only status plus start/stop against `collection_state`.
- Phase 2 replaces `admin.pipeline.tsx` with a composed page (`WhatWeHave`, `NeedsYou`, `RunStatus`) reusing the existing server functions; the manual import controls move into an advanced drawer. `/admin/review`, `/admin/discovery` and `/admin/federal-decisions` get folded in as sections of "What needs you" so there's one destination.
- Phase 3 items are separate passes; nothing in Phase 1 or 2 changes the collected data or the review/trust rules.
