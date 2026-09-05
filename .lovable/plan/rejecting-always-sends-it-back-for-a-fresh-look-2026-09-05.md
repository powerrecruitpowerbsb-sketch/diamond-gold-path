# Rejecting always sends it back for a fresh look

Today rejecting a link just marks it wrong and stops. Nothing goes looking for a replacement, so that school's link stays blank. This changes rejection into "this one is wrong — go find a better one", and clears the backlog of things already rejected.

## What's waiting right now

- 133 links rejected on the link screen — none were ever searched again
- 614 proposed values rejected in the review queue — only re-pulled if the checkbox was ticked at the time

## What changes

1. **Reject a link, and the school goes straight back in line.** The school is queued for a fresh link search immediately, and the URL you just rejected is remembered as a dead end so it can't come back as a suggestion again.
2. **Reject a value in the review queue, and that program is re-read.** The current "queue a fresh pull" checkbox goes away — it always happens. The decline reason box stays.
3. **A one-time catch-up.** A button on the data collection page sends all 133 already-rejected links back for a new search (and any program whose value was declined without a re-pull), so the backlog gets picked up by the background collector without you clicking through them.
4. **Nothing overwrites anything.** New findings still arrive as suggestions on the link screen / review queue exactly as they do now.

Guard so it can't spin: a school gets re-searched a limited number of times (3). After that it's listed as "needs you to paste the link", instead of looping forever.

## Technical notes

- `reviewDiscoveredUrl` (reject branch): after marking `rejected`, reset that school's `url_discovery` row in `ingest_queue` to `pending` with `attempts = 0`.
- `discoverUniversityUrls`: load previously `rejected` `url_discovery_queue` rows for the school and drop any candidate whose normalized URL matches one — applies to both the athletics-site pick and the roster/staff page picks.
- `rejectPendingChanges`: always run the existing requeue branch; drop the `rescrape` input and its checkbox in `admin.review.tsx`.
- New superadmin server fn `requeueRejected()` in `pipeline.functions.ts` + button in the hands-on tools drawer: re-queues `url_discovery` for schools with rejected links, and `program_scrape` for programs with rejected proposals and no pending job.
- Re-search cap: count rejected discovery rows per school/type; at 3+, skip requeue and surface the school in the "What needs you" list.
