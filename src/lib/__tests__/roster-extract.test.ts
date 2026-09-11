import { describe, expect, it } from "vitest";

import { parseRoster } from "@/lib/roster-extract";
import { extractCoaches, looksLikeDepartmentDirectory } from "@/lib/coach-extract";

const TABLE = `
## 2026 Baseball Roster
| No. | Name | Pos. | Cl. | Ht. | Wt. | Hometown |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | Jorge Ramirez | RHP | JR | 6-2 | 195 | Tampa, FL |
| 4 | Danny Fields | INF | FR | 5-11 | 180 | Omaha, NE |
| 7 | Sam Carter | OF | SO | 6-0 | 190 | Austin, TX |
| Roster | | | | | | |
| Ticket Office | | | | | | |
| Chris Nolan | | | | | | |
`;

describe("roster rows", () => {
  const shape = parseRoster(TABLE, "baseball");

  it("keeps only rows that are actually players", () => {
    expect(shape.players.map((p) => p.name)).toEqual(["Jorge Ramirez", "Danny Fields", "Sam Carter"]);
  });

  it("captures number, position, class, size and hometown", () => {
    expect(shape.players[0]).toMatchObject({
      number: "12",
      position: "RHP",
      class_year: "JR",
      height: "6-2",
      weight: "195",
      hometown: "Tampa, FL",
    });
  });

  it("drops a bare name and reports it", () => {
    expect(shape.bareNames).toContain("Chris Nolan");
  });

  it("reports attribute counts alongside the total", () => {
    expect(shape.counts).toMatchObject({ players: 3, withNumber: 3, withPosition: 3, withClass: 3 });
  });

  it("flags a merged roster by duplicate names, not by size", () => {
    const merged = parseRoster(TABLE + TABLE.split("\n").slice(3).join("\n"), "baseball");
    expect(merged.counts.duplicates).toBeGreaterThan(0);
    expect(merged.flags.join(" ")).toMatch(/season/i);
  });

  it("flags a parse that found no table", () => {
    expect(parseRoster("Baseball roster coming soon.", "baseball").flags.join(" ")).toMatch(/no player rows/i);
  });
});

const STAFF = `
| Name | Title | Email |
| --- | --- | --- |
| Jim Schlossnagle | Head Coach | a@b.edu |
| Max Weiner | Assistant Coach | c@b.edu |
| Bo Ray | Pitching Coach | d@b.edu |
`;

describe("coaches", () => {
  it("names the head coach", () => {
    const shape = extractCoaches(STAFF, "baseball");
    expect(shape.headCoach?.name).toBe("Jim Schlossnagle");
    expect(shape.assistants.map((c) => c.name)).toEqual(["Max Weiner", "Bo Ray"]);
  });

  it("fails a page with titles but no head coach", () => {
    const shape = extractCoaches("| Max Weiner | Assistant Coach |", "baseball");
    expect(shape.headCoach).toBeNull();
    expect(shape.failure).toMatch(/head coach/i);
  });

  it("rejects a department-wide directory in a sport field", () => {
    expect(
      looksLikeDepartmentDirectory({ url: "https://lsusports.net/staff-directory", sport: "softball" }).ok,
    ).toBe(false);
    expect(
      looksLikeDepartmentDirectory({ url: "https://lsusports.net/sports/softball/coaches", sport: "softball" }).ok,
    ).toBe(true);
  });
});
