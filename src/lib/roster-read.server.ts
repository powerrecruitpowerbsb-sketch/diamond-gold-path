/**
 * The one way the crawl reads a roster page.
 *
 * Two readers existed side by side: a structural one, tested against saved
 * pages, and an AI one that the crawl actually called. Everything the tests
 * proved was therefore proving nothing about live collection. This module is the
 * single entry point. The structural reader runs first and its answer stands.
 * The AI reader is a fallback and nothing more: it runs only when the structural
 * reader finds no players at all, never as a merge and never as a tie-break.
 *
 * Which reader produced a roster is returned on every read and stored on the
 * rows, so the fallback has to earn its place on the record rather than by
 * assumption.
 */

import { parseRoster, type PlayerRow, type RosterShape } from "@/lib/roster-extract";
import { canonicalSeasonYear } from "@/lib/season";

export type RosterReader = "structural" | "ai";

/** What the AI fallback returns; injected so this module never imports the crawl. */
export type RosterFallback = (markdown: string) => Promise<{
  players: any[];
  season_year: number | null;
  season_label: string | null;
  dropped: string[];
  diagnostics: { characters: number; chunks: number; likelyRows: number; read: number; dropped: number };
}>;

export type RosterRead = {
  reader: RosterReader;
  players: any[];
  season_year: number | null;
  season_label: string | null;
  /** Names read but not provable on the page. Structural reads never invent, so empty. */
  dropped: string[];
  diagnostics: { characters: number; chunks: number; likelyRows: number; read: number; dropped: number };
  /** The page-shape report, when the structural reader ran. */
  shape: RosterShape | null;
  /** Why the fallback ran, when it did. */
  fallbackReason: string | null;
};

/**
 * Pick the season from the page's own headings.
 *
 * The headings are already collected in page order; the first one inside the
 * live school-year window wins, and the heading's own wording is kept as the
 * label. Nothing about the season needs a model.
 */
export function seasonFromShape(shape: RosterShape): { year: number | null; label: string | null } {
  for (const heading of shape.seasons) {
    const year = canonicalSeasonYear(heading);
    if (year !== null) return { year, label: heading.slice(0, 120) };
  }
  return { year: null, label: shape.seasons[0]?.slice(0, 120) ?? null };
}

/** Roster rows as the review queue and the writer expect them. */
function asPlayers(rows: PlayerRow[]) {
  return rows.map((row) => ({
    name: row.name,
    number: row.number,
    position: row.position,
    class_year: row.class_year,
    height: row.height,
    weight: row.weight,
    bats: row.bats,
    throws: row.throws,
    hometown: row.hometown,
    home_state: row.home_state,
    home_country: row.home_country,
    previous_school: row.previous_school,
    is_transfer: row.is_transfer,
    is_juco_transfer: row.is_juco_transfer,
  }));
}

export async function readRoster(
  markdown: string,
  sport?: string | null,
  options: { fallback?: RosterFallback | null } = {},
): Promise<RosterRead> {
  const shape = parseRoster(markdown, sport);

  if (shape.counts.players > 0) {
    const season = seasonFromShape(shape);
    return {
      reader: "structural",
      players: asPlayers(shape.players),
      season_year: season.year,
      season_label: season.label,
      dropped: [],
      diagnostics: {
        characters: markdown.length,
        chunks: 1,
        likelyRows: shape.counts.rowsConsidered,
        read: shape.counts.players,
        dropped: 0,
      },
      shape,
      fallbackReason: null,
    };
  }

  const fallbackReason =
    shape.flags[0] ?? "the page carries no roster table or cards the structural reader can read";

  if (!options.fallback) {
    return {
      reader: "structural",
      players: [],
      season_year: null,
      season_label: null,
      dropped: [],
      diagnostics: {
        characters: markdown.length,
        chunks: 1,
        likelyRows: shape.counts.rowsConsidered,
        read: 0,
        dropped: 0,
      },
      shape,
      fallbackReason,
    };
  }

  const ai = await options.fallback(markdown);
  return {
    reader: "ai",
    players: ai.players,
    season_year: ai.season_year,
    season_label: ai.season_label,
    dropped: ai.dropped,
    diagnostics: ai.diagnostics,
    shape,
    fallbackReason,
  };
}
