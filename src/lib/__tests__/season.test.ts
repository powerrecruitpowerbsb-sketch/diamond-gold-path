import { describe, expect, it } from "vitest";

import {
  acceptableSeasonYears,
  canonicalSeasonYear,
  currentSeasonYear,
  isCurrentSeason,
  seasonLabel,
} from "@/lib/season";

const NOV_2026 = new Date("2026-11-15T12:00:00Z");
const MARCH_2027 = new Date("2027-03-15T12:00:00Z");

describe("school-year seasons", () => {
  it("treats the 2026-27 school year as one season from either side of New Year", () => {
    expect(currentSeasonYear(NOV_2026)).toBe(2027);
    expect(currentSeasonYear(MARCH_2027)).toBe(2027);
  });

  it("reads every wording of the same season as one season", () => {
    for (const wording of ["2026-27", "2026-2027", "2027", "2026-27 Baseball Roster"]) {
      expect(canonicalSeasonYear(wording, NOV_2026)).toBe(2027);
    }
  });

  it("rejects archive years and stray numbers", () => {
    expect(canonicalSeasonYear("2002", NOV_2026)).toBeNull();
    expect(canonicalSeasonYear("1953", NOV_2026)).toBeNull();
    expect(canonicalSeasonYear(12, NOV_2026)).toBeNull();
    expect(canonicalSeasonYear("", NOV_2026)).toBeNull();
  });

  it("accepts the current season and the one just finished", () => {
    expect(acceptableSeasonYears(NOV_2026)).toEqual([2027, 2026]);
  });

  it("shows seasons the way people say them", () => {
    expect(seasonLabel(2027)).toBe("2026-27");
    expect(seasonLabel(null)).toBe("—");
    expect(isCurrentSeason(2027, NOV_2026)).toBe(true);
    expect(isCurrentSeason(2026, NOV_2026)).toBe(false);
  });
});
