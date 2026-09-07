import { describe, expect, it } from "vitest";

import { COACH_CASES, coachGuardSelfCheck } from "@/lib/coach-selfcheck";

describe("coach safety self-check", () => {
  it("passes every known-answer case", () => {
    const result = coachGuardSelfCheck();
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.total).toBe(COACH_CASES.length);
  });

  it("covers both accepting and refusing cases", () => {
    expect(COACH_CASES.some((item) => item.expect === "accept")).toBe(true);
    expect(COACH_CASES.filter((item) => item.expect === "refuse").length).toBeGreaterThan(4);
  });
});
