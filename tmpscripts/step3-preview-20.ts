/**
 * REPORT ONLY — read the actual rosters and coaching staffs for the 20 preview
 * schools and export names, not counts. Nothing is written to the database.
 *
 * Resumable: state is kept in /tmp/step3-state.json, so re-running continues
 * where the last run stopped.
 *
 * Run: bun tmpscripts/step3-preview-20.ts [--budget 500]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { extractCoaches, looksLikeDepartmentDirectory } from "@/lib/coach-extract";
import { parseRoster } from "@/lib/roster-extract";
import { verifyPagePurpose } from "@/lib/page-purpose";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const OUT = "/mnt/documents";
const STATE = "/tmp/step3-state.json";
const budgetMs = Number(process.argv[process.argv.indexOf("--budget") + 1]) * 1000 || 500_000;
const startedAt = Date.now();

const NAMES = [
  "University of Central Florida",
  "University of South Florida",
  "Stetson University",
  "Rollins College",
  "Florida Southern College",
  "Eckerd College",
  "Saint Leo University",
  "Florida Gulf Coast University",
  "Louisiana State University",
  "Vanderbilt University",
  "Wake Forest University",
  "University of Arkansas, Fayetteville",
  "University of Tennessee, Knoxville",
  "University of Texas at Austin",
  "Broward College",
  "South Florida State College",
  "Florida Gateway College",
  "North Florida Community College",
  "Chipola College",
  "Santa Fe College",
];

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

type Done = {
  players: unknown[][];
  coaches: unknown[][];
  proposals: unknown[][];
  seen: string[];
};

const state: Done = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, "utf8"))
  : { players: [], coaches: [], proposals: [], seen: [] };

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) =>
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

const { data: protection } = await sb
  .from("host_protection")
  .select("host, protection_kind")
  .is("lifted_at", null);
setProtectedHosts((protection ?? []) as any[]);

const { data: schools } = await sb
  .from("universities")
  .select("id, name, state, website_url, ipeds_unitid")
  .in("name", NAMES);

const { data: programs } = await sb
  .from("programs")
  .select("id, university_id, sport, athletic_website, roster_url, coaching_staff_url, head_coach_name")
  .in("university_id", (schools ?? []).map((s: any) => s.id))
  .neq("offering_status", "not_offered");

const byId = new Map((schools ?? []).map((s: any) => [s.id, s]));

for (const program of (programs ?? []) as any[]) {
  const school = byId.get(program.university_id);
  if (!school) continue;

  for (const [field, kind, url] of [
    ["roster_url", "roster_page", program.roster_url],
    ["coaching_staff_url", "coaching_staff_page", program.coaching_staff_url],
  ] as const) {
    const key = `${program.id}:${field}`;
    if (state.seen.includes(key)) continue;
    if (Date.now() - startedAt > budgetMs) {
      writeFileSync(STATE, JSON.stringify(state));
      console.log("budget reached — re-run to continue");
      process.exit(0);
    }

    if (!url) {
      state.proposals.push([
        school.name, school.state ?? "", school.ipeds_unitid ?? "", program.sport, field,
        "", "no", "nothing on file", "", 0, 0, 0, 0, 0, 0, "", "",
      ]);
      state.seen.push(key);
      continue;
    }

    let read = await safeFetch(url);
    let text = read.ok ? (read.markdown ?? read.html ?? "") : "";
    // A page that answers but holds no players or coaches is usually drawn by
    // its own scripts. Read it once more through the rendering service.
    const emptyForKind =
      kind === "roster_page"
        ? !parseRoster(text, program.sport).counts.players
        : !extractCoaches(text, program.sport).coaches.length;
    if (read.ok && text && emptyForKind) {
      const rendered = await safeFetch(url, { preferRendered: true });
      if (rendered.ok) {
        read = rendered;
        text = rendered.markdown ?? rendered.html ?? "";
      }
    }

    const purpose = verifyPagePurpose({
      kind,
      url,
      sport: program.sport,
      text: text || null,
      schoolWebsite: school.website_url ?? null,
    });

    let rosterCounts = { players: 0, withNumber: 0, withPosition: 0, withClass: 0, bareNames: 0, duplicates: 0 };
    let flags: string[] = [];
    let extractionOk = "no";
    let extractionNote = "";

    if (kind === "roster_page" && text) {
      const shape = parseRoster(text, program.sport);
      rosterCounts = {
        players: shape.counts.players,
        withNumber: shape.counts.withNumber,
        withPosition: shape.counts.withPosition,
        withClass: shape.counts.withClass,
        bareNames: shape.counts.bareNames,
        duplicates: shape.counts.duplicates,
      };
      flags = shape.flags;
      extractionOk = shape.players.length > 0 && !shape.flags.some((f) => /never found|page furniture/.test(f)) ? "yes" : "no";
      extractionNote = shape.flags.join("; ");
      for (const player of shape.players) {
        state.players.push([
          school.name, program.sport, player.name, player.number ?? "", player.position ?? "",
          player.class_year ?? "", player.height ?? "", player.weight ?? "", player.hometown ?? "", url,
        ]);
      }
    }

    if (kind === "coaching_staff_page" && text) {
      const dept = looksLikeDepartmentDirectory({ url, text, sport: program.sport });
      const shape = extractCoaches(text, program.sport);
      extractionOk = shape.headCoach && dept.ok ? "yes" : "no";
      extractionNote = dept.ok ? (shape.failure ?? "") : (dept.reason ?? "");
      rosterCounts.players = shape.coaches.length;
      for (const coach of shape.coaches) {
        state.coaches.push([
          school.name, program.sport, coach.name, coach.title, coach.isHead ? "head coach" : "", url,
        ]);
      }
      if (shape.headCoach) {
        state.coaches.push([]);
        state.coaches.pop();
      }
    }

    state.proposals.push([
      school.name, school.state ?? "", school.ipeds_unitid ?? "", program.sport, field, url,
      read.ok ? "yes" : "no",
      read.ok ? `read with the ${read.fetch_method} method` : `${read.failure_category ?? "unreadable"}: ${read.error ?? ""}`,
      `${purpose.code}${purpose.ok ? "" : " (fails)"}`,
      rosterCounts.players, rosterCounts.withNumber, rosterCounts.withPosition,
      rosterCounts.withClass, rosterCounts.bareNames, rosterCounts.duplicates,
      extractionOk, extractionNote || flags.join("; "),
    ]);
    state.seen.push(key);
    writeFileSync(STATE, JSON.stringify(state));
  }
}

write("step3-players.csv", [
  ["school", "sport", "player", "number", "position", "class", "height", "weight", "hometown", "source URL"],
  ...state.players,
]);
write("step3-coaches.csv", [
  ["school", "sport", "coach", "title", "head coach", "source URL"],
  ...state.coaches,
]);
write("step3-proposals.csv", [
  ["school", "state", "institution ID", "sport", "field", "address on file", "page read", "read detail",
   "page kind check", "rows extracted", "with number", "with position", "with class", "bare names",
   "duplicates", "extraction ok", "notes"],
  ...state.proposals,
]);

console.log(
  JSON.stringify(
    {
      pagesChecked: state.seen.length,
      playerRows: state.players.length,
      coachRows: state.coaches.length,
      headCoachesFound: state.coaches.filter((r) => r[4] === "head coach").length,
      extractionOk: state.proposals.filter((r) => r[15] === "yes").length,
      extractionFailed: state.proposals.filter((r) => r[15] === "no").length,
    },
    null,
    2,
  ),
);
