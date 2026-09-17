import { readFileSync } from "node:fs";
import { cardLines } from "@/lib/roster-extract";
const lines = cardLines(readFileSync("/tmp/d2/clemson-sb.md","utf8").split("\n").map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean));
const at = lines.findIndex(l=>l.includes("Harrington"));
console.log(JSON.stringify(lines.slice(at-6, at+12), null, 1));
