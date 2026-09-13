import { describe, expect, it } from "vitest";
import { normalizePosition } from "@/lib/data-quality";
import { positionGroup } from "@/lib/position-group";

describe("single wordings", () => {
  it("stores a pitcher with no hand as P", () => {
    for (const word of ["P", "Pitcher", "Pitchers", "SP", "RP", "Relief Pitcher", "Closer"]) {
      expect(normalizePosition(word)).toBe("P");
    }
  });

  it("keeps the hand when the page names it", () => {
    expect(normalizePosition("Right-Handed Pitcher")).toBe("RHP");
    expect(normalizePosition("Left-Handed Pitcher")).toBe("LHP");
    expect(normalizePosition("RHP")).toBe("RHP");
    expect(normalizePosition("LH Pitcher")).toBe("LHP");
  });

  it("stores an unspecified infielder as IF, never utility", () => {
    for (const word of ["IF", "INF", "Inf", "Infield", "Infielder", "Infielders"]) {
      expect(normalizePosition(word)).toBe("IF");
    }
  });

  it("reads long-form fielding spots", () => {
    expect(normalizePosition("First Base")).toBe("1B");
    expect(normalizePosition("Second Baseman")).toBe("2B");
    expect(normalizePosition("Third Base")).toBe("3B");
    expect(normalizePosition("Shortstop")).toBe("SS");
    expect(normalizePosition("Left Fielder")).toBe("OF");
    expect(normalizePosition("Center Field")).toBe("OF");
    expect(normalizePosition("Catcher")).toBe("C");
  });

  it("uses utility only where the page says utility", () => {
    for (const word of ["UT", "UTL", "Utility", "Utility Player", "DH"]) {
      expect(normalizePosition(word)).toBe("UTIL");
    }
  });

  it("stores blank for wording it cannot read", () => {
    expect(normalizePosition("Head Coach")).toBeNull();
    expect(normalizePosition("")).toBeNull();
    expect(normalizePosition("—")).toBeNull();
  });
});

describe("combined cells", () => {
  it("is two-way only when one part is a pitcher", () => {
    for (const cell of ["P/IF", "P/OF", "IF/P", "P/C", "P/1B", "P/UT", "Third Base/Pitcher", "Pitcher/Catcher", "IF/RHP", "IF/OF/P"]) {
      expect(normalizePosition(cell)).toBe("TWO_WAY");
    }
  });

  it("is utility when a position player covers two spots", () => {
    for (const cell of ["IF/OF", "First Base/Third Base", "Second Base/Shortstop", "Third Base/Catcher", "First Base/Catcher"]) {
      expect(normalizePosition(cell)).toBe("UTIL");
    }
  });

  it("handles spacing and separator variants", () => {
    expect(normalizePosition("IF / OF")).toBe("UTIL");
    expect(normalizePosition("P / OF")).toBe("TWO_WAY");
    expect(normalizePosition("IF, OF")).toBe("UTIL");
    expect(normalizePosition("OF or IF")).toBe("UTIL");
  });

  it("collapses a cell naming the same position twice", () => {
    expect(normalizePosition("OF/OF")).toBe("OF");
    expect(normalizePosition("RHP/LHP")).toBe("P");
  });

  it("ignores unreadable parts", () => {
    expect(normalizePosition("P/Team Captain")).toBe("P");
    expect(normalizePosition("Team Captain/Volunteer")).toBeNull();
  });
});

describe("groups", () => {
  it("groups the new values", () => {
    expect(positionGroup("P")).toBe("pitcher");
    expect(positionGroup("IF")).toBe("infield");
  });
});
