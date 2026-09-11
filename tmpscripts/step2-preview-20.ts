/**
 * STEP 2 — discovery PREVIEW on 20 named schools. Nothing is written.
 *
 * Reuses the identity-bound discovery path (discoverAthleticWebsite +
 * discoverProgramPages) directly, bypassing discoverUniversityUrls so that no
 * row is ever inserted into url_discovery_queue. Every candidate the search
 * considered is captured through the trace callback, and every proposed page is
 * read once through safeFetch to say whether it is actually readable.
 *
 * Run: bun tmpscripts/step2-preview-20.ts
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  discoverAthleticWebsite,
  discoverProgramPages,
  loadRejectedUrls,
  normalizeUrl,
  type CandidateTrace,
  type DiscoveryResult,
} from "@/lib/discovery.server";
import { loadInstitution } from "@/lib/institution-identity.server";
import { classifyLink } from "@/lib/link-quality";
import { replacementDecision, verifyPagePurpose } from "@/lib/page-purpose";
import { safeFetch, setProtectedHosts } from "@/lib/safe-fetch.server";

const CLEAR_RUN = "db7abfd2-c5fd-45bc-893b-34992d4bdfe1";
const OUT = "/mnt/documents";

const NAMES = [
  "University of Central Florida",
  "University of South Florida",
  "Stetson University",
  "Rollins College",
  "Florida Southern College",
  "Eckerd College",
  "Saint Leo University",
  "Florida Gulf Coast University",
  "Louisiana State University",
  "Vanderbilt University",
  "Wake Forest University",
  "University of Arkansas",
  "University of Tennessee",
  "University of Texas at Austin",
  "Broward College",
  "South Florida State College",
  "Florida Gateway College",
  "North Florida Community College",
  "Chipola College",
  "Santa Fe College",
];

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name: string, rows: unknown[][]) =>
  writeFileSync(`${OUT}/${name}`, rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const FIELD_OF: Record<string, string> = {
  athletic_website: "athletic_website",
  roster_page: "roster_url",
  coaching_staff_page: "coaching_staff_url",
};

async function main() {
  const { data: protection } = await sb
    .from("host_protection")
    .select("host, protection_kind")
    .is("lifted_at", null);
  setProtectedHosts((protection ?? []) as any[]);

  // Resolve each requested school to exactly one record. Ambiguity is reported,
  // never guessed at.
  const { data: allSchools } = await sb
    .from("universities")
    .select("id, name, state, website_url, ipeds_unitid")
    .in("name", NAMES);
  const byName = new Map<string, any[]>();
  for (const row of (allSchools ?? []) as any[]) {
    const list = byName.get(row.name) ?? [];
    list.push(row);
    byName.set(row.name, list);
  }

  const { data: archive } = await sb
    .from("link_clear_archive")
    .select("university_id, program_id, field, prior_value")
    .eq("run_id", CLEAR_RUN);
  const clearedBySchool = new Map<string, any[]>();
  for (const row of (archive ?? []) as any[]) {
    const list = clearedBySchool.get(row.university_id) ?? [];
    list.push(row);
    clearedBySchool.set(row.university_id, list);
  }

  const proposals: unknown[][] = [
    ["school", "state", "institution_id", "sport", "field", "proposed_url", "confidence",
     "evidence_check", "evidence_detail", "evidence_institution_domain", "page_read_ok",
     "page_read_detail", "page_kind_check", "page_kind_ok", "page_kind_reason",
     "stored_value", "differs_from_stored", "stored_page_ok", "action", "action_reason",
     "was_cleared_in_run", "notes"],
  ];
  const nothing: unknown[][] = [["school", "state", "institution_id", "field", "sport", "why"]];
  const considered: unknown[][] = [["school", "institution_id", "stage", "sport", "candidate_url", "outcome", "reason"]];
  const diffs: unknown[][] = [["school", "institution_id", "sport", "field", "stored_value", "proposed_url", "kind_of_difference"]];
  const clearedNote: unknown[][] = [["school", "institution_id", "sport", "field", "cleared_value_in_run", "refilled_by_preview", "proposed_url"]];

  for (const name of NAMES) {
    const matches = byName.get(name) ?? [];
    if (matches.length !== 1) {
      nothing.push([name, "", "", "(all)", "(all)",
        matches.length === 0
          ? "No school record with this exact name — nothing to run discovery against."
          : `${matches.length} school records share this name; discovery was not run to avoid touching the wrong one.`]);
      continue;
    }
    const school = matches[0]!;
    const inst = await loadInstitution(sb, school.id);
    const { data: programs } = await sb
      .from("programs")
      .select("id, sport, athletic_website, roster_url, coaching_staff_url")
      .eq("university_id", school.id)
      .neq("offering_status", "not_offered");
    const programRows = (programs ?? []) as any[];
    const excluded = await loadRejectedUrls(sb, school.id);
    const cleared = clearedBySchool.get(school.id) ?? [];

    const trace: CandidateTrace = (row) =>
      considered.push([name, inst.unitid ?? "", row.stage, row.sport ?? "", row.url, row.outcome, row.reason]);

    let results: DiscoveryResult[] = [];
    let failure: string | null = null;
    try {
      const site = await discoverAthleticWebsite(sb, inst, excluded, school.website_url ?? null, trace);
      results.push(site);
      if (site.url) {
        results.push(
          ...(await discoverProgramPages(sb, inst, site.url, programRows.map((p) => ({ id: p.id, sport: p.sport })), excluded, trace)),
        );
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : "discovery failed";
    }
    if (failure) {
      nothing.push([name, school.state ?? "", inst.unitid ?? "", "(all)", "(all)", `Discovery could not run: ${failure}`]);
      continue;
    }

    // Same link-quality gate the real run applies before anything is offered.
    for (const r of results) {
      if (!r.url) continue;
      const verdict = classifyLink({
        kind: r.discoveryType,
        url: r.url,
        sport: r.sport ?? null,
        schoolWebsite: school.website_url ?? null,
      });
      if (verdict.action === "reject") {
        considered.push([name, inst.unitid ?? "", r.discoveryType, r.sport ?? "", r.url, "rejected", verdict.reason]);
        r.url = null;
        r.confidence = "failed";
        r.notes = `Discarded automatically: ${verdict.reason}`;
      } else if (verdict.normalizedUrl) r.url = verdict.normalizedUrl;
    }

    for (const r of results) {
      const field = FIELD_OF[r.discoveryType]!;
      const program = r.programId ? programRows.find((p) => p.id === r.programId) : null;
      const sport = r.sport ?? (program?.sport ?? "");

      if (!r.url) {
        nothing.push([name, school.state ?? "", inst.unitid ?? "", field, sport, r.notes]);
        continue;
      }

      const read = await safeFetch(r.url);
      const readDetail = read.ok
        ? `read with the ${read.fetch_method} method`
        : `${read.failure_category ?? "unreadable"}: ${read.error ?? "no detail"}`;

      // Page-level gate: right kind of page, right sport.
      const pageText = read.ok ? (read.markdown ?? read.html ?? null) : null;
      const purpose = verifyPagePurpose({
        kind: r.discoveryType,
        url: r.url,
        sport: sport || null,
        text: pageText,
        schoolWebsite: school.website_url ?? null,
        federalWebsite: inst.federalWebsite ?? null,
      });

      // Stored value for the same field: athletics site lives on each program row.
      const stored =
        r.discoveryType === "athletic_website"
          ? (programRows[0]?.athletic_website ?? null)
          : ((program ?? {})[field] ?? null);
      const differs = normalizeUrl(stored) !== normalizeUrl(r.url);

      let storedOk = "";
      let decision = { action: "fill_empty", reason: "Nothing on file." } as ReturnType<typeof replacementDecision>;
      if (stored && differs) {
        const oldRead = await safeFetch(stored);
        const oldPurpose = verifyPagePurpose({
          kind: r.discoveryType,
          url: stored,
          sport: sport || null,
          text: oldRead.ok ? (oldRead.markdown ?? oldRead.html ?? null) : null,
          schoolWebsite: school.website_url ?? null,
          federalWebsite: inst.federalWebsite ?? null,
        });
        storedOk = oldRead.ok ? (oldPurpose.ok ? "yes" : "no") : "not read";
        decision = replacementDecision({
          storedValue: stored,
          proposedRead: read.ok,
          proposedVerified: purpose.ok,
          storedFails: oldRead.ok && !oldPurpose.ok,
        });
      } else if (!differs) {
        decision = { action: "keep_stored", reason: "Same address already on file." };
      } else {
        decision = replacementDecision({
          storedValue: null,
          proposedRead: read.ok,
          proposedVerified: purpose.ok,
          storedFails: false,
        });
      }

      const clearedHere = cleared.find(
        (c) => c.field === field && (!r.programId || c.program_id === r.programId),
      );

      proposals.push([
        name, school.state ?? "", inst.unitid ?? "", sport, field, r.url,
        // Unread or unverified pages are never high confidence.
        purpose.ok && read.ok ? r.confidence : "unverified",
        r.evidence?.check ?? "", r.evidence?.detail ?? "", r.evidence?.institutionDomain ?? "",
        read.ok ? "yes" : "no", readDetail, purpose.code, purpose.ok ? "yes" : "no", purpose.reason,
        stored ?? "", differs ? "yes" : "no", storedOk, decision.action, decision.reason,
        clearedHere ? "yes" : "no", r.notes,
      ]);

      if (differs) {
        diffs.push([name, inst.unitid ?? "", sport, field, stored ?? "", r.url,
          stored ? "different address stored" : "nothing stored today"]);
      }
      if (clearedHere) {
        clearedNote.push([name, inst.unitid ?? "", sport, field, clearedHere.prior_value, "yes", r.url]);
      }
    }

    // Cleared addresses this preview did NOT refill.
    for (const c of cleared) {
      const refilled = proposals.some(
        (row) => row[0] === name && row[4] === c.field && row[5],
      );
      if (!refilled) {
        const program = programRows.find((p) => p.id === c.program_id);
        clearedNote.push([name, inst.unitid ?? "", program?.sport ?? "", c.field, c.prior_value, "no", ""]);
      }
    }
  }

  write("step2-preview-proposals.csv", proposals);
  write("step2-preview-nothing-proposed.csv", nothing);
  write("step2-preview-candidates-considered.csv", considered);
  write("step2-preview-differs-from-stored.csv", diffs);
  write("step2-preview-cleared-run-refill.csv", clearedNote);

  console.log(JSON.stringify({
    schoolsRequested: NAMES.length,
    proposalRows: proposals.length - 1,
    nothingProposedRows: nothing.length - 1,
    candidatesConsidered: considered.length - 1,
    differsFromStored: diffs.length - 1,
    clearedRunRows: clearedNote.length - 1,
    readable: proposals.slice(1).filter((r) => r[10] === "yes").length,
    high: proposals.slice(1).filter((r) => r[6] === "high").length,
    low: proposals.slice(1).filter((r) => r[6] === "low").length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
