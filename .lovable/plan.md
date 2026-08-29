# Seasons, Teams, and Coach Assignments

Adds a season/team layer to the organization roster so Power Baseball can run 2026, 2027, and beyond without losing history — while an athlete's own record, shortlist, and notes follow them the whole time they're in the program.

## The model in plain terms

- A **season** belongs to the organization (e.g. "2026"), and exactly one season is the **active** season at a time. Past seasons can be marked archived.
- **Teams are created inside a season** (e.g. "16U Black — 2026"). Next season you create that season's teams — the rollover wizard copies them for you so you're not typing them again.
- An **athlete** exists once for the organization. Each season they get a **team assignment**. Moving to a new team next season is a new assignment, not a new player.
- **Coaches** are assigned to specific teams. By default a coach only sees athletes on their teams in the active season. An admin can flip a per-coach "org-wide access" switch for someone who needs to see everybody.
- **Admins see all teams and all seasons**, always.
- **Archiving a season** only freezes that season's team assignments. The athlete, their shortlist, and their notes stay live and follow them from season to season until they graduate out of the program. Graduated/departed athletes are marked inactive at the athlete level, not by season.

## The flow

**Setup (once)**
1. Admin opens Settings → Seasons, creates "2026", marks it active.
2. Admin creates teams for 2026 (name, age group, optional head coach).
3. Admin assigns each athlete to a 2026 team, and assigns coaches to teams.

**Day to day**
- A season/team picker sits in the roster and dashboard headers. Coaches see only their teams; admins get an "All teams" option.
- Roster, dashboard aggregates, and the athlete pipeline all filter by the selected season and team.
- An athlete's detail page shows a small season history strip: 2026 — 16U Black, 2027 — 17U Gold.

**Season rollover wizard** (Settings → Seasons → "Start new season")
1. Pick the season to roll from and name the new one.
2. Teams from the prior season are listed pre-checked; uncheck any that are folding, rename or add teams.
3. Each prior-season athlete is listed with a target team dropdown (defaulted to the same team name where it exists), plus options: move to another team, leave unassigned, or mark graduated/departed.
4. Coach assignments carry forward for teams that carried forward.
5. Confirm — the new season is created and becomes active; the prior season is archived. Nothing is deleted; shortlists and notes are untouched.

**Access rules**
- Admin: all seasons, all teams, all athletes.
- Coach (staff): athletes on their assigned teams in any non-hidden season, unless granted org-wide access.
- Parent/player: unchanged — they see their linked athlete only, plus that athlete's team name.

## Technical section

Database (one migration):
- `seasons` — organization_id, name, start/end dates, is_active, is_archived. Partial unique index so only one active season per org.
- `teams` — organization_id, season_id, name, age_group, head_coach_user_id. Unique on (season_id, name).
- `team_coaches` — team_id, user_id, role. Unique on (team_id, user_id).
- `team_athletes` — team_id, org_athlete_id, season_id, jersey_number. Unique on (season_id, org_athlete_id) so an athlete sits on one team per season.
- `org_athletes` gains `status` (`active` | `graduated` | `departed`) and `org_wide_access boolean` goes on `users` for the per-coach override.
- GRANTs for `authenticated` + `service_role` on every new table, RLS enabled, audit triggers matching existing tables.
- Helper functions (security definer): `active_season_id()`, `can_access_athlete(_athlete_id uuid)` — true for superadmin, org admins, coaches with org-wide access, or coaches assigned to a team the athlete is on. Existing athlete/shortlist/notes policies are rewritten to call `can_access_athlete` instead of raw org matching.

Server functions — new `src/lib/seasons.functions.ts` (season CRUD, activate, rollover in a single transactional handler, team CRUD, coach assignment, athlete assignment). Existing `athletes.functions.ts`, `shortlist.functions.ts`, and dashboard aggregates take optional `seasonId` / `teamId` filters and route athlete visibility through the new helper.

UI:
- `settings.seasons.tsx` — season list, team management, rollover wizard.
- Season/team selector component reused in `roster.index.tsx` and `dashboard.tsx`.
- Team + season history block on `roster.$id.tsx`; team column in the roster table.
- Team assignment field in `roster.new.tsx`, and a Team column in the CSV importer mapping.
- `settings.team.tsx` gains team assignment and the org-wide access toggle per staff member.
