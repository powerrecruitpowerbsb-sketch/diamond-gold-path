import { readFileSync } from "node:fs";
const src = readFileSync("/tmp/aud/NelsonUnive-baseball.md","utf8");
const mod: any = await import("@/lib/roster-extract");
console.log(Object.keys(mod).join(","));
