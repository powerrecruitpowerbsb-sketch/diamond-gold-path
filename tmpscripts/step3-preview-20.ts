/**
 * REPORT ONLY — read the actual rosters and coaching staffs for the 20 preview
 * schools and export NAMES, not counts. Nothing is written to the database and
 * no queue is released.
 *
 * One pass produces one record per page, and every export is derived from those
 * records — so a page can never appear in the counts and be missing from the
 * players file. The record set is version-stamped: change PASS and the old
 * results are discarded rather than resumed.
 *
 * Run: bun tmpscripts/step3-preview-20.ts [--budget 500]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { extractCoaches, classifyStaffPage } from "@/lib/coach-extract";
import { parseRoster, type RosterAttribute } from "@/lib/roster-extract";
import { verifyPagePurpose } from "@/lib/page-purpose";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const OUT = "/mnt/documents";
const STATE = "/tmp/step3-state.json";
const PASS = "2026-09-12-name-guards-2";
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

const ATTRIBUTES: RosterAttribute[] = ["number", "position", "class_year", "height", "weight", "hometown"];

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

type PageRecord = {
  key: string;
  school: string;
  state: string;
  ipeds: string;
  sport: string;
  field: string;
  url: string;
  readOk: boolean;
  readDetail: string;
  purpose: string;
  players: unknown[][];
  coaches: unknown[][];
  columns: unknown[][];
  rows: number;
  withNumber: number;
  withPosition: number;
  withClass: number;
  bareNames: number;
  duplicates: number;
  extractionOk: string;
  note: string;
};

type State = { pass: string; records: PageRecord[] };

const loaded: State | null = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
const state: State = loaded && loaded.pass === PASS ? loaded : { pass: PASS, records: [] };
const done = new Set(state.records.map((r) => r.key));

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
    if (done.has(key)) continue;
    if (Date.now() - startedAt > budgetMs) {
      writeFileSync(STATE, JSON.stringify(state));
      console.log("budget reached — re-run to continue");
      process.exit(0);
    }

    const record: PageRecord = {
      key,
      school: school.name,
      state: school.state ?? "",
      ipeds: school.ipeds_unitid ?? "",
      sport: program.sport,
      field,
      url: url ?? "",
      readOk: false,
      readDetail: "nothing on file",
      purpose: "",
      players: [],
      coaches: [],
      columns: [],
      rows: 0,
      withNumber: 0,
      withPosition: 0,
      withClass: 0,
      bareNames: 0,
      duplicates: 0,
      extractionOk: "no",
      note: url ? "" : "no address on file",
    };

    if (!url) {
      state.records.push(record);
      done.add(key);
      continue;
    }

    let read = await safeFetch(url);
    let text = read.ok ? (read.markdown ?? read.html ?? "") : "";
    // A page that answers but holds no players or coaches is usually drawn by
    // its own scripts. Read it once more through the rendering service.
    const emptyForKind =
      kind === "roster_page"
        ? !parseRoster(text, program.sport).counts.players
        : !extractCoaches(text, program.sport, { url }).coaches.length;
    if (read.ok && text && emptyForKind) {
      const rendered = await safeFetch(url, { preferRendered: true });
      if (rendered.ok) {
        read = rendered;
        text = rendered.markdown ?? rendered.html ?? "";
      }
    }

    record.readOk = read.ok;
    record.readDetail = read.ok
      ? `read with the ${read.fetch_method} method`
      : `${read.failure_category ?? "unreadable"}: ${read.error ?? ""}`;

    const purpose = verifyPagePurpose({
      kind,
      url,
      sport: program.sport,
      text: text || null,
      schoolWebsite: school.website_url ?? null,
    });
    record.purpose = `${purpose.code}${purpose.ok ? "" : " (fails)"}`;

    if (kind === "roster_page") {
      if (!read.ok || !text) {
        record.note = record.note || "page not read — attributes unknown";
        for (const attribute of ATTRIBUTES) {
          record.columns.push([school.name, program.sport, url, attribute, "not_read", 0, 0]);
        }
      } else {
        const shape = parseRoster(text, program.sport);
        record.rows = shape.counts.players;
        record.withNumber = shape.counts.withNumber;
        record.withPosition = shape.counts.withPosition;
        record.withClass = shape.counts.withClass;
        record.bareNames = shape.counts.bareNames;
        record.duplicates = shape.counts.duplicates;
        record.extractionOk =
          shape.players.length > 0 && !shape.parserDefects.length && !shape.flags.some((f) => /never found|page furniture/.test(f))
            ? "yes"
            : shape.players.length > 0
              ? "partial"
              : "no";
        record.note = shape.flags.join("; ");

        for (const player of shape.players) {
          record.players.push([
            school.name, program.sport, player.name, player.number ?? "", player.position ?? "",
            player.class_year ?? "", player.height ?? "", player.weight ?? "", player.hometown ?? "", url,
          ]);
        }

        const extractedFor = (attribute: RosterAttribute) =>
          shape.players.filter((p) => p[attribute]).length;
        for (const attribute of ATTRIBUTES) {
          const offered = shape.columns[attribute];
          const got = extractedFor(attribute);
          const status =
            offered === "not_published"
              ? "not_published"
              : offered === "unknown"
                ? got > 0
                  ? "extracted"
                  : "unknown"
                : got > 0
                  ? "extracted"
                  : "failed_to_extract";
          record.columns.push([school.name, program.sport, url, attribute, status, shape.players.length, got]);
        }
      }
    }

    if (kind === "coaching_staff_page") {
      const pageKind = classifyStaffPage({ url, text: text || null, sport: program.sport });
      if (!read.ok || !text) {
        record.note = record.note || "page not read";
      } else {
        const shape = extractCoaches(text, program.sport, { url });
        record.rows = shape.coaches.length;
        record.extractionOk = shape.headCoach ? "yes" : "no";
        record.note = shape.failure ?? "";
        for (const coach of shape.coaches) {
          record.coaches.push([
            school.name, program.sport, coach.name, coach.title, coach.isHead ? "head coach" : "",
            coach.email ?? "", coach.phone ?? "",
            coach.sportOnPage, coach.attribution, shape.pageKind, url,
          ]);
        }
        if (shape.headAmbiguity.length) {
          record.note += ` [more than one head coach title: ${shape.headAmbiguity
            .map((c) => `${c.name} — ${c.title}`)
            .join("; ")}]`;
        }
        if (!shape.headCoach) {
          record.note += ` [page kind: ${shape.pageKind} — ${pageKind.reason}; other-sport rows ${shape.counts.otherSport}; unattributed ${shape.counts.unattributed}]`;
        }
      }
    }

    state.records.push(record);
    done.add(key);
    writeFileSync(STATE, JSON.stringify(state));
  }
}

writeFileSync(STATE, JSON.stringify(state));

const records = state.records;

write("step3-players.csv", [
  ["school", "sport", "player", "number", "position", "class", "height", "weight", "hometown", "source URL"],
  ...records.flatMap((r) => r.players),
]);
write("step3-coaches.csv", [
  ["school", "sport", "coach", "title", "head coach", "email", "phone", "sport assigned on page", "how assigned", "page kind", "source URL"],
  ...records.flatMap((r) => r.coaches),
]);
write("step3-columns.csv", [
  ["school", "sport", "source URL", "attribute", "state", "players found", "players with attribute"],
  ...records.flatMap((r) => r.columns),
]);
write("step3-proposals.csv", [
  ["school", "state", "institution ID", "sport", "field", "address on file", "page read", "read detail",
   "page kind check", "rows extracted", "with number", "with position", "with class", "bare names",
   "duplicates", "extraction ok", "notes"],
  ...records.map((r) => [
    r.school, r.state, r.ipeds, r.sport, r.field, r.url, r.readOk ? "yes" : "no", r.readDetail, r.purpose,
    r.rows, r.withNumber, r.withPosition, r.withClass, r.bareNames, r.duplicates, r.extractionOk, r.note,
  ]),
]);

const perSchool: Record<string, { players: number; coaches: number }> = {};
for (const record of records) {
  const entry = (perSchool[record.school] ??= { players: 0, coaches: 0 });
  entry.players += record.players.length;
  entry.coaches += record.coaches.length;
}

console.log(
  JSON.stringify(
    {
      pagesChecked: records.length,
      schoolsInPlayersFile: Object.values(perSchool).filter((s) => s.players > 0).length,
      playerRows: records.reduce((n, r) => n + r.players.length, 0),
      coachRows: records.reduce((n, r) => n + r.coaches.length, 0),
      headCoachesFound: records.flatMap((r) => r.coaches).filter((c) => c[4] === "head coach").length,
      extractionOk: records.filter((r) => r.extractionOk === "yes").length,
      extractionPartial: records.filter((r) => r.extractionOk === "partial").length,
      extractionFailed: records.filter((r) => r.extractionOk === "no").length,
      perSchool,
    },
    null,
    2,
  ),
);
