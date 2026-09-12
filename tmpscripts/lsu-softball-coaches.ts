/**
 * REPORT ONLY — read LSU's stored softball staff address and show which people
 * the PAGE assigns to softball, plus what it assigns elsewhere.
 *
 * Run: bun tmpscripts/lsu-softball-coaches.ts
 */
import { createClient } from "@supabase/supabase-js";

import { extractCoaches, classifyStaffPage } from "@/lib/coach-extract";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const { data: protection } = await sb
  .from("host_protection")
  .select("host, protection_kind")
  .is("lifted_at", null);
setProtectedHosts((protection ?? []) as any[]);

const { data: school } = await sb
  .from("universities")
  .select("id, name")
  .eq("name", "Louisiana State University")
  .maybeSingle();

const { data: programs } = await sb
  .from("programs")
  .select("id, sport, coaching_staff_url")
  .eq("university_id", school!.id);

for (const program of (programs ?? []) as any[]) {
  const url = program.coaching_staff_url;
  if (!url) {
    console.log(JSON.stringify({ sport: program.sport, url: null }, null, 2));
    continue;
  }
  let read = await safeFetch(url);
  let text = read.ok ? (read.markdown ?? read.html ?? "") : "";
  if (read.ok && text && !extractCoaches(text, program.sport, { url }).coaches.length) {
    const rendered = await safeFetch(url, { preferRendered: true });
    if (rendered.ok) {
      read = rendered;
      text = rendered.markdown ?? rendered.html ?? "";
    }
  }
  const shape = extractCoaches(text, program.sport, { url });
  console.log(
    JSON.stringify(
      {
        sport: program.sport,
        url,
        read_ok: read.ok,
        page_kind: shape.pageKind,
        page_kind_reason: classifyStaffPage({ url, text, sport: program.sport }).reason,
        head_coach: shape.headCoach,
        staff_for_this_sport: shape.coaches,
        other_sport_rows: shape.counts.otherSport,
        other_sport_sample: shape.otherSportRows.slice(0, 8),
        unattributed_rows: shape.counts.unattributed,
        failure: shape.failure,
      },
      null,
      2,
    ),
  );
}
