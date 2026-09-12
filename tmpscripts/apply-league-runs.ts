/**
 * APPLIES the three approved runs, each with its own reversible run id.
 * Every prior value is archived in public.program_level_archive first, so any
 * run can be undone on its own.
 *
 *  1. NJCAA divisions from njcaa-a-matched.csv (division + verified + source)
 *  2. not_offered marks: NJCAA other-sport-only gaps + league group C1
 *  3. governing-body corrections from njcaa-f + league-e, with the
 *     "domain belongs to an NCAA school" exception taking the domain path
 *
 * Run: bun tmpscripts/apply-league-runs.ts <1|2|3>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "@/lib/csv";
import { registrableDomain } from "@/lib/program-ownership";

const OUT = "/mnt/documents";
const which = process.argv[2];
if (!["1", "2", "3"].includes(which ?? "")) throw new Error("pass the run number: 1, 2 or 3");

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) => {
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`wrote ${name} (${rows.length - 1} rows)`);
};

type Row = Record<string, string>;
const read = (file: string): Row[] => {
  const rows = parseCsv(readFileSync(`${OUT}/${file}`, "utf8"));
  const head = rows[0]!.map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(r.map((v, i) => [head[i]!, v])) as Row);
};

const runId = crypto.randomUUID();
const now = new Date().toISOString();

async function archive(rows: { program_id: string; field: string; prior: string | null; next: string | null; reason: string }[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("program_level_archive").insert(
      rows.slice(i, i + 500).map((r) => ({
        run_id: runId, program_id: r.program_id, field: r.field,
        prior_value: r.prior, new_value: r.next, reason: r.reason,
      })),
    );
    if (error) throw new Error(`archive failed: ${error.message}`);
  }
}

/* ------------------------------- run 1 ------------------------------------ */

if (which === "1") {
  const matched = read("njcaa-a-matched.csv");
  console.log(JSON.stringify({ run: 1, runId, rows: matched.length }));

  const ids = [...new Set(matched.map((r) => r["program_id"]!))];
  const stored = new Map<string, { division: string | null; verification: string }>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await sb.from("programs")
      .select("id, division, division_verification").in("id", ids.slice(i, i + 500));
    if (error) throw new Error(error.message);
    for (const p of data!) stored.set(p.id, { division: p.division, verification: p.division_verification });
  }

  const applied: unknown[][] = [];
  const arch: Parameters<typeof archive>[0] = [];
  let changed = 0;
  for (const r of matched) {
    const id = r["program_id"]!;
    const cur = stored.get(id);
    if (!cur) throw new Error(`program ${id} not on file`);
    const next = r["csv_division"]!;
    arch.push({ program_id: id, field: "division", prior: cur.division, next, reason: "NJCAA division list" });
    applied.push([
      r["school_on_file"], id, r["federal_id"], r["state"], r["sport"],
      cur.division ?? "", next, cur.division === next ? "no change" : cur.division ? "correction" : "fill empty",
      r["matched_method"], r["matched_how"],
    ]);
    if (cur.division !== next || cur.verification !== "verified") changed++;
  }
  await archive(arch);

  for (const r of matched) {
    const { error } = await sb.from("programs").update({
      division: r["csv_division"], division_verification: "verified",
      division_source: "NJCAA division list", division_verified_at: now, updated_at: now,
    }).eq("id", r["program_id"]!);
    if (error) throw new Error(`update ${r["program_id"]}: ${error.message}`);
  }

  write("run1-njcaa-divisions-applied.csv", [
    ["school", "program_id", "federal_id", "state", "sport", "prior_division", "new_division",
     "change", "matched_method", "matched_how"],
    ...applied,
  ]);
  const nameBased = applied.filter((r) => r[8] !== "federal id");
  write("run1-njcaa-name-based-rows.csv", [
    ["school", "program_id", "federal_id", "state", "sport", "prior_division", "new_division",
     "change", "matched_method", "matched_how"],
    ...nameBased,
  ]);
  const { count } = await sb.from("programs").select("id", { count: "exact", head: true })
    .eq("division_verification", "verified");
  console.log(JSON.stringify({
    run: 1, runId, rowsWritten: matched.length, rowsThatChangedSomething: changed,
    nameBasedRows: nameBased.length, verifiedDivisionsNow: count,
  }));
}

/* ------------------------------- run 2 ------------------------------------ */

if (which === "2") {
  const njcaa = read("njcaa-d-gap.csv").filter((r) => (r["school_listed_by_njcaa_for_other_sport"] ?? "no") !== "no");
  const league = read("league-c1-propose-not-offered.csv");
  const targets = [
    ...njcaa.map((r) => ({ id: r["program_id"] ?? "", school: r["school"]!, sport: r["sport"]!, source: "NJCAA division list", group: "njcaa other sport only" })),
    ...league.map((r) => ({ id: r["program_id"]!, school: r["school"]!, sport: r["sport"]!, source: "league participation list", group: "league complete list" })),
  ];
  console.log(JSON.stringify({ run: 2, runId, njcaa: njcaa.length, league: league.length }));

  // njcaa-d-gap has no program_id column in older exports — resolve if needed.
  for (const t of targets) {
    if (t.id) continue;
    const { data } = await sb.from("programs").select("id, university_id, sport")
      .eq("sport", t.sport);
    void data;
    throw new Error("njcaa gap export is missing program_id — re-run the report");
  }

  const ids = targets.map((t) => t.id);
  const stored = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await sb.from("programs").select("id, offering_status").in("id", ids.slice(i, i + 500));
    if (error) throw new Error(error.message);
    for (const p of data!) stored.set(p.id, p.offering_status);
  }

  await archive(targets.map((t) => ({
    program_id: t.id, field: "offering_status", prior: stored.get(t.id) ?? null,
    next: "not_offered", reason: t.source,
  })));

  for (const t of targets) {
    const { error } = await sb.from("programs").update({
      offering_status: "not_offered", offering_source: t.source,
      offering_verified_at: now, updated_at: now,
    }).eq("id", t.id);
    if (error) throw new Error(`update ${t.id}: ${error.message}`);
  }

  write("run2-not-offered-applied.csv", [
    ["school", "program_id", "sport", "group", "prior_offering_status", "new_offering_status", "source"],
    ...targets.map((t) => [t.school, t.id, t.sport, t.group, stored.get(t.id) ?? "", "not_offered", t.source]),
  ]);
  console.log(JSON.stringify({
    run: 2, runId, rowsWritten: targets.length,
    alreadyNotOffered: targets.filter((t) => stored.get(t.id) === "not_offered").length,
  }));
}

/* ------------------------------- run 3 ------------------------------------ */

if (which === "3") {
  const njcaaRows = read("njcaa-f-governing-body-disagreement.csv").map((r) => ({
    listed: r["csv_school"]!, league: "NJCAA", sport: r["sport"]!,
    schoolId: r["school_id"]!, school: r["school_on_file"]!, programId: r["program_id"]!,
    stored: r["stored_governing_body"]!,
  }));
  const leagueRows = read("league-e-governing-body-disagreement.csv").map((r) => ({
    listed: r["listed_name"]!, league: r["league_says_governing_body"]!, sport: r["sport"]!,
    schoolId: r["school_id"]!, school: r["school_on_file"]!, programId: r["program_id"]!,
    stored: r["stored_governing_body"]!,
  }));
  const rows = [...njcaaRows, ...leagueRows];
  console.log(JSON.stringify({ run: 3, runId, njcaa: njcaaRows.length, league: leagueRows.length }));

  // NCAA member domains, for the "the domain is another (NCAA) school's" test.
  const ncaaDomains = new Map<string, string>();
  const res = await fetch("https://web3.ncaa.org/directory/api/directory/memberList?type=12", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("NCAA member list unavailable — refusing to guess the domain path");
  for (const m of (await res.json()) as any[]) {
    for (const field of [m?.athleticWebUrl, m?.webSiteUrl]) {
      const d = registrableDomain(String(field ?? ""));
      if (d) ncaaDomains.set(d, String(m?.nameOfInstitution ?? ""));
    }
  }

  const report: unknown[][] = [];
  const arch: Parameters<typeof archive>[0] = [];

  for (const r of rows) {
    const { data: prog, error } = await sb.from("programs")
      .select("id, governing_body, athletic_website, roster_url, coaching_staff_url")
      .eq("id", r.programId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!prog) throw new Error(`program ${r.programId} not on file`);
    const { data: uni } = await sb.from("universities").select("website_url, ipeds_unitid, name")
      .eq("id", r.schoolId).maybeSingle();

    const dom = registrableDomain(prog.athletic_website ?? "");
    const ownDom = registrableDomain(uni?.website_url ?? "");
    const ncaaOwner = dom && dom !== ownDom ? ncaaDomains.get(dom) : undefined;
    const path = ncaaOwner ? "domain cleared and queued for re-search" : "governing body only";

    arch.push({ program_id: prog.id, field: "governing_body", prior: prog.governing_body, next: r.league, reason: "league membership list" });
    const update: Record<string, unknown> = {
      governing_body: r.league, updated_at: now,
    };
    if (ncaaOwner) {
      for (const f of ["athletic_website", "roster_url", "coaching_staff_url"] as const) {
        const v = (prog as any)[f] as string | null;
        if (v && registrableDomain(v) === dom) {
          arch.push({ program_id: prog.id, field: f, prior: v, next: null, reason: `domain ${dom} belongs to NCAA member ${ncaaOwner}` });
          update[f] = null;
        }
      }
    }
    await archive(arch.splice(0, arch.length));
    const { error: uErr } = await sb.from("programs").update(update).eq("id", prog.id);
    if (uErr) throw new Error(`update ${prog.id}: ${uErr.message}`);

    if (ncaaOwner) {
      // Parked, exactly as the existing re-search queue is: held, unleasable.
      const { error: qErr } = await sb.from("ingest_queue").insert({
        university_id: r.schoolId, program_id: prog.id, stage: "discovery",
        status: "held", last_error: `domain cleared: belonged to NCAA member ${ncaaOwner}`,
      });
      if (qErr) throw new Error(`queue ${prog.id}: ${qErr.message}`);
    }

    report.push([
      r.listed, r.school, r.schoolId, uni?.ipeds_unitid ?? "", r.sport, r.stored, r.league,
      prog.athletic_website ?? "", dom ?? "", ncaaOwner ?? "", path,
    ]);
  }

  write("run3-governing-body-corrections.csv", [
    ["listed_name", "school_on_file", "school_id", "federal_id", "sport", "prior_governing_body",
     "new_governing_body", "prior_athletics_url", "domain", "ncaa_member_owning_domain", "path_taken"],
    ...report,
  ]);
  console.log(JSON.stringify({
    run: 3, runId, rows: rows.length,
    domainPath: report.filter((r) => r[10] === "domain cleared and queued for re-search").length,
    governingBodyOnly: report.filter((r) => r[10] === "governing body only").length,
  }));
}
