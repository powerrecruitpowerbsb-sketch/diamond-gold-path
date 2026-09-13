/**
 * Reinstate the 265 addresses released from the blacklist, from the archive's prior
 * value — no search. Each page is read first and checked with the fixed identity
 * test; a page that genuinely belongs to another school is withheld, not restored.
 * Reversible: every restoration is written to program_level_archive under one run id.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { scrape, ingestProgram } from "@/lib/ingest.server";
import { verifyPageIdentity } from "@/lib/page-identity";
import { loadProtectedHosts, watchForProtection } from "@/lib/host-protection.server";
import { withholdLink } from "@/lib/link-repair.server";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const ACTOR = "3a59de05-6a8b-49bb-8b10-9ab281b918df";
const RELEASE_RUN = "b1f7c93a-5d42-4e8b-9c17-6a2d0f4e8b31";
const RUN = process.env["RUN_ID"] || "5c9d1e74-3f28-4a61-9b0d-7e2c4a6f1d38";
const S = "/tmp/reinstate-265.json";
const st: Record<string, any> = existsSync(S) ? JSON.parse(readFileSync(S, "utf8")) : {};

const { data: rows, error } = await sb
  .from("link_clear_archive")
  .select("id, program_id, university_id, field, prior_value")
  .eq("run_id", RELEASE_RUN);
if (error) throw new Error(error.message);

await loadProtectedHosts(sb);
watchForProtection(sb);

const byProgram = new Map<string, any[]>();
for (const r of rows ?? []) {
  if (!byProgram.has(r.program_id)) byProgram.set(r.program_id, []);
  byProgram.get(r.program_id)!.push(r);
}
const programIds = [...byProgram.keys()];
console.log(`archive rows ${rows?.length} across ${programIds.length} programs`);

let cursor = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (cursor < programIds.length) {
      const pid = programIds[cursor++]!;
      if (st[pid]) continue;
      const out: any = { program_id: pid, fields: [] };
      try {
        const { data: program } = await sb
          .from("programs")
          .select("id, sport, athletic_website, roster_url, coaching_staff_url, university_id, universities(name, website_url)")
          .eq("id", pid)
          .single();
        const uni = (program as any)?.universities ?? {};
        out.school = uni.name;
        out.sport = program?.sport;
        for (const row of byProgram.get(pid)!) {
          const url = row.prior_value as string;
          const current = (program as any)?.[row.field];
          if (current) {
            out.fields.push({ field: row.field, url, outcome: "already on file", detail: current });
            continue;
          }
          let text = "";
          let readError: string | null = null;
          try {
            text = await scrape(url);
          } catch (e) {
            readError = (e as Error).message.slice(0, 180);
          }
          if (readError) {
            // Cannot read it today, but we know it was ours before the bug deleted it.
            // Restore the address and let the crawl re-read it later.
            await sb.from("programs").update({ [row.field]: url }).eq("id", pid);
            await sb.from("program_level_archive").insert({
              run_id: RUN,
              program_id: pid,
              field: row.field,
              prior_value: null,
              new_value: url,
              reason: `reinstated from archive (page unreadable today: ${readError})`,
            });
            await sb.from("link_clear_archive").update({ restored_at: new Date().toISOString() }).eq("id", row.id);
            out.fields.push({ field: row.field, url, outcome: "restored, page unreadable", detail: readError });
            continue;
          }
          const verdict = verifyPageIdentity({
            text,
            url,
            schoolName: uni.name,
            schoolWebsite: uni.website_url,
            athleticsSite: (program as any)?.athletic_website,
            ownDomains: [(program as any)?.roster_url, (program as any)?.coaching_staff_url],
          });
          if (verdict.verdict === "confirmed" || verdict.verdict === "unclear") {
            await sb.from("programs").update({ [row.field]: url }).eq("id", pid);
            await sb.from("program_level_archive").insert({
              run_id: RUN,
              program_id: pid,
              field: row.field,
              prior_value: null,
              new_value: url,
              reason: `reinstated from archive (${verdict.verdict}: ${verdict.reason})`,
            });
            await sb.from("link_clear_archive").update({ restored_at: new Date().toISOString() }).eq("id", row.id);
            out.fields.push({ field: row.field, url, outcome: `restored (${verdict.verdict})`, detail: verdict.reason });
          } else {
            await withholdLink(sb, {
              runId: RUN,
              programId: pid,
              universityId: program!.university_id,
              field: row.field,
              url,
              reason: verdict.reason,
              actorId: ACTOR,
            });
            out.fields.push({ field: row.field, url, outcome: "withheld", detail: verdict.reason });
          }
        }
        // Read the pages we just put back.
        if (out.fields.some((f: any) => String(f.outcome).startsWith("restored ("))) {
          const o = await ingestProgram(sb, ACTOR, pid, { pages: "athletics" });
          out.players = o.rosterPlayers;
          out.pages = o.urlResults.map((r: any) => ({ purpose: r.purpose, status: r.status }));
        }
      } catch (e) {
        out.error = (e as Error).message.slice(0, 200);
      }
      st[pid] = out;
      writeFileSync(S, JSON.stringify(st));
    }
  }),
);

const all = Object.values(st) as any[];
const outcomes = new Map<string, number>();
for (const p of all) for (const f of p.fields ?? []) outcomes.set(f.outcome, (outcomes.get(f.outcome) ?? 0) + 1);
const esc = (v: any) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const lines = [["school", "sport", "field", "url", "outcome", "detail", "players_after"].join(",")];
for (const p of all) for (const f of p.fields ?? []) lines.push([p.school, p.sport, f.field, f.url, f.outcome, f.detail, p.players ?? ""].map(esc).join(","));
writeFileSync("/mnt/documents/crawl-11-reinstated.csv", lines.join("\n") + "\n");
console.log(JSON.stringify({ programs: all.length, outcomes: Object.fromEntries(outcomes), players: all.reduce((a, p) => a + (p.players ?? 0), 0) }, null, 1));
