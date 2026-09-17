import { readFileSync } from "node:fs";
import { parseRoster } from "@/lib/roster-extract";
for (const p of parseRoster(readFileSync("/tmp/d2/clemson-sb.md","utf8"),"softball").players)
  console.log(`${p.number}\t${p.name}\t${p.position}\t${p.class_year}\t${p.hometown}`);
