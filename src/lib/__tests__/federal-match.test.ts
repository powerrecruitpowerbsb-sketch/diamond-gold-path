import { describe, expect, it } from "vitest";
import { campusQualifier, queryVariants, scoreCandidates, verdictFor } from "../federal-match";

describe("campusQualifier", () => {
  it("finds the campus in a branch name", () => {
    expect(campusQualifier("CCBC-Catonsville")).toBe("catonsville");
    expect(campusQualifier("Metropolitan Community College-Longview")).toBe("longview");
    expect(campusQualifier("Texas A&M University\u2013Victoria")).toBe("victoria");
  });
  it("returns nothing for a plain school name", () => {
    expect(campusQualifier("University of Michigan")).toBeNull();
    expect(campusQualifier("Pennsylvania State University")).toBeNull();
    expect(campusQualifier("Trinity University (Texas)")).toBeNull();
  });
});

describe("queryVariants", () => {
  it("expands U.S. to United States", () => {
    expect(queryVariants("U.S. Naval Academy")).toContain("United States Naval Academy");
  });
  it("offers the family name for a branch", () => {
    expect(queryVariants("Coastal Alabama Community College Brewton").length).toBeGreaterThan(1);
  });
});

describe("scoreCandidates", () => {
  it("prefers the main campus for a plain name", () => {
    const scored = scoreCandidates("University of Michigan", "MI", [
      { unitid: 1, name: "University of Michigan-Ann Arbor", alias: null, city: "Ann Arbor", state: "MI", mainCampus: true, enrollment: 32000 },
      { unitid: 2, name: "University of Michigan-Dearborn", alias: null, city: "Dearborn", state: "MI", mainCampus: false, enrollment: 7000 },
      { unitid: 3, name: "University of Michigan-Flint", alias: null, city: "Flint", state: "MI", mainCampus: false, enrollment: 6000 },
    ]);
    expect(scored[0]!.unitid).toBe(1);
    expect(verdictFor(scored)).toBe("confirmed");
  });

  it("keeps a branch name off the flagship record", () => {
    const scored = scoreCandidates("Penn State Beaver", "PA", [
      { unitid: 1, name: "Pennsylvania State University-Main Campus", alias: null, city: "University Park", state: "PA", mainCampus: true, enrollment: 40000 },
      { unitid: 2, name: "Pennsylvania State University-Penn State Beaver", alias: null, city: "Monaca", state: "PA", mainCampus: false, enrollment: 700 },
    ]);
    expect(scored[0]!.unitid).toBe(2);
  });

  it("still refuses a same-name school in another state", () => {
    const scored = scoreCandidates("Trinity University (Texas)", null, [
      { unitid: 1, name: "Trinity University", alias: null, city: "San Antonio", state: "TX", mainCampus: true, enrollment: 2500 },
      { unitid: 2, name: "Trinity College", alias: null, city: "Hartford", state: "CT", mainCampus: true, enrollment: 2200 },
    ]);
    expect(scored.every((c) => c.state === "TX")).toBe(true);
  });
});

describe("shorter federal names", () => {
  it("does not match a school onto a less specific record", () => {
    const scored = scoreCandidates("Bloomsburg University of Pennsylvania", "PA", [
      { unitid: 1, name: "University of Pennsylvania", alias: null, city: "Philadelphia", state: "PA", mainCampus: true, enrollment: 25000 },
    ]);
    expect(verdictFor(scored)).not.toBe("confirmed");
  });
  it("does not match a branch onto its district record", () => {
    const scored = scoreCandidates("CCBC-Catonsville", "MD", [
      { unitid: 1, name: "Community College of Baltimore County", alias: "CCBC", city: "Baltimore", state: "MD", mainCampus: true, enrollment: 18000 },
    ]);
    expect(verdictFor(scored)).not.toBe("confirmed");
  });
  it("still confirms our name inside a federal suffix", () => {
    const scored = scoreCandidates("Miami University (Ohio)", "OH", [
      { unitid: 1, name: "Miami University-Oxford", alias: null, city: "Oxford", state: "OH", mainCampus: true, enrollment: 20000 },
    ]);
    expect(verdictFor(scored)).toBe("confirmed");
  });
});
