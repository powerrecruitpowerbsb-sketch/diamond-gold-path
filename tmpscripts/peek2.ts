import { safeFetch } from "@/lib/safe-fetch.server";
const r = await safeFetch("https://gousfbulls.com/sports/baseball/roster");
const t = (r.markdown ?? r.html ?? "");
const i = t.indexOf("Fla.");
console.log(JSON.stringify(t.slice(i - 900, i + 300)));
