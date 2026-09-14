import { readFileSync } from "node:fs";
import { cardLines } from "@/lib/roster-extract";
const md = readFileSync("/tmp/d/Raritan.md","utf8");
const lines = md.split("\n").map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean);
const out = cardLines(lines);
const i = out.findIndex(l=>l.includes("Garcia"));
console.log(JSON.stringify(out.slice(i-3,i+10),null,0));
