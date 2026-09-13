/**
 * Re-read every coach page the crawl refused, now that the ownership check
 * compares domains rather than page furniture. Writes only through the guarded
 * ingest path. Target list rebuilt from crawl-9-links-restored.csv.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { loadProtectedHosts, watchForProtection } from "@/lib/host-protection.server";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const ACTOR = "3a59de05-6a8b-49bb-8b10-9ab281b918df";
const targets = JSON.parse(readFileSync("/tmp/coach205.json", "utf8")) as {
  id: string;
  school: string;
  url: string;
}[];
const S = "/tmp/rerun-coach-205.json";
const st: Record<string, any> = existsSync(S) ? JSON.parse(readFileSync(S, "utf8")) : {};

await loadProtectedHosts(sb);
watchForProtection(sb);

let cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < targets.length) {
      const t = targets[cursor++]!;
      if (st[t.id]) continue;
      try {
        const o = await ingestProgram(sb, ACTOR, t.id, { pages: "athletics" });
        const cp = o.urlResults.find((r: any) => r.purpose === "Coaching staff");
        const { data: prog } = await sb
          .from("programs")
          .select("sport, head_coach_name, recruiting_coordinator_name, coaching_staff_url")
          .eq("id", t.id)
          .single();
        st[t.id] = {
          school: t.school,
          sport: prog?.sport ?? "",
          status: cp?.status ?? "none",
          detail: String(cp?.detail ?? "").slice(0, 220),
          url: cp?.url ?? prog?.coaching_staff_url ?? t.url,
          head: prog?.head_coach_name ?? "",
          coordinator: prog?.recruiting_coordinator_name ?? "",
        };
      } catch (e) {
        st[t.id] = {
          school: t.school,
          sport: "",
          status: "error",
          detail: (e as Error).message.slice(0, 220),
          url: t.url,
          head: "",
          coordinator: "",
        };
      }
      writeFileSync(S, JSON.stringify(st));
    }
  }),
);

const rows = Object.values(st) as any[];
const g = new Map<string, number>();
for (const r of rows) {
  const k = r.head
    ? "head coach name on file"
    : r.status === "rejected"
      ? "still refused"
      : r.status === "error" || r.status === "scrape_failed"
        ? "could not read the page"
        : "read, no head coach found";
  g.set(k, (g.get(k) ?? 0) + 1);
}
const esc = (v: any) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(
  "/mnt/documents/crawl-12-rerun-coach-205.csv",
  [
    ["school", "sport", "head_coach", "recruiting_coordinator", "page_status", "detail", "coach_url"].join(","),
    ...rows.map((r) =>
      [r.school, r.sport, r.head, r.coordinator, r.status, r.detail, r.url].map(esc).join(","),
    ),
  ].join("\n") + "\n",
);
console.log(JSON.stringify({ programs: rows.length, groups: Object.fromEntries(g) }, null, 2));
