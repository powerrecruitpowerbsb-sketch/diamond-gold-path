/**
 * The real pages, not made-up ones.
 *
 * A soccer coach once landed on UCF baseball, and one assistant's 2025 bio page
 * was used as Cincinnati's staff list. These tests use the actual addresses of
 * those schools' pages — captured from the live sites on 2026-09-06, with the
 * relevant slice of each page saved next door in fixtures/ — so the rules are
 * proved against what really exists rather than against examples we invented.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { coachEvidenceVerdict, coachNameSane, headCoachStated } from "@/lib/coach-quality";
import { pageOwnership } from "@/lib/program-ownership";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

/** UCF baseball: the sport's own staff list on the school's athletics site. */
const UCF = {
  sport: "baseball",
  sourceUrl: "https://ucfknights.com/staff-directory/department/baseball",
  athleticWebsite: "https://www.ucfknights.com/",
  coachingStaffUrl: "https://ucfknights.com/staff-directory/department/baseball",
  schoolWebsite: "https://ucfknights.com",
};

/** Texas Tech baseball: a Big 12 program whose stored coach we can re-prove. */
const TEXAS_TECH = {
  sport: "baseball",
  sourceUrl: "https://texastech.com/sports/baseball/coaches",
  athleticWebsite: "https://www.texastech.com",
  coachingStaffUrl: "https://texastech.com/sports/baseball/coaches",
  schoolWebsite: "https://texastech.com",
};

describe("real official staff pages", () => {
  it("accepts the head coach named on UCF's own baseball staff page", () => {
    const page = fixture("ucf-baseball-staff.txt");
    expect(page).toContain("Rich Wallace");
    expect(page).toContain("Head Coach");
    expect(coachNameSane("Rich Wallace").ok).toBe(true);
    expect(coachEvidenceVerdict({ value: "Rich Wallace", ...UCF }).ok).toBe(true);
  });

  it("accepts the head coach named on Texas Tech's own baseball staff page", () => {
    const page = fixture("texas-tech-baseball-staff.txt");
    expect(page).toContain("Tadlock");
    expect(coachEvidenceVerdict({ value: "Tim Tadlock", ...TEXAS_TECH }).ok).toBe(true);
  });

  it("refuses the UCF athletics homepage, where the soccer coach came from", () => {
    const verdict = coachEvidenceVerdict({
      ...UCF,
      value: "Tiffany Roberts Sahaydak",
      sourceUrl: "https://ucfknights.com/",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses a coach read off UCF's soccer pages for the baseball team", () => {
    const verdict = coachEvidenceVerdict({
      ...UCF,
      value: "Tiffany Roberts Sahaydak",
      sourceUrl: "https://ucfknights.com/sports/womens-soccer/coaches",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses the exact Cincinnati page that caused the mistake: one 2025 bio", () => {
    const verdict = coachEvidenceVerdict({
      value: "Tom Winske",
      sport: "baseball",
      sourceUrl: "https://gobearcats.com/sports/baseball/roster/season/2025/staff/tom-winske",
      athleticWebsite: "https://gobearcats.com/",
      coachingStaffUrl: "https://gobearcats.com/staff-directory/department/baseball",
      schoolWebsite: "https://gobearcats.com",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses a placeholder even on the right page", () => {
    expect(coachEvidenceVerdict({ value: "TBD", ...UCF }).ok).toBe(false);
    expect(coachEvidenceVerdict({ value: "Head Coach", ...UCF }).ok).toBe(false);
  });

  it("accepts Kansas' head baseball coach as stated on the school's own page", () => {
    const page = fixture("kansas-baseball-staff.txt");
    expect(page).toContain("Dan Fitzgerald");
    expect(headCoachStated(page, "Dan Fitzgerald")).toBe(true);
    expect(
      coachEvidenceVerdict({
        value: "Dan Fitzgerald",
        sport: "baseball",
        sourceUrl: "https://kuathletics.com/sports/baseball/coaches",
        athleticWebsite: "https://kuathletics.com",
        coachingStaffUrl: "https://kuathletics.com/sports/baseball/coaches",
        schoolWebsite: "https://kuathletics.com",
        pageText: page,
        field: "head_coach_name",
      }).ok,
    ).toBe(true);
  });

  it("writes nothing from Cincinnati's baseball coaches page, which states no coach", () => {
    const page = fixture("cincinnati-baseball-coaches.txt");
    expect(headCoachStated(page, "Tom Winske")).toBe(false);
    const verdict = coachEvidenceVerdict({
      value: "Tom Winske",
      sport: "baseball",
      sourceUrl: "https://gobearcats.com/sports/baseball/coaches",
      athleticWebsite: "https://gobearcats.com/",
      coachingStaffUrl: "https://gobearcats.com/staff-directory/department/baseball",
      schoolWebsite: "https://gobearcats.com",
      pageText: page,
      field: "head_coach_name",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("will not promote an assistant listed further down a staff page", () => {
    const page =
      "Dan Fitzgerald Head Baseball Coach ... ... ... ... ... ... ... ... ... ... ... ... " +
      "... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... " +
      "Ryan Graves Pitching Coach";
    expect(headCoachStated(page, "Ryan Graves")).toBe(false);
  });

  it("keeps the Ocala junior college from claiming UCF's athletics site", () => {
    const jc = pageOwnership({
      url: "https://ucfknights.com/staff-directory/department/baseball",
      schoolName: "College of Central Florida",
      schoolWebsite: "https://cf.edu",
    });
    const ucf = pageOwnership({
      url: "https://ucfknights.com/staff-directory/department/baseball",
      schoolName: "University of Central Florida",
      schoolWebsite: "https://ucf.edu",
    });
    expect(ucf.score).toBeGreaterThan(jc.score);
  });
});

