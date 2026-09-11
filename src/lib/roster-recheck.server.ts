/**
 * Server-only roster re-check. Re-reads a program's own roster page and keeps
 * only players whose names are actually written on it, so rosters padded out with
 * invented players get replaced by the proven list.
 */

import { extractRoster, scrape } from "@/lib/ingest.server";
import { rosterKeepable } from "@/lib/data-quality";
import { replaceRoster } from "@/lib/review.server";

export type RecheckRow = {
  key: string;
  school: string;

  sport: string;
  season: number | null;
  before: number;
  read: number;
  kept: number;
  dropped: number;
  outcome: "replaced" | "would_replace" | "unchanged" | "requeued" | "failed";
  detail: string | null;
};

export type RecheckResult = {
  applied: boolean;
  groupsFound: number;
  checked: number;
  replaced: number;
  droppedPlayers: number;
  rows: RecheckRow[];
};

/**
 * Put a program back in line for a fresh pull, without duplicating a job that is
 * already waiting for it.
 */
async function requeueProgram(supabase: any, programId: string) {
  const { data: existing } = await supabase
    .from("ingest_queue")
    .select("id, status")
    .eq("program_id", programId)
    .eq("stage", "program_scrape")
    .limit(1);
  const row = ((existing ?? []) as any[])[0];
  if (row) {
    await supabase
      .from("ingest_queue")
      .update({ status: "pending", attempts: 0, leased_at: null, last_error: null })
      .eq("id", row.id);
    return;
  }
  await supabase.from("ingest_queue").insert({
    program_id: programId,
    stage: "program_scrape",
    status: "pending",
  });
}

export async function recheckRosterSizes(
  supabase: any,
  options: {
    apply: boolean;
    min?: number;
    max?: number;
    limit?: number;
    budgetMs?: number;
    /** "programId:season" keys already looked at, so repeat passes move on. */
    skipKeys?: string[];
  },
): Promise<RecheckResult> {
  const min = options.min ?? 50;
  const max = options.max ?? 1000;
  const limit = options.limit ?? 12;
  const budgetMs = options.budgetMs ?? 25_000;
  const startedAt = Date.now();

  const { data: groups, error } = await supabase.rpc("roster_size_groups", {
    _min: min,
    _max: max,
  });
  if (error) throw new Error(error.message);

  const skip = new Set(options.skipKeys ?? []);
  const all = ((groups ?? []) as { program_id: string; season_year: number | null; player_count: number }[]).filter(
    (group) => !skip.has(`${group.program_id}:${group.season_year ?? ""}`),
  );
  const rows: RecheckRow[] = [];
  let replaced = 0;
  let droppedPlayers = 0;

  for (const group of all) {
    if (rows.length >= limit || Date.now() - startedAt > budgetMs) break;


    const { data: program } = await supabase
      .from("programs")
      .select("id, sport, roster_url, universities(name)")
      .eq("id", group.program_id)
      .maybeSingle();

    const school = (program?.universities as any)?.name ?? "Unknown school";
    const sport = String(program?.sport ?? "");
    const base = {
      key: `${group.program_id}:${group.season_year ?? ""}`,
      school,

      sport,
      season: group.season_year,
      before: Number(group.player_count),
      read: 0,
      kept: 0,
      dropped: 0,
    };

    const rosterUrl = typeof program?.roster_url === "string" ? program.roster_url.trim() : "";
    if (!rosterUrl) {
      if (options.apply) await requeueProgram(supabase, group.program_id);
      rows.push({
        ...base,
        outcome: "requeued",
        detail: "no roster page on file — the team is back in line to find one",
      });
      continue;
    }

    let markdown: string;
    try {
      markdown = await scrape(rosterUrl);
    } catch (failure) {
      rows.push({ ...base, outcome: "failed", detail: (failure as Error).message });
      continue;
    }

    let read = 0;
    let kept: any[] = [];
    let dropped: string[] = [];
    let seasonYear: number | null = null;
    let seasonLabel: string | null = null;
    try {
      const extracted = await extractRoster(markdown);
      read = extracted.diagnostics.read;
      kept = extracted.players;
      dropped = extracted.dropped;
      seasonYear = extracted.season_year;
      seasonLabel = extracted.season_label;
    } catch (failure) {
      rows.push({ ...base, outcome: "failed", detail: (failure as Error).message });
      continue;
    }

    const targetSeason = group.season_year ?? seasonYear;
    // Every name was found in the page's own text, so a big squad is the page's
    // squad, not a padded one — large junior-college and NAIA rosters are real.
    const verdict = rosterKeepable({ season_year: targetSeason, players: kept });

    if (!verdict.keep) {

      if (options.apply) await requeueProgram(supabase, group.program_id);
      rows.push({
        ...base,
        read,
        kept: kept.length,
        dropped: dropped.length,
        outcome: "requeued",
        detail: verdict.reason ?? "the page could not be read well enough to trust",
      });
      continue;
    }

    droppedPlayers += Math.max(base.before - kept.length, 0);

    if (!options.apply) {
      rows.push({
        ...base,
        read,
        kept: kept.length,
        dropped: dropped.length,
        outcome: kept.length === base.before ? "unchanged" : "would_replace",
        detail:
          kept.length === base.before
            ? "every stored player is on the page"
            : `${base.before} stored, ${kept.length} proven on the page`,
      });
      continue;
    }

    try {
      // The re-read may land on a different season heading; clear the stored
      // season first so a padded list can never be left behind beside the new one.
      if (group.season_year !== null && group.season_year !== undefined) {
        await supabase
          .from("roster_players")
          .delete()
          .eq("program_id", group.program_id)
          .eq("season_year", group.season_year);
      }
      await replaceRoster(supabase, {
        program_id: group.program_id,
        season_year: targetSeason ?? seasonYear,
        season_label: seasonLabel,
        players: kept,
      });
      if (kept.length !== base.before) replaced += 1;
      rows.push({
        ...base,
        read,
        kept: kept.length,
        dropped: dropped.length,
        outcome: kept.length === base.before ? "unchanged" : "replaced",
        detail: `${base.before} stored before, ${kept.length} kept`,
      });
    } catch (failure) {
      rows.push({
        ...base,
        read,
        kept: kept.length,
        dropped: dropped.length,
        outcome: "failed",
        detail: (failure as Error).message,
      });
    }
  }

  return {
    applied: options.apply,
    groupsFound: all.length,
    checked: rows.length,
    replaced,
    droppedPlayers,
    rows,
  };
}
