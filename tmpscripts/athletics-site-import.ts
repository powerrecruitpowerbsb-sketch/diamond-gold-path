/**
 * One-off load of the staff-supplied athletics websites (380 schools):
 * save the corrected site on every offered program, forget the wrong guess,
 * then re-search that domain for only the roster/staff pages the file lists
 * as missing. Schools whose note says athletics is discontinued are closed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import {
  discoverProgramPages,
  loadRejectedUrls,
  markProgramNotOffered,
  normalizeUrl,
} from "../src/lib/discovery.server";
import { classifyLink } from "../src/lib/link-quality";

type Row = {
  school: string;
  state: string;
  school_website: string;
  current_athletics_guess: string;
  missing_pages: string;
  athletics_website_correct: string;
  athletics_website_note: string;
  university_id: string;
};

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const rows: Row[] = JSON.parse(readFileSync("/tmp/match.json", "utf8")).matched;
const STATE = "/tmp/athletics-import-state.json";
const state: { index: number; updated: number; found: number; queued: number; closed: number; failures: string[] } =
  existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, "utf8"))
    : { index: 0, updated: 0, found: 0, queued: 0, closed: 0, failures: [] };

const limit = Number(process.argv[2] ?? 400);

function wanted(row: Row): { sport: string; kind: "roster_page" | "coaching_staff_page" }[] {
  const out: { sport: string; kind: "roster_page" | "coaching_staff_page" }[] = [];
  for (const piece of row.missing_pages.split(";")) {
    const [sport, kind] = piece.trim().split(/\s+/);
    if ((sport === "baseball" || sport === "softball") && (kind === "roster_page" || kind === "coaching_staff_page")) {
      out.push({ sport, kind });
    }
  }
  return out;
}

async function closeSchool(row: Row) {
  const { data } = await supabase
    .from("programs")
    .select("id")
    .eq("university_id", row.university_id)
    .neq("offering_status", "not_offered");
  for (const program of (data ?? []) as { id: string }[]) {
    await markProgramNotOffered(supabase, program.id, null);
    state.closed += 1;
  }
  await supabase
    .from("url_discovery_queue")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      notes: row.athletics_website_note || "No current intercollegiate athletics.",
    })
    .eq("university_id", row.university_id)
    .eq("status", "pending_review");
}

async function handle(row: Row) {
  const raw = row.athletics_website_correct.trim();
  if (!raw) {
    await closeSchool(row);
    return;
  }

  const site = (() => {
    try {
      return new URL(raw).origin;
    } catch {
      return raw;
    }
  })();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, sport")
    .eq("university_id", row.university_id)
    .neq("offering_status", "not_offered");
  const list = (programs ?? []) as { id: string; sport: string }[];
  if (list.length) {
    await supabase
      .from("programs")
      .update({ athletic_website: site })
      .in(
        "id",
        list.map((program) => program.id),
      );
    state.updated += 1;
  }

  const now = new Date().toISOString();
  // Open guesses for the site are declined, which is also how the wrong domain
  // is remembered so it never comes back.
  await supabase
    .from("url_discovery_queue")
    .update({
      status: "rejected",
      reviewed_at: now,
      notes: "Replaced by the athletics site supplied by staff.",
    })
    .eq("university_id", row.university_id)
    .eq("discovery_type", "athletic_website")
    .eq("status", "pending_review");

  const want = wanted(row);
  if (!want.length) return;

  const excluded = await loadRejectedUrls(supabase, row.university_id);
  excluded.delete(normalizeUrl(site));
  const results = await discoverProgramPages(
    site,
    list.filter((program) => want.some((w) => w.sport === program.sport)),
    excluded,
  );

  for (const result of results) {
    if (!want.some((w) => w.sport === result.sport && w.kind === result.discoveryType)) continue;

    if (result.url) {
      const verdict = classifyLink({
        kind: result.discoveryType,
        url: result.url,
        sport: result.sport ?? null,
        schoolWebsite: row.school_website || null,
      });
      if (verdict.action === "reject") {
        result.url = null;
        result.confidence = "failed";
        result.notes = `Discarded automatically: ${verdict.reason}`;
      } else if (verdict.normalizedUrl) {
        result.url = verdict.normalizedUrl;
      }
    }

    await supabase
      .from("url_discovery_queue")
      .delete()
      .eq("university_id", row.university_id)
      .eq("discovery_type", result.discoveryType)
      .eq("status", "pending_review")
      .filter("program_id", result.programId ? "eq" : "is", result.programId ?? null);

    const { error } = await supabase.from("url_discovery_queue").insert({
      university_id: row.university_id,
      program_id: result.programId,
      discovery_type: result.discoveryType,
      discovered_url: result.url,
      confidence: result.confidence,
      notes: result.notes,
    });
    if (error) console.error("queue insert failed", error.message);

    state.queued += 1;
    if (result.url) state.found += 1;
  }
}

let done = 0;
while (state.index < rows.length && done < limit) {
  const row = rows[state.index]!;
  try {
    await handle(row);
  } catch (failure) {
    state.failures.push(`${row.school}: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
  state.index += 1;
  done += 1;
  writeFileSync(STATE, JSON.stringify(state));
  if (done % 10 === 0) console.log(JSON.stringify({ at: state.index, ...state, failures: state.failures.length }));
}

console.log(
  JSON.stringify({
    finished: state.index >= rows.length,
    processed: state.index,
    total: rows.length,
    schoolsUpdated: state.updated,
    pagesFound: state.found,
    pagesQueued: state.queued,
    programsClosed: state.closed,
    failures: state.failures.slice(-10),
    failureCount: state.failures.length,
  }),
);
