/**
 * Wrong-school roster data.
 *
 *   bun tmpscripts/wrong-school-rosters.ts sweep   REPORT ONLY — every program
 *       in the database whose extracted roster came from a domain that
 *       federally belongs to a different school.
 *   bun tmpscripts/wrong-school-rosters.ts apply   deletes the extracted
 *       players and clears the addresses for the 13 confirmed cases in
 *       league-c2-roster-investigation.csv, archived under one run id.
 *
 * Every deleted row is archived as JSON in public.program_level_archive so the
 * run can be undone. Nothing is re-searched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";

const OUT = "/mnt/documents";
const mode = process.argv[2];
if (!["sweep", "apply"].includes(mode ?? "")) throw new Error("pass sweep or apply");

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const q = (sql: string) =>
  execFileSync("psql", ["-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .trim().split("\n").filter(Boolean).map((l) => l.split("\t"));

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};

/* ------------------------- federal domain ownership ----------------------- */

const fedByDomain = new Map<string, { unitid: string; name: string; state: string }>();
for (const [unitid, name, state, website] of q(`
  select unitid::text, name, coalesce(state,''), coalesce(website,'') from public.federal_directory`)) {
  const d = registrableDomain(website!);
  if (d && !fedByDomain.has(d)) fedByDomain.set(d, { unitid: unitid!, name: name!, state: state! });
}

/* ------------------------------- sweep ------------------------------------ */

if (mode === "sweep") {
  const rows = q(`
    select p.id, u.id, u.name, coalesce(u.state,''), coalesce(u.ipeds_unitid::text,''),
           p.sport::text, coalesce(p.roster_url,''), coalesce(u.website_url,''),
           (select count(*) from public.roster_players rp where rp.program_id = p.id)
      from public.programs p
      join public.universities u on u.id = p.university_id
     where u.retired_at is null`);

  const out: unknown[][] = [];
  let withPlayers = 0;
  for (const [pid, sid, name, state, ipeds, sport, rosterUrl, ownSite, count] of rows) {
    const players = Number(count ?? 0);
    if (players === 0) continue;
    withPlayers++;
    const dom = registrableDomain(rosterUrl!);
    if (!dom) continue;
    const fed = fedByDomain.get(dom);
    if (!fed) continue; // no federal owner for the domain — a separate question
    const ownDom = registrableDomain(ownSite!);
    if (ownDom && dom === ownDom) continue; // the school's own domain
    if (ipeds && fed.unitid === ipeds) continue; // federally this school's own domain
    out.push([
      name, sid, ipeds || "none", state, sport, pid, players, rosterUrl, dom,
      ownDom ?? "", `${fed.name} (${fed.state}) [${fed.unitid}]`,
    ]);
  }

  write("roster-domain-owned-by-another-school.csv", [
    ["school", "school_id", "federal_id", "state", "sport", "program_id", "players_on_file",
     "roster_url", "roster_domain", "school_own_domain", "domain_federally_belongs_to"],
    ...out,
  ]);
  console.log(`\nprograms with extracted players: ${withPlayers}`);
  console.log(`roster read from a domain federally owned by a different school: ${out.length}`);
  console.log(`   distinct schools affected: ${new Set(out.map((r) => r[1])).size}`);
  console.log(`   players sitting on them: ${out.reduce((n, r) => n + Number(r[6]), 0)}`);
  console.log("\nnothing written to the database");
}

/* ------------------------------- apply ------------------------------------ */

if (mode === "apply") {
  const csv = parseCsv(readFileSync(`${OUT}/league-c2-roster-investigation.csv`, "utf8"));
  const head = csv[0]!;
  const idx = (h: string) => head.indexOf(h);
  const targets = csv.slice(1)
    .filter((r) => r.length === head.length && String(r[idx("verdict")]).startsWith("same squad"))
    .map((r) => ({
      program_id: r[idx("program_id")]!,
      school: r[idx("school")]!,
      sport: r[idx("sport")]!,
      players: Number(r[idx("players_on_file")] ?? 0),
      elsewhere: r[idx("same_players_elsewhere")]!,
    }));

  if (targets.length !== 13) throw new Error(`expected 13 confirmed cases, found ${targets.length}`);
  const runId = crypto.randomUUID();
  console.log(JSON.stringify({ runId, programs: targets.length }));

  const arch: { run_id: string; program_id: string; field: string; prior_value: string | null; new_value: string | null; reason: string }[] = [];
  const applied: unknown[][] = [];

  for (const t of targets) {
    const { data: prog, error: pe } = await sb.from("programs")
      .select("roster_url, coaching_staff_url, head_coach_name, recruiting_coordinator_name, last_roster_pull_at")
      .eq("id", t.program_id).single();
    if (pe) throw new Error(pe.message);

    const { data: players, error: rpe } = await sb.from("roster_players").select("*").eq("program_id", t.program_id);
    if (rpe) throw new Error(rpe.message);
    const { data: snaps, error: rse } = await sb.from("roster_snapshots").select("*").eq("program_id", t.program_id);
    if (rse) throw new Error(rse.message);

    const reason = `roster belonged to another school: ${t.elsewhere}`;
    for (const p of players ?? [])
      arch.push({ run_id: runId, program_id: t.program_id, field: "roster_players", prior_value: JSON.stringify(p), new_value: null, reason });
    for (const s of snaps ?? [])
      arch.push({ run_id: runId, program_id: t.program_id, field: "roster_snapshots", prior_value: JSON.stringify(s), new_value: null, reason });
    for (const field of ["roster_url", "coaching_staff_url", "head_coach_name", "recruiting_coordinator_name"] as const) {
      const prior = (prog as any)[field] as string | null;
      if (prior) arch.push({ run_id: runId, program_id: t.program_id, field, prior_value: prior, new_value: null, reason });
    }

    applied.push([
      t.school, t.sport, t.program_id, players?.length ?? 0, snaps?.length ?? 0,
      prog.roster_url ?? "", prog.coaching_staff_url ?? "", prog.head_coach_name ?? "",
      prog.recruiting_coordinator_name ?? "", t.elsewhere,
    ]);
  }

  for (let i = 0; i < arch.length; i += 500) {
    const { error } = await sb.from("program_level_archive").insert(arch.slice(i, i + 500));
    if (error) throw new Error(`archive failed: ${error.message}`);
  }

  for (const t of targets) {
    const { error: de } = await sb.from("roster_players").delete().eq("program_id", t.program_id);
    if (de) throw new Error(de.message);
    const { error: se } = await sb.from("roster_snapshots").delete().eq("program_id", t.program_id);
    if (se) throw new Error(se.message);
    const { error: ue } = await sb.from("programs").update({
      roster_url: null, coaching_staff_url: null, head_coach_name: null,
      recruiting_coordinator_name: null, last_roster_pull_at: null,
    }).eq("id", t.program_id);
    if (ue) throw new Error(ue.message);
  }

  write("run4-wrong-school-rosters-removed.csv", [
    ["school", "sport", "program_id", "players_deleted", "snapshots_deleted", "roster_url_cleared",
     "coach_url_cleared", "head_coach_cleared", "recruiting_coordinator_cleared", "evidence"],
    ...applied,
  ]);

  const left = q(`select count(*) from public.roster_players where program_id in (${targets.map((t) => `'${t.program_id}'`).join(",")})`)[0]![0];
  console.log(JSON.stringify({
    runId,
    programs: targets.length,
    playersDeleted: applied.reduce((n, r) => n + Number(r[3]), 0),
    snapshotsDeleted: applied.reduce((n, r) => n + Number(r[4]), 0),
    archiveRows: arch.length,
    playersLeftOnThosePrograms: Number(left),
  }));
}
