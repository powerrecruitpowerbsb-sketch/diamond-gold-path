# Entering the athletics site should finish the school, not ask again

Today, when you paste a school's athletics site, the system does search that site and does find pages — but it files everything it finds as a *new* question, and it doesn't close out the original "we couldn't find this page" rows for that school. So the same school comes back at you asking for links it already has. With 1,280 of these, that's the whole problem.

## What changes

Pasting the athletics site becomes one decision that finishes that school:

1. The site is saved for every sport the school still offers (as today).
2. The system searches it for the baseball/softball roster page and coaching staff page.
3. Anything found on that same athletics site that clearly matches the sport and page type is **saved straight to the program** — no second question. Because you supplied the site by hand, the site itself is trusted, so a roster page found inside it is trusted too.
4. Every outstanding "couldn't find" row for that school that the search satisfied is closed as answered, and roster reading is queued for those programs.
5. Only genuinely doubtful results stay behind as a question — e.g. a page that could belong to the wrong sport, or a link that leaves the athletics domain.
6. The card then reports plainly what happened, for example: "Saved the athletics site. Baseball roster and staff pages found and saved. Softball staff page still needs a look." and moves to the next school.

Sports at that school that still have nothing found keep their card, so nothing silently disappears.

## Also on the card

- Both sports get their own "No baseball program here" / "No softball program here" control when the school still lists that sport, so you can clear out a sport the school doesn't field while you're already looking at it.
- A short line shows how many schools this pass has cleared, so progress is visible.

## Technical notes

- `src/lib/discovery.server.ts` (`setAthleticsSiteByHand`): after `discoverProgramPages`, run each result through `classifyLink`; results whose verdict is accept **and** whose host matches the entered athletics origin are applied directly — write `roster_url` / `coaching_staff_url` on the program, record provenance in `data_field_sources` with `source_type: 'manual'`, mark the matching `url_discovery_queue` rows `confirmed`, and enqueue the program's roster stage in `ingest_queue`. Only non-accepted or off-domain results are inserted as `pending_review`.
- Close leftover `pending_review` rows for that school whose `discovery_type` + `program_id` were satisfied, so the focused card doesn't re-ask.
- Return a per-sport, per-page-type summary from the server function; render it on the card in `src/routes/_authenticated/admin.discovery.tsx`.
- Add the per-sport not-offered buttons by including the school's sibling programs (id, sport, offering_status) in the discovery listing query.
- Tests: extend the link-quality/discovery tests to cover on-domain auto-apply, off-domain rejection, and wrong-sport results still going to review.
- No migration. Collection, trust rules, coach handling and sponsorship logic are untouched.
