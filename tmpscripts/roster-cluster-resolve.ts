/**
 * Resolve duplicate-squad clusters found by roster-overlap-sweep.ts.
 *
 *   bun tmpscripts/roster-cluster-resolve.ts report
 *   bun tmpscripts/roster-cluster-resolve.ts apply
 *
 * A cluster is a set of programs (same sport, different schools) holding the
 * same squad. Exactly one of them can own it. The owner is the program whose
 * stored roster address sits on a domain that matches its OWN name; every
 * other program in the cluster is holding another school's roster.
 *
 * apply deletes the non-owners' extracted players/snapshots, clears their
 * roster and coach addresses, and archives every removed row under one run id.
 * Nothing is re-searched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";
import { significantWords, DROPPABLE } from "@/lib/school-name-match";

const OUT = "/mnt/documents";
const mode = process.argv[2];
if (!["report", "apply"].includes(mode ?? "")) throw new Error("pass report or apply");

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

/* ------------------------------ load pairs -------------------------------- */

const csv = parseCsv(readFileSync(`${OUT}/roster-overlap-sweep.csv`, "utf8"));
const head = csv[0]!;
const at = (h: string) => head.indexOf(h);
const pairs = csv.slice(1).filter((r) => r.length === head.length)
  .map((r) => [r[at("program_a")]!, r[at("program_b")]!] as const);

/* connected components */
const parent = new Map<string, string>();
const find = (x: string): string => {
  if (!parent.has(x)) parent.set(x, x);
  const p = parent.get(x)!;
  if (p === x) return x;
  const r = find(p);
  parent.set(x, r);
  return r;
};
const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
for (const [a, b] of pairs) union(a, b);

const clusters = new Map<string, string[]>();
for (const id of parent.keys()) {
  const r = find(id);
  if (!clusters.has(r)) clusters.set(r, []);
  clusters.get(r)!.push(id);
}

/* --------------------------- program details ------------------------------ */

type Prog = {
  id: string; school: string; schoolId: string; state: string; fed: string;
  sport: string; rosterUrl: string; coachUrl: string; headCoach: string;
  ownSite: string; players: number;
};
const progs = new Map<string, Prog>();
for (const [id, school, sid, state, fed, sport, rurl, curl, coach, own, count] of q(`
  select p.id, u.name, u.id, coalesce(u.state,''), coalesce(u.ipeds_unitid::text,''),
         p.sport::text, coalesce(p.roster_url,''), coalesce(p.coaching_staff_url,''),
         coalesce(p.head_coach_name,''), coalesce(u.website_url,''),
         (select count(*) from public.roster_players rp where rp.program_id = p.id)
    from public.programs p join public.universities u on u.id = p.university_id
   where p.id in (${[...parent.keys()].map((i) => `'${i}'`).join(",")})`)) {
  progs.set(id!, {
    id: id!, school: school!, schoolId: sid!, state: state!, fed: fed!, sport: sport!,
    rosterUrl: rurl!, coachUrl: curl!, headCoach: coach!, ownSite: own!, players: Number(count),
  });
}

/* --------------------- does the domain match the school? ------------------ */

const domainTokens = (url: string) => {
  const d = registrableDomain(url);
  if (!d) return "";
  return d.replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9]/g, "");
};

/** how much of the school's own name the athletics domain spells out */
function domainAffinity(school: string, url: string): number {
  const dom = domainTokens(url);
  if (!dom) return 0;
  const words = significantWords(school).filter((w) => !DROPPABLE.has(w));
  if (!words.length) return 0;
  let hits = 0;
  for (const w of words) {
    if (w.length >= 4 && dom.includes(w)) hits += 1;
    else if (w.length >= 5 && dom.includes(w.slice(0, 4))) hits += 0.5;
  }
  return hits / words.length;
}

/* ------------------------------- resolve ---------------------------------- */

type Row = {
  cluster: number; prog: Prog; action: "keep" | "remove" | "hold"; determination: string;
  siblings: string;
};
const rows: Row[] = [];
let cn = 0;
for (const members of clusters.values()) {
  cn++;
  const list = members.map((id) => progs.get(id)!).filter(Boolean);
  const scored = list.map((p) => ({ p, score: p.rosterUrl ? domainAffinity(p.school, p.rosterUrl) : 0 }));
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const top = ranked[0]!;
  const runnerUp = ranked[1]?.score ?? 0;
  /* the owner must hold an address of its own and out-score every sibling */
  const owner = top.score > 0 && top.score > runnerUp && top.p.rosterUrl ? top.p.id : null;
  const siblings = list.map((p) => `${p.school} (${p.state})`).join(" | ");

  for (const { p, score } of scored) {
    if (owner && p.id === owner) {
      rows.push({ cluster: cn, prog: p, action: "keep",
        determination: `owns the roster address (${registrableDomain(p.rosterUrl)} spells its own name, ${score.toFixed(2)} vs ${runnerUp.toFixed(2)})`, siblings });
    } else if (owner) {
      rows.push({ cluster: cn, prog: p, action: "remove",
        determination: p.rosterUrl
          ? `holds ${progs.get(owner)!.school}'s squad; its own address scores ${score.toFixed(2)}`
          : `holds ${progs.get(owner)!.school}'s squad and has no roster address of its own`, siblings });
    } else {
      rows.push({ cluster: cn, prog: p, action: "hold",
        determination: "duplicate squad, no sibling out-scores the others on its own address — needs a human call", siblings });
    }
  }
}

const out: unknown[][] = rows
  .sort((a, b) => a.cluster - b.cluster || a.prog.school.localeCompare(b.prog.school))
  .map((r) => [
    r.cluster, r.prog.school, r.prog.state, r.prog.fed || "none", r.prog.sport, r.prog.id,
    r.prog.players, r.prog.rosterUrl || "", r.prog.coachUrl || "", r.prog.headCoach || "",
    r.action, r.determination, r.siblings,
  ]);

write("roster-duplicate-clusters.csv", [
  ["cluster", "school", "state", "federal_id", "sport", "program_id", "players_on_file",
   "roster_url", "coach_url", "head_coach_name", "action", "determination", "cluster_members"],
  ...out,
]);

const removals = rows.filter((r) => r.action === "remove");
const summary = {
  clusters: cn,
  programsInClusters: rows.length,
  keep: rows.length - removals.length,
  remove: removals.length,
  clustersWithNoIdentifiableOwner: [...new Set(rows.filter((r) => r.determination.startsWith("duplicate squad with no")).map((r) => r.cluster))].length,
  playersToRemove: removals.reduce((n, r) => n + r.prog.players, 0),
  schoolsAffected: new Set(removals.map((r) => r.prog.schoolId)).size,
};
console.log(JSON.stringify(summary, null, 2));

if (mode === "report") {
  console.log("report only — nothing written to the database");
  process.exit(0);
}

/* -------------------------------- apply ----------------------------------- */

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const runId = crypto.randomUUID();
console.log(`archive run id: ${runId}`);

const applied: unknown[][] = [];
for (const r of removals) {
  const pid = r.prog.id;
  const { data: players, error: pe } = await sb.from("roster_players").select("*").eq("program_id", pid);
  if (pe) throw new Error(pe.message);
  const { data: snaps, error: se } = await sb.from("roster_snapshots").select("*").eq("program_id", pid);
  if (se) throw new Error(se.message);

  const arch: any[] = [];
  const reason = `wrong-school roster: ${r.determination}`;
  for (const p of players ?? [])
    arch.push({ run_id: runId, program_id: pid, field: "roster_players", prior_value: JSON.stringify(p), new_value: null, reason });
  for (const s of snaps ?? [])
    arch.push({ run_id: runId, program_id: pid, field: "roster_snapshots", prior_value: JSON.stringify(s), new_value: null, reason });
  for (const [field, prior] of [
    ["roster_url", r.prog.rosterUrl], ["coaching_staff_url", r.prog.coachUrl],
    ["head_coach_name", r.prog.headCoach],
  ] as const) if (prior) arch.push({ run_id: runId, program_id: pid, field, prior_value: prior, new_value: null, reason });

  for (let i = 0; i < arch.length; i += 500) {
    const { error } = await sb.from("program_level_archive").insert(arch.slice(i, i + 500));
    if (error) throw new Error(`archive failed: ${error.message}`);
  }

  const { error: de } = await sb.from("roster_players").delete().eq("program_id", pid);
  if (de) throw new Error(de.message);
  const { error: dse } = await sb.from("roster_snapshots").delete().eq("program_id", pid);
  if (dse) throw new Error(dse.message);
  const { error: ue } = await sb.from("programs").update({
    roster_url: null, coaching_staff_url: null, head_coach_name: null,
    recruiting_coordinator_name: null, last_roster_pull_at: null,
  }).eq("id", pid);
  if (ue) throw new Error(ue.message);

  applied.push([r.cluster, r.prog.school, r.prog.state, r.prog.sport, pid,
    players?.length ?? 0, snaps?.length ?? 0, r.prog.rosterUrl, r.prog.coachUrl, r.determination]);
}

write("run5-wrong-school-rosters-removed.csv", [
  ["cluster", "school", "state", "sport", "program_id", "players_deleted", "snapshots_deleted",
   "roster_url_cleared", "coach_url_cleared", "determination"],
  ...applied,
]);
const left = Number(q(`select count(*) from public.roster_players where program_id in (${removals.map((r) => `'${r.prog.id}'`).join(",")})`)[0]![0]);
console.log(JSON.stringify({
  runId, programs: applied.length,
  playersDeleted: applied.reduce((n, r) => n + Number(r[5]), 0),
  snapshotsDeleted: applied.reduce((n, r) => n + Number(r[6]), 0),
  playersLeftOnThoseProgams: left,
}, null, 2));
