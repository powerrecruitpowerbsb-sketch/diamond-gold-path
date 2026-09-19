# Answers, then a consolidation proposal

## 1. Search: starts empty, works like the College list

Today Search opens by browsing every team (1,556 matched, first 400 shown). Changing to:

- Opens empty with a one-line prompt ("Pick a level, a location, or type a school name") and the
  six filters visible. No rows until a filter or a name is entered.
- Rows behave exactly like College list rows: clicking one opens the same pop-up sheet over the
  results (Overview, Roster, Intelligence, Notes & Messages, "Go to full profile"), so you can
  flip through several schools without leaving the search.
- **Add to list** on every row. Staff and admins pick which athlete's list it goes to — a small
  athlete picker that remembers the last athlete chosen, so adding ten schools for one player is
  ten clicks, not twenty. Parents and players add to their own athlete with no picker. A school
  already on that athlete's list shows "Added" with its current stage instead of a second button.
- Match count stays above the results, so you can see how many teams a filter reaches.

**Are Search and College list the same thing?** No — and I'd keep them separate. Search is
discovery across all 3,238 teams, the funnel in. College list is the small set you're following
for a player, with stages, notes and conversations. They should look and behave the same (same row
style, same pop-up sheet), which is what makes them feel like one tool, but a family shouldn't
wade through the whole country to see their eight schools.

## 2. Where to look for what was built

In the preview, signed in as the Power Baseball admin, the left menu is where everything lives:

- **College list** — the new screen. Stages, the school sheet that opens over the list, notes and
  the conversation per school. "Stage names" (top right) is the per-organization stage editor.
- **Roster** — athletes; open one for their own saved-school board and parent/player invites.
- **Intelligence** — writing intelligence about schools, plus the approval queue.
- **Dashboard** — totals by division, region and stage across the whole roster.
- **Search** — the results now sit above the filters instead of replacing the page.

The live (published) site is still running older code, so Intelligence and College list won't
appear there until it's published.

## 3. Sort by player on the College list

Agreed — it's missing. Today the page shows one athlete at a time through an Athlete dropdown.
The change:

- Add an "All athletes" option, default for staff. Every saved school across the roster in one
  list, with an **Athlete** column.
- Make the table sortable by Athlete, School, Stage, Level and Last activity; grouped-by-athlete
  is a toggle rather than the only way to read it.
- Stage, sport and level filters keep working across all athletes, and stage counts reflect
  whatever is on screen.
- Parents and players keep seeing only their own athlete; no dropdown, no Athlete column.

## 4. Consolidation: four screens per person, not nine

Right now a coach has Home, Dashboard, Roster, College list, Search, Compare, Intelligence,
Family portal (for some), Console — with real overlap: Dashboard, Roster and College list all
answer "where does my roster stand", and Family portal repeats the College list for families.

What I'd consolidate to:

**Coach / staff and Admin — four items**

1. **Home** — the one landing screen, replacing today's Home and Dashboard: totals by stage,
   division and region, plus "needs attention" (schools sitting in Contacted too long, new
   messages, intelligence awaiting approval).
2. **Athletes** — the roster. Each athlete opens to their college list, notes and conversations.
   The current standalone Roster and per-athlete board merge here.
3. **College list** — the same records read the other way: every athlete's schools in one
   sortable list, filterable by stage. This is the day-to-day working screen.
4. **Search** — discovery, whose whole purpose for a coach is finding schools to add to a specific
   player's list: pick the athlete once at the top, then every row adds to that athlete, shows
   "Added" if it's already there, and opens in the same pop-up sheet. Compare folds in as a tray
   rather than its own page.

Intelligence stays a separate item for Admin and Owner only (it's a different job and a different
audience), and settings (stages, branding, invites, seasons) collapse into one **Settings** item
with tabs instead of three menu entries.

**Parent and Player — two items**

1. **My list** — the College list scoped to their athlete: stage per school, notes, conversations.
   Today's Family portal is absorbed into this; it doesn't need its own screen.
2. **Search** — discovery with "Add to list".

The player sees the same two; nothing is hidden from the parent that the player can see.

## 5. What each role most needs to see first

- **Owner** — what the organization is paying for and getting: seats used, athletes, commits, plus
  everything Admin sees. Billing and branding stay Owner-only.
- **Admin** — where every athlete stands, what's stalled, what needs approving.
- **Coach / staff** — their own athletes' stages and any new message, in one glance.
- **Parent** — where my child's schools stand and what a coach said, in plain language.
- **Player** — same as the parent, with the ability to move a school and add a school themselves.

## Order I'd build it

1. Search: empty start, athlete picker, Add to list / Added, and the pop-up sheet on rows.
2. College list: all-athletes view, Athlete column, sorting.
3. The menu consolidation and merged Home, which is the bigger piece and touches several screens.

## Technical notes

- Sorting and the all-athletes view: `getCollegeList` gains an "all athletes for this
  organization" mode (same org scoping and RLS as now, one query rather than per athlete);
  `list.tsx` gains sort state and an Athlete column. No schema change.
- Consolidation is route work: `/family` redirects to `/list`, `/dashboard` merges into `/`,
  `/compare` becomes a tray inside `/search`, and `settings.*` group under one tabbed route.
  Old URLs redirect so nothing bookmarked breaks.
- No migration is required for any of this.
