/**
 * 5A — find the websites whose own firewall refuses automated reading, using the
 * pages of the 84 authorised schools that failed last time.
 *
 * ONE plain request per website, no rendering, no retries. A confirmed firewall
 * signature is written to host_protection; anything else is left alone. No stored
 * address is read from or written to.
 *
 * Run: bun tmpscripts/step5a-probe.ts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { schoolIdsForNames } from "../src/lib/link-audit.server";
import { safeFetch } from "../src/lib/safe-fetch.server";
import { loadProtectedHosts, protectionCoverage, watchForProtection } from "../src/lib/host-protection.server";
import { SCHOOLS_84 } from "./schools-84";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

await loadProtectedHosts(supabase);
watchForProtection(supabase);

const { ids } = await schoolIdsForNames(supabase, SCHOOLS_84);

const { data: failed } = await supabase
  .from("unreadable_pages")
  .select("url, failure_category")
  .is("resolved_at", null)
  .in("university_id", ids);

const hosts = new Map<string, number>();
for (const row of ((failed ?? []) as any[])) {
  const host = hostOf(row.url);
  if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
}

console.log(`failed pages: ${(failed ?? []).length} across ${hosts.size} websites`);

const rows: string[] = ["host,failed_pages,probe_outcome,detail"];
let blockedHosts = 0;

for (const [host, count] of hosts) {
  const page = await safeFetch(`https://${host}/`, { tries: 1, ignoreProtection: true });
  const outcome = page.ok ? "reachable" : (page.failure_category ?? "unknown");
  if (outcome === "blocked_by_host") blockedHosts += 1;
  rows.push([host, String(count), outcome, `"${(page.error ?? "").replace(/"/g, "'").slice(0, 200)}"`].join(","));
  console.log(`${host} (${count} page(s)) -> ${outcome}`);
}

writeFileSync("/mnt/documents/step5a-host-probe.csv", rows.join("\n") + "\n");

const coverage = await protectionCoverage(supabase);
console.log(
  JSON.stringify(
    {
      hostsProbed: hosts.size,
      newlyBlockedInThisPass: blockedHosts,
      protectedHostsTotal: coverage.hostCount,
      programsBehindProtection: coverage.programCount,
      schoolsBehindProtection: coverage.schoolCount,
    },
    null,
    2,
  ),
);
writeFileSync(
  "/mnt/documents/step5a-protected-hosts.csv",
  ["host,protection,evidence", ...coverage.hosts.map((row) => `${row.host},"${row.kind}","${(row.evidence ?? "").replace(/"/g, "'")}"`)].join("\n") + "\n",
);
