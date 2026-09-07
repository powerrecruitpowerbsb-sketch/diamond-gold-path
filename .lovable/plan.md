# Add both sports to the "no program" choice

Right now the school card in "Couldn't find these pages" only offers to mark the one sport that row is about — so if you're looking at a softball page and you can see the school has no baseball either, there's no way to say so.

## What changes

On the one-at-a-time school card, show a separate control for each sport the school still has listed:

- "No baseball program here"
- "No softball program here"

Each button appears only when that sport is currently listed as offered at the school, and disappears once you use it. Both keep the same confirmation step and the same behaviour as today: the sport is kept on record as not offered (reversible), its leftover searches are closed, and it stops showing up in searching, rosters and queues.

If the school has no sport left listed, neither button shows.

## Technical notes

- `src/lib/discovery.server.ts`: the discovery listing query already joins `programs`; add the school's sibling programs (id, sport, offering_status) per row so the card knows which sports are still offered.
- `src/routes/_authenticated/admin.discovery.tsx`: replace the single sport button with a loop over the school's offered programs, each calling the existing `markSportNotOffered` server function with that program's id.
- Keep the whole-list view unchanged apart from reusing the same per-sport buttons where a program is attached.
- No migration, no change to collection, trust rules, coach handling or write paths.
