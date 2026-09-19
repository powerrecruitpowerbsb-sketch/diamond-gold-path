import { describe, expect, it } from "vitest";

import { academicFit, depthFit, footprintFit } from "../true-fit";

const school = {
  avgGpa: 3.5,
  satTotal25: 1100,
  satTotal75: 1300,
  act25: 22,
  act75: 28,
  acceptanceRate: 0.62,
  testOptional: false,
};

describe("academicFit", () => {
  it("calls a score above the published 75th a safety", () => {
    const fit = academicFit(school, { gpa: 3.9, sat: 1350, act: null });
    expect(fit.tier).toBe("safety");
    expect(fit.confidence).not.toBe("none");
  });

  it("takes the most cautious verdict when numbers disagree", () => {
    const fit = academicFit(school, { gpa: 3.9, sat: 1000, act: null });
    expect(fit.tier).toBe("reach");
  });

  it("says it does not know rather than guessing when the athlete has no numbers", () => {
    const fit = academicFit(school, { gpa: null, sat: null, act: null });
    expect(fit.tier).toBe("unknown");
    expect(fit.confidence).toBe("none");
  });

  it("says it does not know when the school publishes nothing to compare against", () => {
    const fit = academicFit(
      { avgGpa: null, satTotal25: null, satTotal75: null, act25: null, act75: null, acceptanceRate: null, testOptional: null },
      { gpa: 3.4, sat: 1200, act: null },
    );
    expect(fit.tier).toBe("unknown");
    expect(fit.missing.length).toBeGreaterThan(0);
  });
});

describe("depthFit", () => {
  const roster = [
    { position: "SS", classYear: "SR", homeState: "FL" },
    { position: "2B", classYear: "SR", homeState: "GA" },
    { position: "SS", classYear: "FR", homeState: "TX" },
    { position: "OF", classYear: "JR", homeState: "FL" },
    { position: "RHP", classYear: "SO", homeState: "CA" },
  ];

  it("never penalises a program with no roster on file", () => {
    const fit = depthFit([], "SS", null);
    expect(fit.confidence).toBe("none");
    expect(fit.headline).toBe("Roster data pending");
    expect(fit.detail).toContain("does not count against the school");
  });

  it("counts the athlete's own position group, outfield kept whole", () => {
    const fit = depthFit(roster, "SS", 2026);
    expect(fit.group).toBe("middle_infield");
    expect(fit.inGroup).toBe(3);
    expect(fit.seniorsInGroup).toBe(2);
    expect(fit.headline).toBe("Opening up");
  });

  it("asks for a position instead of guessing one", () => {
    const fit = depthFit(roster, null, 2026);
    expect(fit.group).toBeNull();
    expect(fit.detail).toContain("Set the athlete's position");
  });
});

describe("footprintFit", () => {
  const roster = Array.from({ length: 6 }, (_, index) => ({
    position: "OF",
    classYear: "FR",
    homeState: index < 4 ? "FL" : "GA",
  }));

  it("holds back when too few hometowns are published", () => {
    const fit = footprintFit([{ position: "OF", classYear: "FR", homeState: "FL" }], "FL");
    expect(fit.confidence).toBe("none");
    expect(fit.detail).toContain("does not count against the school");
  });

  it("counts players from the athlete's state", () => {
    const fit = footprintFit(roster, "fl");
    expect(fit.fromHomeState).toBe(4);
    expect(fit.topStates[0]).toEqual({ state: "FL", count: 4 });
  });

  it("states plainly when no one from the state is listed, without calling it a no", () => {
    const fit = footprintFit(roster, "WA");
    expect(fit.fromHomeState).toBe(0);
    expect(fit.detail).toContain("not a no");
  });
});
