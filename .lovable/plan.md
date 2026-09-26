# Step 2: Coach Workspace

Build these in order, checking each one before starting the next. All screens use the club's own colors, one-word section headers, and work on a phone first.

## 1. Verify
- On each athlete's page, add a "Measurables" list showing every number with its status: Self-reported, or Coach verified in green.
- One tap on "Verify" marks a number as verified and records who verified it and when.
- The roster page shows an "Unverified" alert with a count. Tapping it filters the roster to players with numbers waiting for a check.

## 2. Flags
- Each roster row shows status chips: no colleges picked, no video, missing measurables, profile under 50% ready.
- Filter chips at the top of the roster let a coach work through one problem at a time.

## 3. Actions
- The coach dashboard gets an "Actions" list: numbers to verify, players with no target schools, stale profiles (no update in 30 days), and upcoming events.
- Each item links straight to the fix.

## 4. Packet
- One tap creates a shareable team roster page for college recruiters: jersey, name, class, position, bats/throws, verified numbers, and a QR code for each scout card.
- It has a clean print layout and a public link that can be turned off.

## 5. Recommend
- A coach can push a school onto a player's college list with a note that only staff can see.
- The player sees the school marked "Coach pick".

## 6. Schedule
- Events can list the field, time, and opponent for each game, with times shown the same way everywhere.

## Technical notes
- Verification uses the existing `verifyAthleteMetric` function and the `guard_metric_verification` rule in the database.
- The packet needs a new `team_packets` table (token, team_id, enabled). It is read through a public, token-gated function under `/api/public` or as a security-definer RPC.
- Coach picks add `recommended_by` and `staff_note` columns to `athlete_saved_schools`. Staff notes are hidden from family views.
- Schedule adds `field` and `opponent` columns to `schedule_events`.
- The True-Fit revisit is still tracked in roadmap.md.
