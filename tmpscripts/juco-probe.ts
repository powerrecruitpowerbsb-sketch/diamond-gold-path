import { readFileSync, writeFileSync } from "node:fs";
import { safeFetch } from "@/lib/safe-fetch.server";
import { parseRoster } from "@/lib/roster-extract";
const miss = JSON.parse(readFileSync("/tmp/j/miss.json","utf8"));
const sample = miss.filter((p:any)=>/\/\d{4}-\d{2}\/roster/.test(p.roster_url)).sort(()=>Math.random()-0.5).slice(0,12);
const out:any[] = [];
await Promise.all(sample.map(async (p:any, i:number) => {
  const r = await safeFetch(p.roster_url, { preferRendered: true } as any);
  const t = r.ok ? (r.markdown ?? r.html ?? "") : "";
  const s = parseRoster(t, p.sport);
  writeFileSync(`/tmp/j/p${i}.md`, t);
  out.push({ i, url: p.roster_url, ok: r.ok, status: (r as any).status, err: (r as any).error, len: t.length, players: s.players.length, flags: s.flags });
}));
console.log(JSON.stringify(out.sort((a,b)=>a.i-b.i), null, 0));
