import { readFileSync } from "node:fs";
import { cardLines } from "@/lib/roster-extract";
const md = readFileSync("/tmp/d/Raritan.md","utf8");
// mimic normalizeLines partially: same split/clean as parseRoster's first step
const lines = md.split("\n").map(l=>l.replace(/\bOpens in a new window\b/gi,"").replace(/\s+/g," ").trim()).filter(Boolean);
const merged: string[] = [];
for (const line of lines) {
  const prev = merged[merged.length-1];
  if (line.startsWith("|") && prev && !prev.endsWith("|") && !/^\|?[\s:-]+\|/.test(line)) { merged[merged.length-1] = `${prev} ${line}`; continue; }
  merged.push(line);
}
const out = cardLines(merged);
const i = out.findIndex(l=>l.includes("Garcia"));
console.log(JSON.stringify(out.slice(i-4,i+9),null,0));
