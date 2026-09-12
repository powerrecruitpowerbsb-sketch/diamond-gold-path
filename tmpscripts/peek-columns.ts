/** REPORT ONLY — print the roster region of a stored page so the parser gap can be seen. */
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const { data: protection } = await sb.from("host_protection").select("host, protection_kind").is("lifted_at", null);
setProtectedHosts((protection ?? []) as any[]);

const url = process.argv[2]!;
const needle = new RegExp(process.argv[3] ?? "hometown", "i");
const read = await safeFetch(url);
const text = read.markdown ?? read.html ?? "";
const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
const hits: number[] = [];
lines.forEach((l, i) => {
  if (needle.test(l)) hits.push(i);
});
console.log(`read_ok=${read.ok} method=${read.fetch_method} lines=${lines.length} hits=${hits.length}`);
for (const at of hits.slice(0, 2)) {
  console.log(`----- around line ${at}`);
  console.log(lines.slice(Math.max(0, at - 4), at + 26).join("\n"));
}
