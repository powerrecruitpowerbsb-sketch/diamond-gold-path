# Sport as a first-class setting: baseball / softball

Today only college programs carry a sport. Athletes, teams and your organization don't, so nothing in the app knows whether a player is a baseball or softball player — the sport picker on Search is just a filter on colleges.

This adds sport where it belongs, plus one switch at the top of the app.

## 1. Every athlete is a baseball or softball player

- Each athlete gets a sport. Required when you add one, and offered on CSV import (a column if present, otherwise a single choice applied to the whole file).
- Existing athletes: all current players are set to baseball, since that's what Power Baseball is. Changeable on each athlete.
- Teams stay as they are — a team's sport follows its players, so no second place to keep in sync.

## 2. One switch at the top

- A Baseball / Softball switch sits in the header, next to the organization mark.
- It applies everywhere at once: Roster shows only that sport's players, College list only their schools, Home counts only them, and Search opens pre-set to colleges in that sport.
- The choice is remembered per person, so you come back to where you left off.
- A club with players in only one sport never sees the switch — it appears once a second sport exists. No clutter for single-sport clubs.
- Parents and players don't see a switch at all; their athlete's sport is simply used.

## 3. Color follows the sport, brand stays dominant

- Your uploaded primary and accent colors stay the base of the whole app. Nothing about this pass hardcodes a color.
- The active sport adds a tint used in a few precise places: the sport switch itself, the page header rule, and the active sport chip on Search. Baseball leans to your primary, softball to a derived companion tone of it — both computed from your own colors, so a club that uploads blue and white gets blue-and-white variants automatically.
- Green still means Verified Data and red still means Our Intelligence. Neither is ever used for sport.

## 4. Where a sport is shown

- Athlete rows and athlete pages show their sport as a small tag.
- College list keeps its Sport column (a baseball player can only have baseball programs saved, so this becomes a confirmation rather than a filter).
- Adding a school from Search to a player's list checks the sports match, and says so plainly if they don't, rather than saving a mismatch.

## Technical notes

- Migration (additive, no data loss): `org_athletes.sport` on the existing `sport` enum, `NOT NULL DEFAULT 'baseball'` so current rows backfill to baseball; index on `(organization_id, sport)`. No change to `teams`, `seasons`, `organizations`, or `athlete_saved_schools`. Existing RLS unchanged.
- Sport in the UI: a `useSportMode()` hook backed by `localStorage` per user plus a URL param on screens that already carry search params (`search`, `list`), so a shared link keeps the sport. The header control lives in `AppShell` and hides when the org has athletes in only one sport (one cheap count read).
- Server reads gain an optional `sport` argument, applied as a filter: `listAthletes` / roster reads, `getCollegeList`, dashboard counts. `searchPrograms` already accepts `sport` — the switch just sets its default. No new server functions.
- Colors: `OrgTheme` emits two more derived tokens, `--sport-tint` and `--sport-line`, from the existing `--org-primary` via `color-mix` in oklab with a different hue rotation per sport. No literal hex in any component; `styles.css` maps them through `@theme inline`.
- Save-mismatch guard in `ShortlistSaveButton` / Search rows: compare the selected athlete's sport to the program's sport before the upsert.
- Superadmin console is untouched — fixed identity, and it works across all organizations and both sports.
