import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
async function all<T>(t: string, s: string, tweak?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    let q = sb.from(t).select(s).order("id", { ascending: true }).range(f, f + 999);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) throw new Error(`${t}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const progs = await all<any>("programs", "id, governing_body, division, head_coach_name, roster_url, coaching_staff_url", (q) => q.neq("offering_status", "not_offered"));
const players = await all<any>("roster_players", "id, program_id");
const withRoster = new Set(players.map((p) => p.program_id));
const key = (p: any) => (p.governing_body ?? "unknown") === "NCAA" ? `NCAA ${p.division || "?"}` : (p.governing_body ?? "unknown");
const cov = new Map<string, any>();
for (const p of progs) {
  const k = key(p);
  if (!cov.has(k)) cov.set(k, { programs: 0, roster: 0, head: 0, rosterUrl: 0 });
  const c = cov.get(k)!;
  c.programs++;
  if (withRoster.has(p.id)) c.roster++;
  if (p.head_coach_name) c.head++;
  if (p.roster_url) c.rosterUrl++;
}
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const rows = [...cov.entries()].sort((a, b) => b[1].programs - a[1].programs);
const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const header = ["governing_body","programs","with_roster_address","usable_roster","usable_roster_pct","head_coach","head_coach_pct"];
const body = rows.map(([k, c]) => [k, c.programs, c.rosterUrl, c.roster, pct(c.roster, c.programs), c.head, pct(c.head, c.programs)]);
const tot = rows.reduce((a, [,c]) => ({ programs: a.programs+c.programs, roster: a.roster+c.roster, head: a.head+c.head, rosterUrl: a.rosterUrl+c.rosterUrl }), { programs:0, roster:0, head:0, rosterUrl:0 });
body.push(["ALL", tot.programs, tot.rosterUrl, tot.roster, pct(tot.roster, tot.programs), tot.head, pct(tot.head, tot.programs)]);
await Bun.write("/mnt/documents/crawl-14-coverage-updated.csv", [header.join(","), ...body.map(r => r.map(esc).join(","))].join("\n") + "\n");
console.log(body.map(r => r.join(" | ")).join("\n"));
