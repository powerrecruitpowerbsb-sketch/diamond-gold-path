import { readFileSync } from "node:fs";
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
const miss = new Map(JSON.parse(readFileSync("/tmp/j/miss.json","utf8")).map((p:any)=>[p.id,p]));
const rows = readFileSync("/tmp/j/backlog.log","utf8").split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l)).filter(r=>r.status==="failed").slice(0,8);
await Promise.all(rows.map(async r=>{ const p:any = miss.get(r.id); const f = await safeFetch(p.roster_url,{ignoreProtection:true} as any); console.log(p.roster_url, f.ok, f.failure_category, f.fetch_method, parseRoster(f.markdown??"",p.sport).players.length); }));
