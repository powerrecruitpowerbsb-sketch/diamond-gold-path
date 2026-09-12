/**
 * The path the CRAWL takes, tested — not just the reader in isolation.
 *
 * Two readers were able to coexist for weeks precisely because nothing tested
 * this path: the structural reader had fixtures, the crawl called something else,
 * and both were green. These tests feed the saved pages through the crawl's own
 * entry points with the AI fallback replaced by a spy, so a page that reads
 * structurally must never reach a model, and a change that quietly re-routes the
 * crawl back to the model fails here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { readRoster, seasonFromShape } from "@/lib/roster-read.server";
import { readCoaches } from "@/lib/coach-read.server";
import { parseRoster } from "@/lib/roster-extract";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

const PAGES = [
  { school: "University of Central Florida", sport: "baseball" as const, file: "ucf-baseball-roster.txt" },
  { school: "Eckerd College", sport: "baseball" as const, file: "eckerd-baseball-roster.txt" },
  { school: "Stetson University", sport: "softball" as const, file: "stetson-softball-roster.txt" },
];

describe("the crawl's roster entry point", () => {
  for (const page of PAGES) {
    it(`${page.school} ${page.sport} reads structurally, without the model`, async () => {
      const fallback = vi.fn();
      const read = await readRoster(fixture(page.file), page.sport, { fallback: fallback as any });

      expect(read.reader).toBe("structural");
      expect(fallback).not.toHaveBeenCalled();
      // The same answer the reader's own fixtures assert.
      expect(read.players.length).toBe(parseRoster(fixture(page.file), page.sport).counts.players);
      expect(read.players.length).toBeGreaterThan(10);
      expect(read.shape).not.toBeNull();
      expect(read.fallbackReason).toBeNull();
    });
  }

  it("carries the fields the crawl writes", async () => {
    const read = await readRoster(fixture("stetson-softball-roster.txt"), "softball");
    const player = read.players[0] as Record<string, unknown>;
    for (const field of [
      "name", "number", "position", "class_year", "bats", "throws",
      "hometown", "home_state", "home_country", "is_transfer", "is_juco_transfer",
    ]) {
      expect(Object.keys(player)).toContain(field);
    }
  });

  it("falls back to the model only when nothing structural is there, and says why", async () => {
    const fallback = vi.fn(async () => ({
      players: [{ name: "Sam Reed" }],
      season_year: 2026,
      season_label: "2026 Baseball Roster",
      dropped: [],
      diagnostics: { characters: 40, chunks: 1, likelyRows: 0, read: 1, dropped: 0 },
    }));
    const read = await readRoster("Baseball roster coming soon.", "baseball", { fallback });

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(read.reader).toBe("ai");
    expect(read.players).toHaveLength(1);
    expect(read.fallbackReason).toBeTruthy();
  });

  it("reads a page with no roster as empty when no fallback is offered", async () => {
    const read = await readRoster("Baseball roster coming soon.", "baseball");
    expect(read.reader).toBe("structural");
    expect(read.players).toHaveLength(0);
  });

  it("picks the season from the page's own heading, with no model involved", () => {
    const shape = parseRoster(
      "## 2026-27 Baseball Roster\n| No. | Name | Pos. |\n| --- | --- | --- |\n| 3 | Ty Barnes | RHP |",
      "baseball",
    );
    const season = seasonFromShape(shape);
    expect(season.year).toBe(2027);
    expect(season.label).toMatch(/2026-27/);
  });
});

describe("the crawl's coach entry point", () => {
  it("names the softball head coach off a directory without the model", async () => {
    const fallback = vi.fn();
    const read = await readCoaches(fixture("lsu-softball-staff-directory.txt"), "softball", {
      url: "https://lsusports.net/staff-directory/",
      fallback: fallback as any,
    });

    expect(read.reader).toBe("structural");
    expect(fallback).not.toHaveBeenCalled();
    expect(read.extracted.fields["head_coach_name"]).toBe("Beth Torina");
  });

  it("proposes no coach name when two rows claim the head job", async () => {
    const read = await readCoaches(
      "| Ann Diaz | Head Coach |\n| Beth Ray | Head Softball Coach |",
      "softball",
      { url: "https://example.edu/softball/coaches" },
    );
    expect(read.extracted.fields["head_coach_name"]).toBeUndefined();
  });

  it("falls back to the model only on a page with no staff at all", async () => {
    const fallback = vi.fn(async () => ({ fields: { head_coach_name: "Guessed Name" }, confidence: {} }));
    const read = await readCoaches("Tickets, parking and directions.", "baseball", {
      url: "https://example.edu/baseball/coaches",
      fallback,
    });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(read.reader).toBe("ai");
    expect(read.fallbackReason).toBeTruthy();
  });
});

describe("the crawl still routes through the entry points", () => {
  const crawl = readFileSync(join(__dirname, "..", "ingest.server.ts"), "utf8");

  it("calls the roster and coach entry points", () => {
    expect(crawl).toMatch(/await readRoster\(/);
    expect(crawl).toMatch(/await readCoaches\(/);
  });

  it("only ever names the AI readers as a fallback", () => {
    for (const call of crawl.matchAll(/await (extractRoster|extractProgramFields)\(/g)) {
      // One legitimate direct use remains: the coaching page falls back to the
      // field extractor. Everything else must go through the entry points.
      expect(call[1]).toBe("extractProgramFields");
    }
    expect(crawl).toMatch(/fallback: extractRoster/);
    expect(crawl).toMatch(/fallback: extractProgramFields/);
  });

  it("guards the composition summary before writing it", () => {
    const snapshot = crawl.indexOf('.from("roster_snapshots").insert(');
    const guard = crawl.indexOf("checkRosterSource(supabase, programId, target.url)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(snapshot);
    expect(crawl).toMatch(/suspect: suspicious/);
  });
});
