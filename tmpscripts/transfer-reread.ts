/** Re-read over-flagged rosters and replace only the transfer marks.
 * Run: bun tmpscripts/transfer-reread.ts [offset] [count] */
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
import { appendFileSync, readFileSync, existsSync } from "fs";
const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const targets = JSON.parse(readFileSync("/tmp/transfer-targets.json", "utf8")) as { program_id: string; y: number; url: string; sport: string; school: string; n: number; t: number }[];
const done = new Set(existsSync("/tmp/transfer-done.jsonl") ? readFileSync("/tmp/transfer-done.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const start = Date.now();
const queue = targets.filter((t) => !done.has(`${t.program_id}:${t.y}`));
async function one(t: (typeof targets)[number]) {
  const key = `${t.program_id}:${t.y}`;
  const out: any = { key, school: t.school, sport: t.sport, before: t.t, n: t.n };
  try {
    let r = await safeFetch(t.url);
    let shape = parseRoster(r.ok ? (r.markdown ?? r.html ?? "") : "", t.sport);
    if (!shape.players.length) { r = await safeFetch(t.url, { preferRendered: true }); shape = parseRoster(r.ok ? (r.markdown ?? r.html ?? "") : "", t.sport); }
    const byName = new Map(shape.players.map((p) => [norm(p.name), p]));
    const { data: rows } = await sb.from("roster_players").select("id,name,is_transfer,is_juco_transfer").eq("program_id", t.program_id).eq("season_year", t.y);
    const matched = (rows ?? []).filter((row) => byName.has(norm(row.name)));
    out.read = shape.players.length; out.matched = matched.length;
    if (!rows?.length || matched.length < rows.length * 0.8) { out.outcome = "skipped_low_match"; return out; }
    let after = 0;
    for (const row of rows) {
      const p = byName.get(norm(row.name));
      const tr = p ? p.is_transfer : false, jc = p ? p.is_juco_transfer : false;
      if (tr) after++;
      if (tr !== row.is_transfer || jc !== row.is_juco_transfer)
        await sb.from("roster_players").update({ is_transfer: tr, is_juco_transfer: jc }).eq("id", row.id);
    }
    out.after = after; out.outcome = "updated";
  } catch (e) { out.outcome = "error"; out.detail = String(e).slice(0, 120); }
  return out;
}
let i = 0;
async function worker() { while (i < queue.length && Date.now() - start < 500_000) { const t = queue[i++]!; const o = await one(t); appendFileSync("/tmp/transfer-done.jsonl", JSON.stringify(o) + "\n"); } }
await Promise.all(Array.from({ length: 6 }, worker));
console.log("left", queue.length - i);
