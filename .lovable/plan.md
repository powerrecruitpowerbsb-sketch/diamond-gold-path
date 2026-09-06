# Only chase schools that actually have baseball or softball

## What's happening today

Right now the system only *knows* a sport exists when the source list was sport-specific. That was true for the NCAA lists (1,914 programs marked "verified"), but for NAIA, NJCAA, CCCAA and NWAC the lists only proved membership, so a baseball **and** a softball slot was created for every member school as a guess — 1,690 slots that are still "unverified".

Those guesses are what fills your review screens: 1,178 of the 1,677 links waiting for you belong to a sport slot nobody has confirmed exists. When a school doesn't field the sport, there is no team page to find, so the search settles for the school's own homepage — which is exactly the "athletics buried inside the school site" pattern you're seeing.

## The fix: use the federal athletics filing

Every college that gives athletic aid files a federal report listing each varsity sport it sponsors and how many athletes played. It is keyed to the same federal school ID we already store for 1,826 of 1,885 schools, and it plainly states whether baseball and softball exist. Confirmed working: for a sample school it returns "Baseball 39 men" and "Softball 27 women".

That covers 1,600 of the 1,690 unconfirmed slots with a definitive yes or no.

1. Pull the sponsorship list for every school with a federal ID.
2. Sport listed with participants → mark the slot **offered** (confirmed).
3. Sport absent or blank → mark it **not offered**, and clear its waiting links and proposed facts out of your queues.
4. Store the filing year and participant count as the evidence, visible on the school page.

## The leftovers (about 90 schools, plus any the filing skips)

For slots with no federal filing, decide from evidence already collected instead of leaving them to guess forever:

- A roster page that produced a believable squad → offered.
- Repeated searches that only ever surface the school homepage or a wrong-sport page, with retries exhausted → flagged **likely not offered** and set aside, never marked automatically.
- A short "Undecided sports" list on the pipeline screen, so you can settle these a handful at a time instead of one link at a time.

## Athletics sites hidden inside the school website

Two changes so this stops producing homepage guesses:

- A bare school homepage is never accepted as an athletics site. When that's the best hit, the search takes one more step: read the homepage, follow an Athletics / Sports / Student Life link, and only keep the page that actually shows teams.
- If the sport slot is not offered, no search runs at all — the largest source of these homepage links disappears on its own.

## What you'll see afterwards

- Roughly two thirds of the waiting links vanish because they belong to sports that don't exist.
- School pages show baseball/softball as confirmed offered or not offered, with the federal filing and participant count as proof.
- Family search already only shows confirmed programs, so the public side gets more accurate immediately.
- Yearly refresh picks up the new filing, so a school that adds or drops a sport is caught automatically.

## Technical notes

- New `src/lib/sport-sponsorship.server.ts`: fetch `ope.ed.gov/athletics/api/institution/{unitid}`, parse the Participants table rows for Baseball / Softball, return `{ offered, participants, year }`. Bounded parallel workers with the same pacing/retry pattern as `federal-data.server.ts`.
- Migration: add `offering_source`, `offering_evidence` (jsonb: participants, filing year, source url) and `offering_verified_at` to `programs`; keep the existing `program_offering_status` enum values.
- On `not_offered`: reject open `url_discovery_queue` rows and `pending_data_changes` rows for that program with a "sport not sponsored" reason, and skip it in `ingest-queue.server.ts` (already skips `not_offered`) and in the collection pass.
- `discovery.server.ts` / `link-quality.ts`: treat a school-domain homepage as non-acceptable for `athletic_website`; add a one-hop follow that fetches the homepage and scores links whose text matches Athletics/Sports/Teams before proposing a URL.
- Pipeline screen: sponsorship sync panel (counts offered / not offered / undecided, run button) plus the short undecided list with offered / not-offered buttons.
