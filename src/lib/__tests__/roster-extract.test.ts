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

describe("column labels are not players", () => {
  it("refuses a header row that ran into the first data row", () => {
    const shape = parseRoster(
      "Image | # | Name | Pos. | Ht. | Wt. | Cl. | Hometown | High School | Previous School\n| 0 |\nJackson Davis\n| INF | R/R | 5-7 | 150 | So. | Atlanta, Ga. | The Walker School |",
      "baseball",
    );
    expect(shape.players.map((p) => p.name)).toEqual(["Jackson Davis"]);
  });

  it("refuses a label cell wherever it appears", () => {
    const shape = parseRoster(
      "| No. | Name | Pos. |\n| --- | --- | --- |\n| 3 | Jake Hall | INF |\n| | Full Name | |\n| | Previous School | |",
      "baseball",
    );
    expect(shape.players.map((p) => p.name)).toEqual(["Jake Hall"]);
  });
});

describe("bats and throws", () => {
  it("reads a combined B/T cell, bats first and throws second", () => {
    const page = `
| # | Name | Pos. | B/T | Ht. | Cl. | Hometown |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | Ella Moore | OF | L/R | 5-6 | JR | Tampa, FL |
| 5 | Nia Brooks | C | R/R | 5-8 | SO | Mesa, AZ |
`;
    const shape = parseRoster(page, "softball");
    expect(shape.players.map((p) => [p.name, p.bats, p.throws])).toEqual([
      ["Ella Moore", "L", "R"],
      ["Nia Brooks", "R", "R"],
    ]);
    expect(shape.columns.bats).toBe("published");
    expect(shape.columns.throws).toBe("published");
    expect(shape.parserDefects).toEqual([]);
  });

  it("stores a switch hitter as S, whether the page writes S or B", () => {
    const page = `
| # | Name | Pos. | B/T | Cl. |
| --- | --- | --- | --- | --- |
| 1 | Chase Williams | OF | S/R | SR |
| 2 | Ty Marsh | INF | B/L | JR |
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players.map((p) => p.bats)).toEqual(["S", "S"]);
    expect(shape.players.map((p) => p.throws)).toEqual(["R", "L"]);
  });

  it("reads separate Bats and Throws columns without mistaking a hand for a position", () => {
    const page = `
| # | Name | Pos. | Bats | Throws | Cl. |
| --- | --- | --- | --- | --- | --- |
| 9 | Rae Dalton | 1B | L | R | SO |
| 11 | Kim Prater | RHP | R | R | FR |
`;
    const shape = parseRoster(page, "softball");
    expect(shape.players.map((p) => [p.position, p.bats, p.throws])).toEqual([
      ["1B", "L", "R"],
      ["RHP", "R", "R"],
    ]);
  });

  it("reads a combined cell under an unnamed column, as Stetson prints it", () => {
    const page = `
| Full Name | # | Hometown / High School | Pos. | Ht. | Academic Year | Custom Field 1 |
| --- | --- | --- | --- | --- | --- | --- |
| Marta Ruiz | 1 | Marianna, FL / Marianna High School | LHP | 5-7 | So. | L/L |
`;
    const shape = parseRoster(page, "softball");
    expect(shape.players[0]).toMatchObject({ position: "LHP", bats: "L", throws: "L" });
    expect(shape.columns.bats).toBe("published");
  });

  it("leaves both empty when the page does not publish them, and calls no defect", () => {
    const shape = parseRoster(TABLE, "baseball");
    expect(shape.counts.withBats).toBe(0);
    expect(shape.columns.bats).toBe("not_published");
    expect(shape.parserDefects).toEqual([]);
  });

  it("refuses a nonsense second letter rather than guessing a throwing arm", () => {
    const page = `
| # | Name | Pos. | B/T | Cl. |
| --- | --- | --- | --- | --- |
| 6 | Pat Vance | OF | R/S | JR |
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players[0]!.bats).toBeNull();
    expect(shape.players[0]!.throws).toBeNull();
  });

  it("reads labelled bats and throws off a card page", () => {
    const page = `
Jersey Number 21
Marcus Hale
Right-Handed Pitcher
Bats: L Throws: R
Academic Year Jr.
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players[0]).toMatchObject({ name: "Marcus Hale", bats: "L", throws: "R" });
  });
  it("fills the batting side from the table when the card block omits it", () => {
    // Florida Atlantic prints a label-style card block with no bats/throws AND a
    // full table below that carries them. Taking one pass whole lost the hands.
    const page = `
Jersey Number 1
Danny Baez
Position OF Academic Year Sr. Height 6' 1'' Weight 200 lbs
Jersey Number 2
Brett Patten
Position OF Academic Year Jr. Height 6' 2'' Weight 200 lbs
| Pos.
| Ht.
| Wt.
| B/T
| Academic Year
| Hometown
1 | Danny Baez
| OF | 6' 1'' | 200 | L/R | Sr. | Oviedo, Fla.
2 | Brett Patten
| OF | 6' 2'' | 200 | L/L | Jr. | Manasquan, N.J.
`;
    const shape = parseRoster(page, "baseball");
    const baez = shape.players.find((player) => player.name === "Danny Baez")!;
    expect(baez.bats).toBe("L");
    expect(baez.throws).toBe("R");
    expect(baez.bats_raw).toBe("L/R");
  });
  it("reads a page that prints the jersey number and the name on one line", () => {
    // San Diego State: "48 Zane Kelly", then the class and size on one line,
    // then the position and hometown sharing a line.
    const page = `
2026 Baseball Roster
48 Zane Kelly
Senior 6 2 200 lbs
RHP Las Vegas, Nev. Faith Lutheran HS
12 Jabin Trosky
Freshman 6 0 170 lbs
IF Carmel, Calif. Palma HS
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players).toHaveLength(2);
    expect(shape.players[0]).toMatchObject({
      name: "Zane Kelly",
      number: "48",
      position: "RHP",
      class_year: "SR",
      height: "6-2",
      weight: "200",
      home_state: "NV",
    });
    expect(shape.players[1]).toMatchObject({ name: "Jabin Trosky", position: "IF", home_state: "CA" });
  });

  it("reads a page that prints one value per line between pipes", () => {
    // Raritan Valley: every token on its own line, the name printed twice, and
    // labels ("Cl.:") separated from their value by a pipe.
    const page = `
2026 Baseball Roster
44
|
Teodoro
Garcia
Teodoro
Garcia
|
Pos.:
2B/SS
|
Cl.:
So
|
Ht.:
5'8"
|
Wt.:
140
|
Hometown/High School:
Kendall Park, NJ
/
South Brunswick HS
1
|
Nico
Pachamango
Nico
Pachamango
|
Pos.:
RHP
|
Cl.:
So
|
Ht.:
5'6"
|
Wt.:
160
|
Hometown/High School:
Hazlet, NJ
/
Raritan HS
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players).toHaveLength(2);
    expect(shape.players[0]).toMatchObject({
      name: "Teodoro Garcia",
      number: "44",
      position: "2B/SS",
      class_year: "SO",
      weight: "140",
      home_state: "NJ",
    });
  });
  it("reads a card that prints the name above the number and spells the position out", () => {
    // UTSA: name, then the jersey number, then "Outfielder 5 9 180 lbs Freshman",
    // then the hometown and high school on one line.
    const page = `
Baseball Roster
Damian Montanez
1
Outfielder 5 9 180 lbs Freshman
Killeen, Texas Shoemaker HS
Jordan Ballin
2
Infielder 5 9 175 lbs Sophomore
Boerne, Texas Boerne Champion HS
`;
    const shape = parseRoster(page, "baseball");
    expect(shape.players).toHaveLength(2);
    expect(shape.players[0]).toMatchObject({
      name: "Damian Montanez",
      number: "1",
      position: "OUTFIELDER",
      class_year: "FR",
      height: "5-9",
      weight: "180",
      home_state: "TX",
    });
  });

  it("recognises Junior and Senior spelled out on a card", () => {
    const page = `
Baseball Roster
1
Ann Lee
Infielder 5 6 140 lbs Junior
2
Bo Ray
Outfielder 5 8 150 lbs Senior
`;
    expect(parseRoster(page, "softball").players).toMatchObject([{ class_year: "JR" }, { class_year: "SR" }]);
  });

  it("reads a table row the page broke across three lines with an empty first cell", () => {
    const page = [
      "2026 Baseball Roster",
      "# | Full Name | C | Pos. | B/T | Ht. | Wt. | Academic Year | Hometown | High School | Major",
      "0 |",
      "Nick Bartalini",
      "| | MIF/RHP | R/R | 5-9 | 170 | Jr. | Reading, Mass. | Reading Memorial High School | Finance",
    ].join("\n");
    expect(parseRoster(page, "baseball").players).toMatchObject([
      { name: "Nick Bartalini", number: "0", position: "MIF/RHP", class_year: "JR", bats: "R", throws: "R", home_state: "MA" },
    ]);
  });

  it("reads a class year printed at the end of the hometown line", () => {
    const page = [
      "Softball Roster",
      "Kennedy Ariail",
      "#1",
      "OF 5 6",
      "Cumming, Ga. South Forsyth HS Sr.",
    ].join("\n");
    expect(parseRoster(page, "softball").players).toMatchObject([
      { name: "Kennedy Ariail", number: "1", position: "OF", class_year: "SR", home_state: "GA" },
    ]);
  });

  it("keeps an abbreviated state, a numbered position, and one player's values inside their own block", () => {
    const page = [
      "Softball Roster",
      "Mcartney Harrington",
      "#4",
      "C/3B 5 7",
      "Taylorsville, S.C. South Caldwell HS Fr.",
      "Marian Collins",
      "#5",
      "INF 5 11",
      "Marietta, Ga. Mount Paran Christian School Jr.",
    ].join("\n");
    expect(parseRoster(page, "softball").players).toMatchObject([
      { name: "Mcartney Harrington", position: "C/3B", class_year: "FR", hometown: "Taylorsville, S.C.", home_state: "SC" },
      { name: "Marian Collins", position: "INF", class_year: "JR", home_state: "GA" },
    ]);
  });
});
