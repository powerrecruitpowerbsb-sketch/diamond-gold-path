import { readFileSync, appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { loadProtectedHosts } from "@/lib/host-protection.server";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ACTOR = "3a59de05-6a8b-49bb-8b10-9ab281b918df";
const miss = JSON.parse(readFileSync("/tmp/j/miss.json","utf8"));
const hosts = [...new Set(miss.map((p:any)=>new URL(p.roster_url).hostname))];
const { error } = await sb.from("host_protection").update({ lifted_at: new Date().toISOString() }).in("host", hosts).is("lifted_at", null);
console.log("lifted quarantine", error?.message ?? "ok");
await loadProtectedHosts(sb);
let i = 0;
async function worker() { while (i < miss.length) { const p = miss[i++];
  try { const o:any = await ingestProgram(sb, ACTOR, p.id, { pages: "athletics" });
    appendFileSync("/tmp/j/backlog.log", JSON.stringify({ id:p.id, gb:p.governing_body, status:o?.status, players:o?.players ?? o?.rosterPlayers ?? null })+"\n");
  } catch (e) { appendFileSync("/tmp/j/backlog.log", JSON.stringify({ id:p.id, err:String(e).slice(0,150) })+"\n"); } } }
await Promise.all([1,2,3,4,5,6].map(worker));
appendFileSync("/tmp/j/backlog.log", "DONE\n");
