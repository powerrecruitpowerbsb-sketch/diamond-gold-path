import { safeFetch } from "@/lib/safe-fetch.server";
const url = process.argv[2]!;
const r = await safeFetch(url);
const t = r.markdown ?? r.html ?? "";
console.log(r.ok, r.fetch_method, t.length);
console.log(t.slice(Number(process.argv[3] ?? 0), Number(process.argv[3] ?? 0) + 4000));
