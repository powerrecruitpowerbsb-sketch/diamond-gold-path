import { describe, expect, it } from "vitest";
import { coachEvidenceVerdict, coachNameSane } from "@/lib/coach-quality";
import { junkHost } from "@/lib/link-quality";
import { normalizeRejectedValue, rejectionKey } from "@/lib/rejected-memory";

/**
 * These cases are the real mistakes we found by hand, kept as tests so they can
 * never come back quietly: a soccer coach stored on UCF baseball, a single 2025
 * bio page used as Cincinnati's staff list, a football coach on Texas State
 * softball — and the two legitimate pages (Seton Hill, Rhodes) that an earlier,
 * stricter version wrongly threw away.
 */

const ucf = {
  sport: "baseball",
  athleticWebsite: "https://ucfknights.com",
  schoolWebsite: "https://www.ucf.edu",
};

describe("coachNameSane", () => {
  it("accepts an ordinary head coach name", () => {
    expect(coachNameSane("Rich Wallace").ok).toBe(true);
    expect(coachNameSane("Mary-Kate O'Brien").ok).toBe(true);
  });

  it("rejects job titles, departments and placeholders", () => {
    for (const value of [
      "Head Baseball Coach",
      "Assistant Coach",
      "Athletics Department",
      "Vacant",
      "TBD",
      "Recruiting Coordinator",
    ]) {
      expect(coachNameSane(value).ok, value).toBe(false);
    }
  });

  it("rejects contact details and page headings", () => {
    expect(coachNameSane("coach@ucf.edu").ok).toBe(false);
    expect(coachNameSane("(407) 823-2000").ok).toBe(false);
    expect(coachNameSane("MEET THE KNIGHTS STAFF").ok).toBe(false);
    expect(coachNameSane("A").ok).toBe(false);
  });
});

describe("coachEvidenceVerdict", () => {
  it("accepts a sport's own staff directory on the athletics site", () => {
    const verdict = coachEvidenceVerdict({
      value: "Rich Wallace",
      sourceUrl: "https://ucfknights.com/sports/baseball/roster/coaches",
      ...ucf,
    });
    expect(verdict.ok).toBe(true);
  });

  it("refuses a name read off the athletics homepage (the UCF soccer coach case)", () => {
    const verdict = coachEvidenceVerdict({
      value: "Tiffany Roberts Sahaydak",
      sourceUrl: "https://ucfknights.com/",
      ...ucf,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses one staff member's bio page (the Cincinnati case)", () => {
    const verdict = coachEvidenceVerdict({
      value: "Jordan Bischel",
      sourceUrl: "https://gobearcats.com/sports/baseball/roster/coaches/jordan-bischel",
      sport: "baseball",
      athleticWebsite: "https://gobearcats.com",
      schoolWebsite: "https://www.uc.edu",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses a page belonging to another sport (the Texas State football case)", () => {
    const verdict = coachEvidenceVerdict({
      value: "Gary Rhoades",
      sourceUrl: "https://txstatebobcats.com/sports/football/coaches",
      sport: "softball",
      athleticWebsite: "https://txstatebobcats.com",
      schoolWebsite: "https://www.txst.edu",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });

  it("refuses a name from a news story or an old season", () => {
    expect(
      coachEvidenceVerdict({
        value: "Rich Wallace",
        sourceUrl: "https://ucfknights.com/news/2024/6/1/baseball-names-new-coach",
        ...ucf,
      }).ok,
    ).toBe(false);
    expect(
      coachEvidenceVerdict({
        value: "Rich Wallace",
        sourceUrl: "https://ucfknights.com/sports/baseball/coaches/2019-20",
        ...ucf,
      }).ok,
    ).toBe(false);
  });

  it("accepts an athletics subdomain of the school (the Seton Hill case)", () => {
    const verdict = coachEvidenceVerdict({
      value: "Marc Marizzaldi",
      sourceUrl: "https://athletics.setonhill.edu/sports/baseball/coaches",
      sport: "baseball",
      athleticWebsite: "https://athletics.setonhill.edu",
      schoolWebsite: "https://www.setonhill.edu",
    });
    expect(verdict.ok).toBe(true);
  });

  it("holds a nickname athletics domain for a person rather than discarding it (the Rhodes case)", () => {
    const verdict = coachEvidenceVerdict({
      value: "Jeff Cleanthes",
      sourceUrl: "https://rhodeslynx.com/sports/baseball/coaches",
      sport: "baseball",
      athleticWebsite: null,
      schoolWebsite: "https://www.rhodes.edu",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("flag");
  });

  it("refuses a name with no source page at all", () => {
    const verdict = coachEvidenceVerdict({ value: "Rich Wallace", sourceUrl: null, ...ucf });
    expect(verdict.ok).toBe(false);
    expect(verdict.severity).toBe("reject");
  });
});

describe("junkHost", () => {
  it("treats aggregators and social sites as junk", () => {
    expect(junkHost("https://en.wikipedia.org/wiki/UCF_Knights_baseball")).toBe(true);
    expect(junkHost("https://twitter.com/UCF_Baseball")).toBe(true);
  });

  it("does not flag a school site that merely contains a junk word", () => {
    expect(junkHost("https://ucfknights.com/sports/baseball/coaches")).toBe(false);
    expect(junkHost("https://athletics.setonhill.edu/sports/baseball")).toBe(false);
  });
});

describe("rejected value memory", () => {
  it("matches the same name whatever its spacing or case", () => {
    const a = rejectionKey({
      table_name: "programs",
      record_id: "p1",
      field_name: "head_coach_name",
      value: "  Tiffany  Roberts Sahaydak ",
    });
    const b = rejectionKey({
      table_name: "programs",
      record_id: "p1",
      field_name: "head_coach_name",
      value: "tiffany roberts sahaydak",
    });
    expect(a).toBe(b);
  });

  it("matches the same roster whatever order the players were read in", () => {
    const one = normalizeRejectedValue({
      program_id: "p1",
      season_year: 2026,
      players: [{ name: "A Smith" }, { name: "B Jones" }],
    });
    const two = normalizeRejectedValue({
      program_id: "p1",
      season_year: 2026,
      players: [{ name: "B Jones" }, { name: "a smith" }],
    });
    expect(one).toBe(two);
  });

  it("keeps different values apart", () => {
    const one = rejectionKey({
      table_name: "programs",
      record_id: "p1",
      field_name: "head_coach_name",
      value: "Rich Wallace",
    });
    const two = rejectionKey({
      table_name: "programs",
      record_id: "p1",
      field_name: "head_coach_name",
      value: "Greg Lovelady",
    });
    expect(one).not.toBe(two);
  });
});

describe("interim head coaches", () => {
  it("accepts the person's name and leaves 'interim' to the title", () => {
    expect(coachNameSane("Mary Lane").ok).toBe(true);
    const verdict = coachEvidenceVerdict({
      value: "Mary Lane",
      sourceUrl: "https://ucfknights.com/sports/baseball/coaches",
      pageText: "Baseball Coaches\nMary Lane Interim Head Coach",
      ...ucf,
    });
    expect(verdict.ok).toBe(true);
  });
});
