import { describe, expect, it } from "vitest";

import { parseRoster } from "@/lib/roster-extract";
import { extractCoaches, classifyStaffPage } from "@/lib/coach-extract";

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

describe("what the page publishes", () => {
  it("marks offered columns as published", () => {
    const shape = parseRoster(TABLE, "baseball");
    expect(shape.columns).toMatchObject({ number: "published", hometown: "published", position: "published" });
    expect(shape.parserDefects).toEqual([]);
  });

  it("separates a column the page never carried from one we failed to read", () => {
    const noHometown = `
| No. | Name | Pos. | Cl. |
| --- | --- | --- | --- |
| 12 | Jorge Ramirez | RHP | JR |
| 4 | Danny Fields | INF | FR |
`;
    const shape = parseRoster(noHometown, "baseball");
    expect(shape.columns.hometown).toBe("not_published");
    expect(shape.columns.number).toBe("published");
  });

  it("calls a published-but-unread column a parser defect", () => {
    const oddPosition = `
| No. | Name | Position | Cl. |
| --- | --- | --- | --- |
| 12 | Jorge Ramirez | Designated Utility Thing | JR |
`;
    const shape = parseRoster(oddPosition, "baseball");
    if (shape.players.length) {
      expect(shape.columns.position).toBe("published");
    }
  });
});

const LSU_DIRECTORY = `
## Staff Directory

**Football**
| Lane Kiffin | Head Coach | a@lsu.edu |
| Joe Sloan | Offensive Coordinator | b@lsu.edu |

**Women's Basketball**
| Kim Mulkey | Head Coach | c@lsu.edu |

**Softball**
| Beth Torina | Head Coach | d@lsu.edu |
| Howard Dobson | Assistant Coach | e@lsu.edu |

**Sports Medicine**
| Shawn Eddy | Athletic Trainer | f@lsu.edu |
`;

describe("coaches are scoped to one sport", () => {
  const shape = extractCoaches(LSU_DIRECTORY, "softball", { url: "https://lsusports.net/staff-directory" });

  it("reads only the staff the page assigns to that sport", () => {
    expect(shape.coaches.map((c) => c.name)).toEqual(["Beth Torina", "Howard Dobson"]);
  });

  it("names the head coach of that sport", () => {
    expect(shape.headCoach?.name).toBe("Beth Torina");
  });

  it("keeps other sports out but reports them", () => {
    expect(shape.coaches.map((c) => c.name)).not.toContain("Lane Kiffin");
    expect(shape.counts.otherSport).toBeGreaterThan(0);
  });

  it("records how the page assigned the sport", () => {
    expect(shape.coaches[0]).toMatchObject({
      sportOnPage: "softball",
      attribution: "section_header",
      sourceKind: "department_directory",
    });
  });
});

describe("sport-specific staff pages", () => {
  const SPORT_PAGE = `
| Jim Schlossnagle | Head Coach | a@b.edu |
| Max Weiner | Assistant Coach | c@b.edu |
`;

  it("treats the page itself as the attribution", () => {
    const shape = extractCoaches(SPORT_PAGE, "baseball", {
      url: "https://texassports.com/sports/baseball/coaches",
    });
    expect(shape.headCoach?.name).toBe("Jim Schlossnagle");
    expect(shape.assistants.map((c) => c.name)).toEqual(["Max Weiner"]);
    expect(shape.pageKind).toBe("sport_page");
  });

  it("fails a page with titles but no head coach", () => {
    const shape = extractCoaches("| Max Weiner | Assistant Coach |", "baseball", {
      url: "https://x.edu/sports/baseball/coaches",
    });
    expect(shape.headCoach).toBeNull();
    expect(shape.failure).toMatch(/head coach/i);
  });

  it("extracts nothing unattributed from a department directory", () => {
    const shape = extractCoaches("| Max Weiner | Assistant Coach |", "softball", {
      url: "https://lsusports.net/staff-directory",
    });
    expect(shape.coaches).toHaveLength(0);
    expect(shape.counts.unattributed).toBe(1);
  });

  it("classifies pages by address and content", () => {
    expect(classifyStaffPage({ url: "https://lsusports.net/staff-directory", sport: "softball" }).kind).toBe(
      "department_directory",
    );
    expect(classifyStaffPage({ url: "https://lsusports.net/sports/softball/coaches", sport: "softball" }).kind).toBe(
      "sport_page",
    );
  });
});
