import { readFileSync } from "node:fs";
const md = readFileSync("/tmp/d/Raritan.md","utf8");
const lines = md.split("\n").map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean);
console.log("pipeOnly", lines.filter(l=>/^\|+$/.test(l)).length);
const i = lines.findIndex(l=>l.includes("Garcia"));
console.log(JSON.stringify(lines.slice(i-6,i+22),null,0));
