/**
 * Which schools actually sponsor baseball and softball.
 *
 * Every college that awards athletic aid files an annual federal athletics
 * report (Equity in Athletics, ope.ed.gov) listing each varsity sport it fields
 * and how many athletes played. That report is keyed to the same federal school
 * ID we already store, so it settles sport sponsorship without a single guess.
 *
 * Nothing here is inferred by a model. A sport listed with participants is
 * offered; a sport the school did not report is not offered. When a school has
 * no filing at all we leave the slot undecided rather than assume.
 */

const EADA_API = "https://ope.ed.gov/athletics/api/institution";

export const EADA_SOURCE = "https://ope.ed.gov/athletics/";

export type SportEvidence = {
  offered: boolean;
  participants: number | null;
  year: number | null;
  sourceUrl: string;
};

export type SponsorshipReport = {
  unitid: number;
  schoolName: string | null;
  year: number | null;
  baseball: SportEvidence;
  softball: SportEvidence;
};

function cellText(cell: any): string {
  return String(cell?.Html ?? cell?.Text ?? "").replace(/<[^>]*>/g, "").trim();
}

function participantCount(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/**
 * Read the participation table out of a filing. The first table of the report is
 * "Varsity Teams — number of participants", one row per sport, men's count then
 * women's count ("N/A" where the sport isn't offered for that gender).
 */
export function parseSponsorship(payload: any, unitid: number): SponsorshipReport | null {
  const header = payload?.Header;
  if (!header) return null;
  const year = Number(header?.SurveyYear) || null;
  const sourceUrl = `${EADA_API}/${unitid}`;

  const rows: any[] = [];
  for (const group of Array.isArray(payload?.Groups) ? payload.Groups : []) {
    for (const screen of Array.isArray(group?.Screens) ? group.Screens : []) {
      for (const row of Array.isArray(screen?.Rows) ? screen.Rows : []) rows.push(row);
    }
    // Only the first group holds the participation tables; later groups repeat
    // sport names inside spending and coaching tables.
    break;
  }

  const read = (sport: "Baseball" | "Softball", column: 1 | 2): SportEvidence => {
    for (const row of rows) {
      const cells = Array.isArray(row?.Cells) ? row.Cells : [];
      if (cellText(cells[0]).toLowerCase() !== sport.toLowerCase()) continue;
      const raw = cellText(cells[column]);
      const participants = participantCount(raw);
      return {
        offered: participants != null && participants > 0,
        participants,
        year,
        sourceUrl,
      };
    }
    return { offered: false, participants: null, year, sourceUrl };
  };

  return {
    unitid,
    schoolName: header?.Name ? String(header.Name) : null,
    year,
    baseball: read("Baseball", 1),
    softball: read("Softball", 2),
  };
}

/** Fetch one school's filing. Returns null when the school has no report. */
export async function fetchSponsorship(unitid: number): Promise<SponsorshipReport | null> {
  const response = await fetch(`${EADA_API}/${unitid}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  return parseSponsorship(payload, unitid);
}

type ProgramRow = {
  id: string;
  sport: "baseball" | "softball";
  offering_status: string;
  roster_url: string | null;
};

/**
 * A sport the school doesn't field has nothing left to collect: clear its open
 * link proposals and proposed facts so they stop filling the review screens, and
 * close out its queue rows.
 */
export async function retireProgram(supabase: any, programId: string, reason: string) {
  const stamp = new Date().toISOString();

  await supabase
    .from("url_discovery_queue")
    .update({ status: "rejected", notes: reason, reviewed_at: stamp, updated_at: stamp })
    .eq("program_id", programId)
    .eq("status", "pending_review");

  await supabase
    .from("pending_data_changes")
    .update({
      status: "rejected",
      reviewed_at: stamp,
      decided_via: "auto",
      review_note: reason,
      updated_at: stamp,
    })
    .eq("record_id", programId)
    .eq("status", "pending");

  await supabase
    .from("ingest_queue")
    .update({ status: "done", last_error: reason, updated_at: stamp })
    .eq("program_id", programId)
    .in("status", ["pending", "failed"]);
}

export type SponsorshipOutcome = {
  schoolsChecked: number;
  noFiling: number;
  offered: number;
  notOffered: number;
  conflicts: number;
  failures: number;
  samples: { school: string; sport: string; decision: string }[];
};

/**
 * Work through schools whose sport slots have never been checked against the
 * federal filing. Bounded so it can be run repeatedly (or from the collection
 * pass) without ever running long.
 */
export async function syncSponsorshipBatch(
  supabase: any,
  options: { limit?: number; recheck?: boolean } = {},
): Promise<SponsorshipOutcome> {
  const limit = Math.max(1, Math.min(300, options.limit ?? 60));

  const outcome: SponsorshipOutcome = {
    schoolsChecked: 0,
    noFiling: 0,
    offered: 0,
    notOffered: 0,
    conflicts: 0,
    failures: 0,
    samples: [],
  };

  const schools = await pickSchools(supabase, limit, Boolean(options.recheck));
  if (!schools.length) return outcome;

  const workers = 6;
  let cursor = 0;

  const runOne = async (school: { id: string; name: string; ipeds_unitid: number }) => {
    const stamp = new Date().toISOString();
    let report: SponsorshipReport | null = null;
    try {
      report = await fetchSponsorship(school.ipeds_unitid);
    } catch {
      outcome.failures += 1;
      return;
    }
    outcome.schoolsChecked += 1;

    const { data: programs } = await supabase
      .from("programs")
      .select("id, sport, offering_status, roster_url")
      .eq("university_id", school.id);

    const rows = ((programs ?? []) as ProgramRow[]).filter(
      (row) => row.sport === "baseball" || row.sport === "softball",
    );

    if (!report) {
      outcome.noFiling += 1;
      for (const row of rows) {
        await supabase
          .from("programs")
          .update({ sponsorship_checked_at: stamp })
          .eq("id", row.id);
      }
      return;
    }

    for (const row of rows) {
      const evidence = row.sport === "baseball" ? report.baseball : report.softball;
      const patch: Record<string, unknown> = {
        sponsorship_checked_at: stamp,
        offering_evidence: {
          source: "federal_athletics_report",
          participants: evidence.participants,
          filing_year: evidence.year,
          source_url: evidence.sourceUrl,
          school_in_filing: report.schoolName,
        },
      };

      if (evidence.offered) {
        patch["offering_status"] = "verified";
        patch["offering_source"] = "federal_athletics_report";
        patch["offering_verified_at"] = stamp;
        outcome.offered += 1;
        if (outcome.samples.length < 12)
          outcome.samples.push({
            school: school.name,
            sport: row.sport,
            decision: `Offered — ${evidence.participants} athletes in the ${evidence.year} filing`,
          });
      } else if (
        row.offering_status === "verified" ||
        row.roster_url ||
        (evidence.year ?? 0) < new Date().getFullYear() - 3
      ) {
        // A sport we already confirmed elsewhere, or one with a live roster page,
        // is never retired on a silent filing — a person looks at it instead.
        patch["offering_source"] = "conflict_needs_review";
        outcome.conflicts += 1;
        if (outcome.samples.length < 12)
          outcome.samples.push({
            school: school.name,
            sport: row.sport,
            decision:
              (evidence.year ?? 0) < new Date().getFullYear() - 3
                ? `Only an old ${evidence.year} filing exists — left for review`
                : "Not in the federal filing, but we have other evidence — left for review",
          });
      } else {
        patch["offering_status"] = "not_offered";
        patch["offering_source"] = "federal_athletics_report";
        patch["offering_verified_at"] = stamp;
        outcome.notOffered += 1;
        if (outcome.samples.length < 12)
          outcome.samples.push({
            school: school.name,
            sport: row.sport,
            decision: `Not offered — absent from the ${evidence.year} federal filing`,
          });
      }

      const { error } = await supabase.from("programs").update(patch).eq("id", row.id);
      if (error) {
        outcome.failures += 1;
        continue;
      }

      if (patch["offering_status"] === "not_offered") {
        await retireProgram(
          supabase,
          row.id,
          `This school does not field ${row.sport} in its ${evidence.year} federal athletics filing.`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < schools.length) {
        const next = schools[cursor++];
        if (!next) return;
        await runOne(next);
      }
    }),
  );

  return outcome;
}

/** Schools still waiting on a sponsorship check, oldest first. */
async function pickSchools(
  supabase: any,
  limit: number,
  recheck: boolean,
  onlyUnverified = false,
): Promise<{ id: string; name: string; ipeds_unitid: number }[]> {
  // Drive off programs so a school whose slots are all checked drops out.
  let query = supabase
    .from("programs")
    .select("university_id, universities!inner(id, name, ipeds_unitid)")
    .not("universities.ipeds_unitid", "is", null)
    .limit(limit * 4);
  if (!recheck) query = query.is("sponsorship_checked_at", null);
  // The teams we still can't say yes or no about, whenever they were last looked at.
  if (onlyUnverified) query = query.eq("offering_status", "unverified");


  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const seen = new Map<string, { id: string; name: string; ipeds_unitid: number }>();
  for (const row of (data ?? []) as any[]) {
    const school = row.universities;
    if (!school?.id || school.ipeds_unitid == null) continue;
    if (!seen.has(school.id))
      seen.set(school.id, {
        id: school.id,
        name: String(school.name ?? ""),
        ipeds_unitid: Number(school.ipeds_unitid),
      });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** How far the sponsorship check has got, for the pipeline screen. */
export async function sponsorshipCoverage(supabase: any) {
  const count = (apply: (q: any) => any) =>
    apply(supabase.from("programs").select("id", { count: "exact", head: true })).then(
      ({ count: value, error }: any) => {
        if (error) throw new Error(error.message);
        return value ?? 0;
      },
    );

  const [total, checked, offered, notOffered, undecided, conflicts] = await Promise.all([
    count((q) => q),
    count((q) => q.not("sponsorship_checked_at", "is", null)),
    count((q) => q.eq("offering_status", "verified")),
    count((q) => q.eq("offering_status", "not_offered")),
    count((q) => q.eq("offering_status", "unverified")),
    count((q) => q.eq("offering_source", "conflict_needs_review")),
  ]);

  return { total, checked, offered, notOffered, undecided, conflicts };
}
