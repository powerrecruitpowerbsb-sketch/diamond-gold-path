import { readFileSync } from "node:fs";
import { cardLines } from "@/lib/roster-extract";
const lines = readFileSync("/tmp/aud/NelsonUnive-baseball.md","utf8").split("\n").map(l=>l.trim()).filter(Boolean);
const out = cardLines(lines);
const at = out.findIndex(l=>/Seth Perkins/.test(l));
console.log(out.slice(at-4, at+10).map((l,i)=>`${at-4+i}: ${JSON.stringify(l)}`).join("\n"));
