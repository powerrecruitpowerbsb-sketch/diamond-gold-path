/**
 * The one way the crawl reads a coaching-staff page.
 *
 * The crawl had no coach reader at all: it asked a model for two program fields
 * off whatever page it was pointed at, so none of the sport scoping, section
 * attribution or contact separation in the tested reader was reachable. Here the
 * tested reader runs first, and the model's two-field ask is the fallback for a
 * page it finds no staff on at all.
 */

import { extractCoaches, type CoachShape } from "@/lib/coach-extract";

export type CoachReader = "structural" | "ai";

/** The model's two-field ask; injected so this module never imports the crawl. */
export type CoachFallback = (markdown: string) => Promise<any>;

export type CoachRead = {
  reader: CoachReader;
  /** Shaped like the field extractor's reply, so proposals build the same way. */
  extracted: { fields: Record<string, unknown>; confidence: Record<string, number> };
  shape: CoachShape | null;
  fallbackReason: string | null;
};

const RECRUITING_TITLE = /recruit/i;

export async function readCoaches(
  markdown: string,
  sport?: string | null,
  options: { url?: string | null; fallback?: CoachFallback | null } = {},
): Promise<CoachRead> {
  const shape = extractCoaches(markdown, sport, { url: options.url ?? null });

  if (shape.coaches.length) {
    const fields: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};

    // One claimant only. Two rows claiming the head job is exactly the case
    // where a name should not be written without someone looking.
    if (shape.headCoach && !shape.headAmbiguity.length) {
      fields["head_coach_name"] = shape.headCoach.name;
      // A sport-specific page is stronger evidence than a filtered directory.
      confidence["head_coach_name"] = shape.headCoach.sourceKind === "sport_page" ? 0.95 : 0.8;
    }

    const coordinator = shape.coaches.find((coach) => RECRUITING_TITLE.test(coach.title));
    if (coordinator) {
      fields["recruiting_coordinator_name"] = coordinator.name;
      confidence["recruiting_coordinator_name"] = coordinator.sourceKind === "sport_page" ? 0.9 : 0.75;
    }

    return { reader: "structural", extracted: { fields, confidence }, shape, fallbackReason: null };
  }

  const fallbackReason = shape.failure ?? "no staff rows for this sport on the page";
  if (!options.fallback) {
    return { reader: "structural", extracted: { fields: {}, confidence: {} }, shape, fallbackReason };
  }

  const ai = await options.fallback(markdown);
  return {
    reader: "ai",
    extracted: {
      fields: (ai?.fields ?? {}) as Record<string, unknown>,
      confidence: (ai?.confidence ?? {}) as Record<string, number>,
    },
    shape,
    fallbackReason,
  };
}
