# Finishing the database — in the right order for spring sports

Baseball and softball are spring sports, so most schools won't post a 2026-27 squad until winter. That changes what "current" means here: a 2025-26 squad list is the right, current answer for most teams today, and chasing 2026-27 now would just churn. So squad refreshing moves to the back, and the work that can actually be finished today moves to the front.

Where things stand right now: 3,115 teams confirmed as having the sport, 2,192 of them with no head coach on file, 574 with no official squad or staff page, 1,199 with no squad list at all, 215 teams still undecided on whether they field the sport, plus 1,573 link decisions and 14 fact decisions waiting on you.

## Order of work

### 1. Find the missing official pages (574 teams)
Without an official squad/staff page nothing else can be filled in, so this comes first. Push these teams through the existing link-finding step, accept links that pass the ownership and sport checks automatically, and leave only genuine puzzles for you.

### 2. Head coaches (2,192 teams) — carefully, with proof
This is the accuracy-critical one, and the reason automatic coach writing is still switched off. Before switching it back on:
- Save the current official staff pages for UCF, Cincinnati and two more Big 12 schools as fixed test cases, and add tests that the coach checks read them correctly.
- Only write a name when the page proves the school, proves the sport, and states the head-coach title outright.
- Run it on 25 teams first and hand-check every result against the live page. Only widen if all 25 are right.
- Every name stores its page and date, and can be undone in one step.

### 3. Clear the 1,573 link decisions and 14 fact decisions
Auto-decide the ones the classifiers already call plainly wrong or plainly right, retire rows for teams that don't field the sport, and leave a much smaller genuine pile.

### 4. The 215 undecided teams
Re-run the sponsorship check on these, in small bounded batches so it can't time out like the last attempt, and give the leftovers a simple yes/no screen.

### 5. Squad lists — the spring-sport schedule
- Teams with no squad list at all (1,199) get pulled now, whatever season their page shows, as long as it's within the live window.
- Teams holding a 2025-26 list are treated as current and left alone until winter.
- A scheduled sweep from early January through March re-reads every team's squad page and picks up 2026-27 as each school posts it, so this happens by itself next year and every year after.

### 6. Keep watching accuracy
Weekly random spot-checks against the schools' own pages, and the "report a mistake" route from any page, so errors surface without you hunting for them.

## Notes on how this works
- Seasons are stored as the school year's ending year (2026-27 = 2027) and displayed as "2026-27". The live window accepts the current season and the one just finished, which is exactly what spring sports need — no change required there.
- The refresh sweep uses the existing due-date fields on teams and schools, with the due date set into January rather than a fixed number of months after the last pull.
- All of this runs through the existing unattended runner, which is now self-restarting, so nothing needs a browser tab left open.
