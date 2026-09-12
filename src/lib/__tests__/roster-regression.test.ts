/**
 * Regression guard on extraction.
 *
 * The row-origin rule that keeps navigation out of a roster was tuned against a
 * sample of eleven schools. A future change could quietly cut rosters at schools
 * nobody looks at, and nothing would say so. These tests hold the line without
 * reading a single live page: real pages captured on 2026-09-12 sit in
 * fixtures/, and the player count each program produced in that run is recorded
 * in fixtures/roster-baseline.json.
 *
 * A program's count may not fall more than 10% below its baseline. When a change
 * is meant to lower a count — a page that really was carrying rows it should not
 * — add the program to DELIBERATE_DROPS with the reason. An unexplained drop
 * fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseRoster } from "@/lib/roster-extract";
import { extractCoaches } from "@/lib/coach-extract";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

const baseline = JSON.parse(fixture("roster-baseline.json")) as {
  capturedOn: string;
  programs: { school: string; sport: string; players: number }[];
};

const countFor = (school: string, sport: string) =>
  baseline.programs.find((p) => p.school === school && p.sport === sport)?.players ?? 0;

/** school|sport → why a drop below the 10% band is expected. Empty by design. */
const DELIBERATE_DROPS: Record<string, string> = {
  "Eckerd College|baseball":
    "52 -> 51 on 2026-09-12: the header row ran into the first data row and 'High School' was " +
    "counted as a player. Column labels are now refused.",
};


const TOLERANCE = 0.9;

/** Pages we hold offline, each a different real layout. */
const PAGES = [
  {
    school: "University of Central Florida",
    sport: "baseball" as const,
    file: "ucf-baseball-roster.txt",
    layout: "table whose rows are split across lines",
  },
  {
    school: "Eckerd College",
    sport: "baseball" as const,
    file: "eckerd-baseball-roster.txt",
    layout: "image-first card/table hybrid",
  },
  {
    school: "Stetson University",
    sport: "softball" as const,
    file: "stetson-softball-roster.txt",
    layout: "Full Name column, hometown merged with high school",
  },
];

describe("saved rosters keep their player counts", () => {
  for (const page of PAGES) {
    it(`${page.school} ${page.sport} (${page.layout})`, () => {
      const found = parseRoster(fixture(page.file), page.sport).counts.players;
      const expected = countFor(page.school, page.sport);
      expect(expected).toBeGreaterThan(0);
      const note = DELIBERATE_DROPS[`${page.school}|${page.sport}`];
      if (note) return;
      expect(
        found,
        `${page.school} ${page.sport} read ${found} players against a baseline of ${expected}. ` +
          "If this drop is intended, add the program to DELIBERATE_DROPS with the reason.",
      ).toBeGreaterThanOrEqual(Math.floor(expected * TOLERANCE));
    });
  }
});

describe("the baseline itself", () => {
  it("holds the twenty programs that produced rows in the preview run", () => {
    // The 20-school preview read rosters at 11 schools; the rest were blocked,
    // retired or had no address. Those cannot be guarded without a saved page.
    expect(baseline.programs).toHaveLength(20);
    expect(new Set(baseline.programs.map((p) => p.school)).size).toBe(11);
  });


  it("records a count for every program in it", () => {
    for (const program of baseline.programs) expect(program.players).toBeGreaterThan(0);
  });
});

describe("a directory-sourced coach page, offline", () => {
  const shape = extractCoaches(fixture("lsu-softball-staff-directory.txt"), "softball", {
    url: "https://lsusports.net/staff-directory/",
  });

  it("reads it as a department directory", () => {
    expect(shape.pageKind).toBe("department_directory");
  });

  it("names the softball head coach and only softball staff", () => {
    expect(shape.headCoach?.name).toBe("Beth Torina");
    expect(shape.coaches.length).toBeGreaterThanOrEqual(5);
    expect(shape.coaches.every((c) => c.sportOnPage === "softball")).toBe(true);
  });

  it("keeps every other sport's staff out", () => {
    expect(shape.counts.otherSport).toBeGreaterThan(50);
  });
});
