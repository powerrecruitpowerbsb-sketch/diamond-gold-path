/**
 * The retired Sidearm coach path, applied database-wide.
 *
 *   /sports/<sport>/roster/coaches   ->   /sports/<sport>/coaches
 *
 * One HEAD request for the stored address and one for the candidate. A stored
 * address is replaced only when it does NOT answer and the shorter one does.
 * Every change is archived under one reversible run id and written to the
 * activity history. Resumable.
 *
 *   bun tmpscripts/sidearm-coach-path.ts [--dry] [--run <uuid>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const STATE = "/tmp/sidearm-coach-path.json";
const RUN_ID =
  process.argv[process.argv.indexOf("--run") + 1]?.match(/^[0-9a-f-]{36}$/i)?.[0] ?? crypto.randomUUID();

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

type Row = { id: string; url: string; candidate: string; school: string };
type Probe = { id: string; school: string; old_url: string; new_url: string; old: string; new: string; outcome: string };

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("programs")
    .select("id, coaching_staff_url, universities(name)")
    .not("coaching_staff_url", "is", null)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  for (const p of data as any[]) {
    const url = String(p.coaching_staff_url);
    if (!/\/roster\/coaches\/?$/i.test(url)) continue;
    rows.push({
      id: p.id,
      url,
      candidate: url.replace(/\/roster\/coaches\/?$/i, "/coaches"),
      school: p.universities?.name ?? "",
    });
  }
  if (data.length < 1000) break;
}
console.log(`stored coach addresses on the retired path: ${rows.length}`);

const loaded = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
const probes: Probe[] = loaded?.probes ?? [];
const done = new Set(probes.map((p) => p.id));

const head = async (url: string) => {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
      clearTimeout(timer);
      if (method === "HEAD" && (res.status === 405 || res.status === 501)) continue;
      return String(res.status);
    } catch (error) {
      if (method === "GET") return (error as Error).name === "AbortError" ? "timeout" : "no answer";
    }
  }
  return "no answer";
};
const ok = (status: string) => /^2\d\d$/.test(status);

const queue = rows.filter((r) => !done.has(r.id));
const LANES = 8;
let cursor = 0;
await Promise.all(
  Array.from({ length: LANES }, async () => {
    for (;;) {
      const row = queue[cursor++];
      if (!row) return;
      const oldStatus = await head(row.url);
      const newStatus = ok(oldStatus) ? "not tested" : await head(row.candidate);
      probes.push({
        id: row.id,
        school: row.school,
        old_url: row.url,
        new_url: row.candidate,
        old: oldStatus,
        new: newStatus,
        outcome: ok(oldStatus)
          ? "stored address still reads — left alone"
          : ok(newStatus)
            ? "shorter address reads — replace"
            : "neither address reads — left alone",
      });
      if (probes.length % 50 === 0) {
        writeFileSync(STATE, JSON.stringify({ probes }));
        console.log(`  probed ${probes.length}/${rows.length}`);
      }
    }
  }),
);
writeFileSync(STATE, JSON.stringify({ probes }));

const replace = probes.filter((p) => p.outcome === "shorter address reads — replace");
console.log(
  JSON.stringify(
    {
      onRetiredPath: rows.length,
      storedStillReads: probes.filter((p) => p.outcome.startsWith("stored")).length,
      shorterReads: replace.length,
      neitherReads: probes.filter((p) => p.outcome.startsWith("neither")).length,
    },
    null,
    1,
  ),
);

let applied = 0;
const failures: string[] = [];
if (!DRY) {
  for (const p of replace) {
    const { data: current } = await sb
      .from("programs")
      .select("coaching_staff_url, university_id")
      .eq("id", p.id)
      .maybeSingle();
    if ((current as any)?.coaching_staff_url !== p.old_url) {
      p.outcome = "left alone — the stored address has since changed";
      continue;
    }
    const { error } = await sb
      .from("programs")
      .update({ coaching_staff_url: p.new_url, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      p.outcome = `not saved — ${error.message}`;
      failures.push(`${p.school}: ${error.message}`);
      continue;
    }
    await sb.from("program_level_archive").insert({
      run_id: RUN_ID,
      program_id: p.id,
      field: "coaching_staff_url",
      prior_value: p.old_url,
      new_value: p.new_url,
      reason: "retired Sidearm /roster/coaches path replaced with /coaches",
    });
    await sb.from("audit_log").insert({
      table_name: "programs",
      record_id: p.id,
      field_name: "coaching_staff_url",
      old_value: p.old_url,
      new_value: p.new_url,
      action: "update",
    });
    await sb
      .from("unreadable_pages")
      .update({ resolved_at: new Date().toISOString() })
      .eq("program_id", p.id)
      .eq("field", "coaching_staff_url")
      .is("resolved_at", null);
    p.outcome = "corrected and reads fine";
    applied += 1;
  }
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const out = [
  ["school", "program_id", "stored_url", "candidate_url", "stored_status", "candidate_status", "outcome"],
  ...probes.map((p) => [p.school, p.id, p.old_url, p.new_url, p.old, p.new, p.outcome]),
];
writeFileSync(
  `/mnt/documents/sidearm-coach-path${DRY ? "-dryrun" : "-applied"}.csv`,
  out.map((r) => r.map(esc).join(",")).join("\n") + "\n",
);
console.log(JSON.stringify({ runId: RUN_ID, applied, failures: failures.slice(0, 10) }, null, 1));
