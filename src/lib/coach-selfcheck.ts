/**
 * The coach safety self-check.
 *
 * Saving a head coach automatically was switched off after a Big 12 program got
 * the wrong name. Before it is switched back on, the same rules that decide
 * whether a name may be stored are run against real pages we know the answer
 * for: the school's own sport staff page (accept) and the exact pages that
 * produced the mistake (refuse). If any single case comes out wrong, coach
 * filling stays off and the failures are shown by name.
 *
 * These are pure text/address checks, so they run anywhere — inside the app for
 * the Build progress screen, and in the test suite. The page snippets below are
 * the relevant slices of the live pages captured on 2026-09-06.
 */

import { coachEvidenceVerdict } from "@/lib/coach-quality";

type Case = {
  name: string;
  expect: "accept" | "refuse";
  value: string;
  sport: string;
  sourceUrl: string;
  athleticWebsite: string;
  coachingStaffUrl: string;
  schoolWebsite: string;
  pageText?: string;
};

const UCF_STAFF = `Baseball Staff Directory
Rich Wallace Head Coach 407-823-0000 baseball@ucf.edu
Nick Otte Assistant Coach
Ryan Klosterman Assistant Coach`;

const KANSAS_STAFF = `Baseball Coaches
Dan Fitzgerald Head Coach
Ryan Graves Associate Head Coach`;

const CINCY_COACHES = `Baseball Coaches
Coaching staff information is being updated.
Contact the athletics communications office.`;

export const COACH_CASES: Case[] = [
  {
    name: "UCF baseball — head coach on the school's own baseball staff page",
    expect: "accept",
    value: "Rich Wallace",
    sport: "baseball",
    sourceUrl: "https://ucfknights.com/staff-directory/department/baseball",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
    schoolWebsite: "https://ucfknights.com",
    pageText: UCF_STAFF,
  },
  {
    name: "Kansas baseball — head coach stated beside the name",
    expect: "accept",
    value: "Dan Fitzgerald",
    sport: "baseball",
    sourceUrl: "https://kuathletics.com/sports/baseball/coaches",
    athleticWebsite: "https://kuathletics.com",
    coachingStaffUrl: "https://kuathletics.com/sports/baseball/coaches",
    schoolWebsite: "https://kuathletics.com",
    pageText: KANSAS_STAFF,
  },
  {
    name: "Texas Tech baseball — head coach on the sport's own staff page",
    expect: "accept",
    value: "Tim Tadlock",
    sport: "baseball",
    sourceUrl: "https://texastech.com/sports/baseball/coaches",
    athleticWebsite: "https://www.texastech.com",
    coachingStaffUrl: "https://texastech.com/sports/baseball/coaches",
    schoolWebsite: "https://texastech.com",
  },
  {
    name: "UCF athletics home page — where the soccer coach came from",
    expect: "refuse",
    value: "Tiffany Roberts Sahaydak",
    sport: "baseball",
    sourceUrl: "https://ucfknights.com/",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
    schoolWebsite: "https://ucfknights.com",
  },
  {
    name: "UCF women's soccer page used for the baseball team",
    expect: "refuse",
    value: "Tiffany Roberts Sahaydak",
    sport: "baseball",
    sourceUrl: "https://ucfknights.com/sports/womens-soccer/coaches",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
    schoolWebsite: "https://ucfknights.com",
  },
  {
    name: "Cincinnati baseball — one assistant's 2025 bio page",
    expect: "refuse",
    value: "Tom Winske",
    sport: "baseball",
    sourceUrl: "https://gobearcats.com/sports/baseball/roster/season/2025/staff/tom-winske",
    athleticWebsite: "https://gobearcats.com/",
    coachingStaffUrl: "https://gobearcats.com/staff-directory/department/baseball",
    schoolWebsite: "https://gobearcats.com",
  },
  {
    name: "Cincinnati baseball coaches page, which names no head coach",
    expect: "refuse",
    value: "Tom Winske",
    sport: "baseball",
    sourceUrl: "https://gobearcats.com/sports/baseball/coaches",
    athleticWebsite: "https://gobearcats.com/",
    coachingStaffUrl: "https://gobearcats.com/staff-directory/department/baseball",
    schoolWebsite: "https://gobearcats.com",
    pageText: CINCY_COACHES,
  },
  {
    name: "A placeholder on the right page",
    expect: "refuse",
    value: "TBD",
    sport: "baseball",
    sourceUrl: "https://ucfknights.com/staff-directory/department/baseball",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
    schoolWebsite: "https://ucfknights.com",
    pageText: UCF_STAFF,
  },
  {
    name: "A softball name read from the baseball staff page",
    expect: "refuse",
    value: "Rich Wallace",
    sport: "softball",
    sourceUrl: "https://ucfknights.com/staff-directory/department/baseball",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/softball",
    schoolWebsite: "https://ucfknights.com",
    pageText: UCF_STAFF,
  },
  {
    name: "A staff page belonging to a different school",
    expect: "refuse",
    value: "Rich Wallace",
    sport: "baseball",
    sourceUrl: "https://floridagators.com/sports/baseball/coaches",
    athleticWebsite: "https://www.ucfknights.com/",
    coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
    schoolWebsite: "https://ucfknights.com",
  },
];

export type CoachSelfCheck = {
  passed: boolean;
  total: number;
  failures: { name: string; expected: string; got: string }[];
};

/** Run every case. Passing is the only condition under which coaches are filled. */
export function coachGuardSelfCheck(): CoachSelfCheck {
  const failures: CoachSelfCheck["failures"] = [];

  for (const item of COACH_CASES) {
    const verdict = coachEvidenceVerdict({
      value: item.value,
      sport: item.sport,
      sourceUrl: item.sourceUrl,
      athleticWebsite: item.athleticWebsite,
      coachingStaffUrl: item.coachingStaffUrl,
      schoolWebsite: item.schoolWebsite,
      pageText: item.pageText ?? null,
      field: "head_coach_name",
    });
    const got = verdict.ok ? "accept" : "refuse";
    if (got !== item.expect) {
      failures.push({
        name: item.name,
        expected: item.expect,
        got: verdict.reason ? `${got} (${verdict.reason})` : got,
      });
    }
  }

  return { passed: failures.length === 0, total: COACH_CASES.length, failures };
}
