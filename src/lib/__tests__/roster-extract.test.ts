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

describe("page furniture is never a coach", () => {
  it("refuses a consent-banner row", () => {
    const shape = extractCoaches(
      "| Close consent manager | Head Coach |\n| Rich Wallace | Head Coach |",
      "baseball",
      { url: "https://ucfknights.com/sports/baseball/coaches" },
    );
    expect(shape.coaches.map((c) => c.name)).toEqual(["Rich Wallace"]);
    expect(shape.headCoach?.name).toBe("Rich Wallace");
  });

  it("refuses a nav link sitting next to a bare title", () => {
    const shape = extractCoaches(
      "[Skip To Main Content](/#main)\n\nHead Coach\n\n[All Videos](/videos)",
      "baseball",
      { url: "https://x.edu/sports/baseball/coaches" },
    );
    expect(shape.coaches).toHaveLength(0);
  });

  it("keeps a real name on the line above a bare title in the same block", () => {
    const shape = extractCoaches("Rich Wallace\nHead Coach", "baseball", {
      url: "https://ucfknights.com/sports/baseball/coaches",
    });
    expect(shape.headCoach?.name).toBe("Rich Wallace");
  });
});

describe("titles, emails and phone numbers", () => {
  it("keeps the email out of the title and stores it as its own field", () => {
    const shape = extractCoaches("| Hannah Smith | Head Coach hannahsm@usf.edu (813) 974-1000 |", "softball", {
      url: "https://gousfbulls.com/sports/softball/coaches",
    });
    expect(shape.headCoach?.title).toBe("Head Coach");
    expect(shape.headCoach?.email).toBe("hannahsm@usf.edu");
    expect(shape.headCoach?.phone).toBe("(813) 974-1000");
  });
});

describe("who is actually the head coach", () => {
  it("does not promote an associate head coach listed above the head coach", () => {
    const shape = extractCoaches(
      "| Norberto Lopez | Associate Head Coach |\n| Rich Wallace | Head Coach |",
      "baseball",
      { url: "https://ucfknights.com/sports/baseball/coaches" },
    );
    expect(shape.headCoach?.name).toBe("Rich Wallace");
    expect(shape.assistants.map((c) => c.name)).toContain("Norberto Lopez");
    expect(shape.headAmbiguity).toHaveLength(0);
  });

  it("accepts an interim head coach", () => {
    const shape = extractCoaches("| Mary Lane | Interim Head Coach |", "softball", {
      url: "https://x.edu/sports/softball/coaches",
    });
    expect(shape.headCoach?.name).toBe("Mary Lane");
  });

  it("reports the ambiguity rather than guessing between two plain head coaches", () => {
    const shape = extractCoaches(
      "| Rich Wallace | Head Coach |\n| Norberto Lopez | Head Coach |",
      "baseball",
      { url: "https://ucfknights.com/sports/baseball/coaches" },
    );
    expect(shape.headCoach).toBeNull();
    expect(shape.headAmbiguity.map((c) => c.name)).toEqual(["Rich Wallace", "Norberto Lopez"]);
    expect(shape.failure).toMatch(/head coach title/i);
  });
});

describe("surnames are not page furniture", () => {
  const surnames = [
    "Hall", "Marshall", "Small", "Wall", "Ball", "Randall",
    "Kendall", "Crandall", "Whitmore", "Sizemore", "Newsome", "Storey",
  ];

  it("keeps players whose surname contains a furniture word", () => {
    const rows = surnames.map((last, i) => `| ${i + 1} | Jake ${last} | INF | Jr. |`).join("\n");
    const shape = parseRoster(`| No. | Name | Pos. | Cl. |\n| --- | --- | --- | --- |\n${rows}`, "baseball");
    expect(shape.players).toHaveLength(surnames.length);
    expect(shape.furniture).toHaveLength(0);
    for (const last of surnames) {
      expect(shape.players.map((p) => p.name)).toContain(`Jake ${last}`);
    }
  });

  it("still drops a navigation row", () => {
    const shape = parseRoster(
      "| No. | Name | Pos. |\n| --- | --- | --- |\n| 3 | Jake Hall | INF |\n- [Full Schedule](/schedule)\n| | [Composite Schedule](/composite) | |",
      "baseball",
    );
    expect(shape.players.map((p) => p.name)).toEqual(["Jake Hall"]);
  });
});

describe("rosters printed Last, First", () => {
  it("reads them and normalises to First Last", () => {
    const shape = parseRoster(
      "| No. | Name | Pos. | Cl. |\n| --- | --- | --- | --- |\n| 12 | Smith, John | RHP | Sr. |\n| 5 | O'Brien, Pat | C | Fr. |",
      "baseball",
    );
    expect(shape.players.map((p) => p.name)).toEqual(["John Smith", "Pat O'Brien"]);
  });
});

describe("jersey numbers and hometowns", () => {
  it("accepts a three-digit jersey number", () => {
    const shape = parseRoster(
      "| No. | Name | Pos. |\n| --- | --- | --- |\n| 100 | Jake Hall | INF |\n| 0 | Ty Moore | OF |",
      "baseball",
    );
    expect(shape.players.map((p) => p.number)).toEqual(["100", "0"]);
  });

  it("accepts a hometown with no state when it sits under the hometown column", () => {
    const shape = parseRoster(
      "| No. | Name | Pos. | Hometown |\n| --- | --- | --- | --- |\n| 7 | Kenji Tanaka | RHP | Osaka |",
      "baseball",
    );
    expect(shape.players[0]?.hometown).toBe("Osaka");
  });
});
