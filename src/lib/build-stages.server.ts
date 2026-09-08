/**
 * Four stages, in order, each with one button.
 *
 * The whole build is: get the schools, find their sports pages, read rosters and
 * coaches off those pages, and close out the teams that don't play the sport.
 * This file is the only place that decides which stage is ready, which is
 * running, and which is finished — so the screen can stay one list of four rows.
 *
 * Nothing here re-does finished work. Each stage picks up from where it stopped:
 * the page check keeps its position, collection fills only the gaps that are
 * still gaps, and the coach stage refuses to start unless the safety cases pass.
 */

import { completionBoard, enqueueGapWork } from "@/lib/completion.server";
import { coachGuardSelfCheck } from "@/lib/coach-selfcheck";

export type StageKey = "pages" | "rosters" | "coaches" | "leftovers";

export type Stage = {
  key: StageKey;
  title: string;
  blurb: string;
  state: "locked" | "ready" | "running" | "done" | "blocked";
  /** Why the button can't be pressed yet, in plain words. */
  lockedReason: string | null;
  detail: string;
  done: number;
  notOffered: number;
  left: number;
  buttonLabel: string;
  message: string | null;
};

export type StageBoard = {
  stages: Stage[];
  collecting: boolean;
  lastBeatAt: string | null;
  lastMessage: string | null;
  seasonYear: number;
  headline: string;
};

type StageRow = {
  stage: string;
  status: string;
  cursor: string | null;
  checked: number;
  changed: number;
  failed: number;
  last_message: string | null;
};

const ORDER: StageKey[] = ["pages", "rosters", "coaches", "leftovers"];

async function readRows(supabase: any): Promise<Record<StageKey, StageRow>> {
  const { data, error } = await supabase
    .from("build_stages")
    .select("stage, status, cursor, checked, changed, failed, last_message");
  if (error) throw new Error(error.message);

  const blank = (stage: StageKey): StageRow => ({
    stage,
    status: "idle",
    cursor: null,
    checked: 0,
    changed: 0,
    failed: 0,
    last_message: null,
  });
  const rows = Object.fromEntries(ORDER.map((key) => [key, blank(key)])) as Record<
    StageKey,
    StageRow
  >;
  for (const row of (data ?? []) as StageRow[]) {
    if (ORDER.includes(row.stage as StageKey)) rows[row.stage as StageKey] = row;
  }
  return rows;
}

async function writeRow(supabase: any, stage: StageKey, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("build_stages")
    .upsert({ stage, ...patch }, { onConflict: "stage" });
  if (error) throw new Error(error.message);
}

const n = (value: number) => value.toLocaleString();

/** Counts of the things still waiting on a person. */
async function decisionCounts(supabase: any) {
  const [facts, links, unreadable] = await Promise.all([
    supabase
      .from("pending_data_changes")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("url_discovery_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .not("discovered_url", "is", null),
    supabase
      .from("unreadable_pages")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null),
  ]);
  return { facts: facts.count ?? 0, links: links.count ?? 0, unreadable: unreadable.count ?? 0 };
}

/** Everything the screen shows, worked out in one read. */
export async function stageBoard(supabase: any): Promise<StageBoard> {
  const [rows, board, decisions] = await Promise.all([
    readRows(supabase),
    completionBoard(supabase),
    decisionCounts(supabase),
  ]);

  const queueLeft = board.queue.pending + board.queue.running;
  const collecting = board.isRunning;
  const coachCheck = coachGuardSelfCheck();

  const pagesRow = rows.pages;
  const pagesDone = pagesRow.status === "done";
  const pages: Stage = {
    key: "pages",
    title: "Check the pages we already have",
    blurb:
      "Reads every roster and staff page on file and makes sure it really belongs to that school and that sport. Wrong ones are cleared and searched again.",
    state: pagesRow.status === "running" ? "running" : pagesDone ? "done" : "ready",
    lockedReason: null,
    detail: pagesRow.checked
      ? `${n(pagesRow.checked)} pages checked · ${n(pagesRow.changed)} were the wrong school and were cleared · ${n(pagesRow.failed)} couldn't be read${
          decisions.unreadable ? ` (${n(decisions.unreadable)} listed by name)` : ""
        }`
      : `${n(board.withRosterPage)} roster pages and ${n(board.withStaffPage)} staff pages on file to check`,
    done: pagesRow.checked,
    notOffered: 0,
    left: pagesDone ? 0 : Math.max(board.withRosterPage + board.withStaffPage - pagesRow.checked, 0),
    buttonLabel:
      pagesRow.status === "running" ? "Stop" : pagesDone ? "Check them again" : "Check the pages",
    message: pagesRow.last_message,
  };

  const rostersDone = !collecting && queueLeft === 0 && board.needsRoster === 0;
  const rosters: Stage = {
    key: "rosters",
    title: "Read the rosters",
    blurb:
      "Works through every confirmed team that has pages but no current roster. It keeps going on its own — you can close this page.",
    state: pagesDone
      ? collecting
        ? "running"
        : rostersDone
          ? "done"
          : "ready"
      : "locked",
    lockedReason: pagesDone ? null : "Finish checking the pages first",
    detail: `${n(board.withCurrentRoster)} of ${n(board.sponsored)} teams have a roster · ${n(board.needsRoster)} to go${
      queueLeft ? ` · ${n(queueLeft)} in line right now` : ""
    }${board.queue.exhausted ? ` · ${n(board.queue.exhausted)} we couldn't read` : ""}`,
    done: board.withCurrentRoster,
    notOffered: board.sponsored - board.withCurrentRoster - board.needsRoster,
    left: board.needsRoster,
    buttonLabel: collecting ? "Stop" : "Finish the rosters",
    message: board.lastMessage,
  };

  const coachesRunning = rows.coaches.status === "running" && collecting;
  const coaches: Stage = {
    key: "coaches",
    title: "Fill in the head coaches",
    blurb: coachCheck.passed
      ? "Only a name printed as head coach on that school's own page for that sport is saved. Everything else is left blank rather than guessed."
      : "Held back: the safety cases below did not all come out right, so no coach will be saved automatically.",
    state: !coachCheck.passed
      ? "blocked"
      : !rostersDone && !coachesRunning && rows.coaches.status !== "done"
        ? pagesDone && rows.rosters.status === "done"
          ? "ready"
          : "locked"
        : coachesRunning
          ? "running"
          : board.needsCoach === 0
            ? "done"
            : "ready",
    lockedReason: !coachCheck.passed
      ? `${coachCheck.failures.length} safety case${coachCheck.failures.length === 1 ? "" : "s"} failed`
      : pagesDone
        ? null
        : "Finish checking the pages first",
    detail: `${n(board.withCoach)} of ${n(board.sponsored)} teams have a head coach we can show a source for · ${n(board.needsCoach)} to go`,
    done: board.withCoach,
    notOffered: 0,
    left: board.needsCoach,
    buttonLabel: "Fill in the coaches",
    message: rows.coaches.last_message,
  };

  const leftoverLeft = board.unverifiedSponsorship + decisions.facts + decisions.links;
  const leftovers: Stage = {
    key: "leftovers",
    title: "Close out the leftovers",
    blurb:
      "Settles the teams we still can't confirm play the sport, and clears the last found pages and proposed changes.",
    state:
      rows.leftovers.status === "running"
        ? "running"
        : leftoverLeft === 0
          ? "done"
          : pagesDone
            ? "ready"
            : "locked",
    lockedReason: pagesDone ? null : "Finish checking the pages first",
    detail: `${n(board.unverifiedSponsorship)} teams still unconfirmed · ${n(decisions.links)} found page${decisions.links === 1 ? "" : "s"} and ${n(decisions.facts)} proposed change${decisions.facts === 1 ? "" : "s"} waiting on you`,
    done: board.sponsored,
    notOffered: 0,
    left: leftoverLeft,
    buttonLabel: "Close out the leftovers",
    message: rows.leftovers.last_message,
  };

  const stages = [pages, rosters, coaches, leftovers];
  const active = stages.find((stage) => stage.state === "running");
  const next = stages.find((stage) => stage.state === "ready");
  const headline = active
    ? `Working on: ${active.title.toLowerCase()}`
    : next
      ? `Next: ${next.title.toLowerCase()}`
      : "Everything on the list is finished";

  return {
    stages,
    collecting,
    lastBeatAt: board.lastBeatAt,
    lastMessage: board.lastMessage,
    seasonYear: board.seasonYear,
    headline,
  };
}

/** True while the page check is switched on, so the scheduled runner keeps going. */
export async function pagesCheckIsOn(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from("build_stages")
    .select("status")
    .eq("stage", "pages")
    .maybeSingle();
  return (data as { status?: string } | null)?.status === "running";
}

/**
 * One bounded slice of the page check. Its position is saved, so an interrupted
 * slice loses nothing and the next one carries on rather than restarting. The
 * every-minute schedule calls this while the stage is switched on.
 */
export async function runPagesSlice(
  supabase: any,
  actorId: string | null,
  options: { limit?: number; budgetMs?: number } = {},
): Promise<{ checked: number; cleared: number; unclear: number; failed: number; finished: boolean }> {
  const rows = await readRows(supabase);
  const { auditStoredLinks } = await import("@/lib/link-audit.server");

  const result = await auditStoredLinks(supabase, {
    apply: true,
    limit: options.limit ?? 25,
    budgetMs: options.budgetMs ?? 22_000,
    cursor: rows.pages.cursor,
    actorId,
  });

  const finished = !result.moreWaiting;
  const checked = rows.pages.checked + result.checked;
  await writeRow(supabase, "pages", {
    status: finished ? "done" : "running",
    cursor: finished ? null : result.nextCursor,
    checked,
    changed: rows.pages.changed + result.cleared,
    failed: rows.pages.failed + result.failed,
    last_message: finished
      ? "Every stored page has been checked."
      : `${checked.toLocaleString()} pages checked so far — still going on its own.`,
    finished_at: finished ? new Date().toISOString() : null,
  });

  return {
    checked: result.checked,
    cleared: result.cleared,
    unclear: result.unclear,
    failed: result.failed,
    finished,
  };
}

/**
 * Switch the page check on and make sure the every-minute schedule is live, then
 * return straight away. From here it carries on with no page open.
 */
export async function startPagesCheck(supabase: any): Promise<{ started: boolean }> {
  const rows = await readRows(supabase);
  // A finished stage started again is a fresh pass over everything, so its
  // running totals start from zero rather than adding to the last pass.
  const fresh = rows.pages.status === "done" ? { checked: 0, changed: 0, failed: 0, cursor: null } : {};
  await writeRow(supabase, "pages", {
    ...fresh,
    status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    last_message: "Started — checking pages on its own, a batch a minute.",
  });
  const { error } = await supabase.rpc("collection_cron_start");
  if (error) throw new Error(error.message);
  return { started: true };
}

/** Pause the page check. Its position is kept, so starting again carries on. */
export async function stopPagesCheck(supabase: any): Promise<void> {
  await writeRow(supabase, "pages", {
    status: "idle",
    last_message: "Paused — it will carry on from here when you start it again.",
  });
}

/**
 * Put stuck work back in line, top the queue up from the gaps, and open the gate
 * so the every-minute runner carries on with no page open.
 */
export async function startCollectingFor(
  supabase: any,
  stage: Extract<StageKey, "rosters" | "coaches">,
): Promise<{ queued: number }> {
  // Anything that failed but hasn't been tried three times goes back in line,
  // and a lease left behind by a stopped run is released.
  await supabase
    .from("ingest_queue")
    .update({ status: "pending", leased_at: null })
    .in("status", ["failed", "running", "held"])
    .lt("attempts", 3);

  const queued = await enqueueGapWork(supabase, { limit: 8000 });

  const { markCollectionStarted } = await import("@/lib/collection.server");
  await markCollectionStarted(supabase);
  const { error } = await supabase.rpc("collection_cron_start");
  if (error) throw new Error(error.message);

  await writeRow(supabase, stage, {
    status: "running",
    started_at: new Date().toISOString(),
    last_message: `${(queued.discovery + queued.scrape).toLocaleString()} teams lined up.`,
  });

  return { queued: queued.discovery + queued.scrape };
}

/** Stop whatever is collecting, keeping everything gathered so far. */
export async function stopCollecting(supabase: any): Promise<void> {
  const { requestCollectionStop, markCollectionFinished } = await import("@/lib/collection.server");
  await requestCollectionStop(supabase, "Stopped from the build screen");
  await markCollectionFinished(supabase, "Stopped from the build screen");
  const { error } = await supabase.rpc("collection_cron_stop");
  if (error) throw new Error(error.message);
  for (const stage of ["rosters", "coaches"] as const) {
    await writeRow(supabase, stage, { status: "idle" });
  }
}

/** Turn coach filling on only if every safety case comes out right. */
export async function startCoaches(
  supabase: any,
): Promise<{ started: boolean; failures: { name: string; expected: string; got: string }[]; queued: number }> {
  const check = coachGuardSelfCheck();
  if (!check.passed) {
    await writeRow(supabase, "coaches", {
      status: "blocked",
      last_message: `${check.failures.length} safety case${check.failures.length === 1 ? "" : "s"} failed — no coach will be saved.`,
    });
    return { started: false, failures: check.failures, queued: 0 };
  }

  const { queued } = await startCollectingFor(supabase, "coaches");
  await writeRow(supabase, "coaches", {
    status: "running",
    last_message: `All ${check.total} safety cases passed. ${queued.toLocaleString()} teams lined up.`,
  });
  return { started: true, failures: [], queued };
}

/**
 * One bounded pass over the leftovers: confirm or retire the teams we can't yet
 * say play the sport, then clear the last found pages and proposed changes.
 */
export async function runLeftoversPass(
  supabase: any,
  actorId: string,
): Promise<{
  schoolsChecked: number;
  offered: number;
  notOffered: number;
  factsSettled: number;
  linksSettled: number;
  finished: boolean;
}> {
  await writeRow(supabase, "leftovers", { status: "running", started_at: new Date().toISOString() });

  const { syncSponsorshipBatch } = await import("@/lib/sport-sponsorship.server");
  const { sweepPendingUntilDone } = await import("@/lib/review.server");
  const { sweepLinksUntilDone, retireEmptyDiscoveryRows } = await import("@/lib/link-sweep.server");

  const sponsorship = await syncSponsorshipBatch(supabase, { limit: 60, onlyUnverified: true });
  const facts = await sweepPendingUntilDone(supabase, actorId, true, { budgetMs: 8_000 });
  await retireEmptyDiscoveryRows(supabase, actorId, { apply: true });
  const links = await sweepLinksUntilDone(supabase, actorId, { apply: true, budgetMs: 8_000 });

  const factsSettled = Number(facts.noChange ?? 0) + Number(facts.gapFills ?? 0);
  const linksSettled = Number(links.approve ?? 0) + Number(links.reject ?? 0);
  const moved = sponsorship.schoolsChecked + factsSettled + linksSettled;
  const finished = moved === 0;

  await writeRow(supabase, "leftovers", {
    status: finished ? "done" : "running",
    changed: moved,
    last_message: finished
      ? "Nothing left that can be settled automatically."
      : `Settled ${sponsorship.offered + sponsorship.notOffered} team${sponsorship.offered + sponsorship.notOffered === 1 ? "" : "s"}, ${factsSettled} change${factsSettled === 1 ? "" : "s"} and ${linksSettled} page${linksSettled === 1 ? "" : "s"}.`,
    finished_at: finished ? new Date().toISOString() : null,
  });

  return {
    schoolsChecked: sponsorship.schoolsChecked,
    offered: sponsorship.offered,
    notOffered: sponsorship.notOffered,
    factsSettled,
    linksSettled,
    finished,
  };
}

export { coachGuardSelfCheck };
