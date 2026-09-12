import { describe, expect, it } from "vitest";
import { nameMatch, resolveByName, sameState, stateCode } from "../school-name-match";

describe("direction-aware matching", () => {
  it("accepts league shorthand of the stored name", () => {
    expect(nameMatch("Bellevue", "Bellevue University")).toBe("same significant words");
    expect(nameMatch("Cumberlands", "University of the Cumberlands")).toBe("same significant words");
    expect(nameMatch("Taylor", "Taylor University")).toBe("same significant words");
  });
  it("prefers whole-name agreement", () => {
    expect(nameMatch("Chipola College", "Chipola College")).toBe("exact name");
  });
  it("does not let a short stored name swallow a longer listed name", () => {
    expect(nameMatch("Kansas City Kansas Community College", "University of Kansas")).toBeNull();
    expect(nameMatch("LSU Shreveport", "Louisiana State University")).toBeNull();
  });
});

describe("a dropped distinguishing word refuses the match", () => {
  it("keeps community, state, city and county apart", () => {
    expect(nameMatch("Kansas City Kansas Community College", "Kansas City College")).toBeNull();
    expect(nameMatch("Cleveland State Community College", "Cleveland Community College")).toBeNull();
    expect(nameMatch("Jackson State University", "Jackson College")).toBeNull();
    expect(nameMatch("Wallace State Community College", "Wallace Community College")).toBeNull();
  });
  it("still ignores college/university/the/of", () => {
    expect(nameMatch("Ozarks", "University of the Ozarks")).toBe("same significant words");
  });
});

describe("resolveByName", () => {
  const pool = [
    { id: "a", name: "Bethel University" },
    { id: "b", name: "Bethel College" },
  ];
  it("refuses two same-name schools rather than guessing", () => {
    const r = resolveByName("Bethel", pool);
    expect(r.school).toBeNull();
    expect(r.method).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });
  it("breaks a tie only on evidence outside the name", () => {
    const r = resolveByName("Bethel", pool, (c) => c.id === "b");
    expect(r.school?.id).toBe("b");
  });
});

describe("state normalisation", () => {
  it("compares spelled-out names with codes", () => {
    expect(stateCode("Ohio")).toBe("OH");
    expect(stateCode("Calif.")).toBe("CA");
    expect(sameState("Ohio", "OH")).toBe(true);
    expect(sameState("California", "CA")).toBe(true);
    expect(sameState("Ohio", "OK")).toBe(false);
    expect(sameState("", "OH")).toBe(false);
  });
});

describe("qualifier dropped", () => {
  const pool = [
    { id: "a", name: "Barton County Community College" },
    { id: "b", name: "Highland Community College-Kansas" },
  ];
  it("accepts a dropped qualifier when only one school answers to it", () => {
    const r = resolveByName("Barton Community College", pool);
    expect(r.school?.id).toBe("a");
    expect(r.method).toBe("qualifier dropped");
    const h = resolveByName("Highland CC", pool);
    expect(h.school?.id).toBe("b");
  });
  it("refuses it when both names exist side by side", () => {
    const both = [
      { id: "x", name: "Cleveland Community College" },
      { id: "y", name: "Cleveland State Community College" },
    ];
    const r = resolveByName("Cleveland Community College", both);
    expect(r.school?.id).toBe("x"); // exact wins outright
    // "Cleveland CC" fits Cleveland Community College outright and Cleveland
    // State Community College once "State" is dropped, so nothing is assigned.
    const s = resolveByName("Cleveland CC", both);
    expect(s.school).toBeNull();
    expect(s.method).toBe("ambiguous");
    // Dropping "State" from the state school is what would be ambiguous.
    const j = resolveByName("Jackson", [
      { id: "p", name: "Jackson College" },
      { id: "q", name: "Jackson State Community College" },
    ]);
    expect(j.school?.id).toBe("p");
  });
  it("still refuses a genuinely different school", () => {
    expect(resolveByName("Kansas City Kansas Community College", [
      { id: "u", name: "University of Kansas" },
    ]).school).toBeNull();
  });
});

describe("refusals learned from the league passes", () => {
  it("does not let a listed name add an identity word to a stored one", () => {
    expect(resolveByName("South Georgia State College", [
      { id: "g", name: "Georgia State University" },
    ]).school).toBeNull();
  });
  it("counts repeated words", () => {
    const pool = [
      { id: "u", name: "Walla Walla University" },
      { id: "c", name: "Walla Walla Community College" },
    ];
    const r = resolveByName("Walla Walla", pool);
    expect(r.school).toBeNull();
    expect(r.method).toBe("ambiguous");
  });
});
