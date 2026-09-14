import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const commits = ["a8a4096","c411fc3","ca820db","57d9032","bd1d872","7babc2d","WORKING"];
const md = { SDSU: readFileSync("/tmp/d/SDSU.md","utf8"), Raritan: readFileSync("/tmp/d/Raritan.md","utf8") };
for (const c of commits) {
  const path = "src/lib/_bisect-extract.ts";
  const src = c === "WORKING"
    ? readFileSync("src/lib/roster-extract.ts","utf8")
    : execFileSync("git",["show",`${c}:src/lib/roster-extract.ts`],{encoding:"utf8",maxBuffer:1<<26});
  writeFileSync(path, src);
  try {
    const mod = await import(`@/lib/_bisect-extract.ts?v=${c}`);
    const out = Object.entries(md).map(([k,text]) => `${k} ${mod.parseRoster(text,"baseball").counts.players}`).join("  ");
    console.log(`${c}: ${out}`);
  } catch (e) { console.log(`${c}: ERROR ${(e as Error).message.slice(0,120)}`); }
  rmSync(path);
}
