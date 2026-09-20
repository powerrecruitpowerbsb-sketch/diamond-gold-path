import { describe, expect, it } from "vitest";

import { athleticsOrigin, coachPathCandidates } from "@/lib/coach-path";

describe("athletics origin", () => {
  it("keeps only the school's own host", () => {
    expect(athleticsOrigin("https://kuathletics.com/sports/baseball/roster")).toBe("https://kuathletics.com");
  });

  it("accepts an address written without a scheme", () => {
    expect(athleticsOrigin("gobearcats.com")).toBe("https://gobearcats.com");
  });

  it("returns nothing when there is no usable address", () => {
    expect(athleticsOrigin("")).toBeNull();
    expect(athleticsOrigin(null)).toBeNull();
    expect(athleticsOrigin("not a website")).toBeNull();
  });
});

describe("coaching page candidates", () => {
  it("offers the common staff pages on the school's own host", () => {
    const list = coachPathCandidates("https://kuathletics.com/sports/baseball", "baseball");
    expect(list[0]).toBe("https://kuathletics.com/sports/baseball/coaches");
    expect(list.every((url) => url.startsWith("https://kuathletics.com/"))).toBe(true);
  });

  it("covers the short softball slug schools actually use", () => {
    const list = coachPathCandidates("https://gostetson.com", "softball", { limit: 8 });
    expect(list).toContain("https://gostetson.com/sports/sball/coaches");
  });

  it("never re-offers an address already tried", () => {
    const stored = "https://kuathletics.com/sports/baseball/coaches";
    const list = coachPathCandidates(stored, "baseball", { exclude: [stored] });
    expect(list).not.toContain(stored);
    expect(list.length).toBeGreaterThan(0);
  });

  it("offers nothing for an unknown sport or a missing address", () => {
    expect(coachPathCandidates("https://kuathletics.com", "lacrosse")).toEqual([]);
    expect(coachPathCandidates("", "baseball")).toEqual([]);
  });
});
