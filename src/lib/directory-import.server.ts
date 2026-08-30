/**
 * Layer 1 of the collection pipeline: build the universe of programs straight
 * from a governing body's own membership directory, so nobody hand-assembles a
 * CSV of 4,000 schools.
 *
 * The NCAA publishes a live JSON member list filtered by division and sport,
 * which is the authoritative answer to "who sponsors baseball / softball" — it
 * also carries state, conference, the school site and the athletics site, which
 * means those programs skip most of the link-discovery work.
 *
 * The other bodies (NAIA, NJCAA, CCCAA, NWAC) sit behind bot protection and
 * need a rendered scrape; they are handled by the Firecrawl discovery path.
 */

import {
  loadSchoolIndex,
  upsertUniversityAndProgram,
  type SchoolIndexEntry,
} from "@/lib/seed-import.server";

const NCAA_MEMBER_LIST = "https://web3.ncaa.org/directory/api/directory/memberList";

/** NCAA sport codes. */
const SPORT_CODES: Record<string, string> = { baseball: "MBA", softball: "WSB" };

export const NCAA_DIVISIONS = ["I", "II", "III"] as const;
export type NcaaDivision = (typeof NCAA_DIVISIONS)[number];

export type DirectoryRow = {
  name: string;
  state: string | null;
  sport: "baseball" | "softball";
  governingBody: "NCAA";
  division: string;
  conference: string | null;
  websiteUrl: string | null;
  athleticWebsite: string | null;
};

function url(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "n/a") return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function clean(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

/** Fetch one division / sport slice of the NCAA member list. */
export async function fetchNcaaDirectory(
  division: NcaaDivision,
  sport: "baseball" | "softball",
): Promise<DirectoryRow[]> {
  const sportCode = SPORT_CODES[sport];
  if (!sportCode) throw new Error(`Unsupported sport: ${sport}`);

  const params = new URLSearchParams({ division, sportCode, type: "12" });
  const response = await fetch(`${NCAA_MEMBER_LIST}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NCAA directory request failed [${response.status}]: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as any[];
  if (!Array.isArray(payload)) throw new Error("NCAA directory returned an unexpected shape");

  return payload
    .filter((row) => String(row?.deactive ?? "N").toUpperCase() !== "Y")
    .map((row) => ({
      name: String(row?.nameOfficial ?? "").trim(),
      state: clean(row?.memberOrgAddress?.state)?.toUpperCase() ?? null,
      sport,
      governingBody: "NCAA" as const,
      division: `D${division === "I" ? 1 : division === "II" ? 2 : 3}`,
      conference: clean(row?.conferenceName),
      websiteUrl: url(row?.webSiteUrl),
      athleticWebsite: url(row?.athleticWebUrl),
    }))
    .filter((row) => Boolean(row.name));
}

export type DirectoryImportResult = {
  source: string;
  fetched: number;
  schoolsCreated: number;
  programsCreated: number;
  programsUpdated: number;
  skipped: { label: string; reason: string }[];
};

/**
 * Import a fetched directory slice. Membership in the directory *is* proof the
 * school sponsors the sport, so these programs land verified rather than
 * unverified — the whole point of using the governing body's own list.
 */
export async function importDirectoryRows(
  supabase: any,
  rows: DirectoryRow[],
  source: string,
  index?: SchoolIndexEntry[],
): Promise<DirectoryImportResult> {
  const schools = index ?? (await loadSchoolIndex(supabase));
  const result: DirectoryImportResult = {
    source,
    fetched: rows.length,
    schoolsCreated: 0,
    programsCreated: 0,
    programsUpdated: 0,
    skipped: [],
  };

  for (const row of rows) {
    try {
      const outcome = await upsertUniversityAndProgram(
        supabase,
        {
          universityName: row.name,
          state: row.state,
          sport: row.sport,
          governingBody: row.governingBody,
          division: row.division,
          conference: row.conference,
          offeringStatus: "verified",
        },
        schools,
      );
      if (outcome.universityCreated) result.schoolsCreated += 1;
      if (outcome.programCreated) result.programsCreated += 1;
      if (outcome.programUpdated) result.programsUpdated += 1;

      // Fill the two links the directory hands us, without touching values a
      // human or a scrape already set.
      await fillIfEmpty(supabase, "universities", outcome.universityId, {
        website_url: row.websiteUrl,
      });
      await fillIfEmpty(supabase, "programs", outcome.programId, {
        athletic_website: row.athleticWebsite,
      });
    } catch (failure) {
      result.skipped.push({
        label: `${row.name} (${row.sport})`,
        reason: failure instanceof Error ? failure.message : "Could not import this school",
      });
    }
  }

  return result;
}

async function fillIfEmpty(
  supabase: any,
  table: "universities" | "programs",
  id: string,
  values: Record<string, string | null>,
) {
  const fields = Object.entries(values).filter(([, value]) => Boolean(value));
  if (!fields.length) return;

  const { data: current, error } = await supabase
    .from(table)
    .select(fields.map(([field]) => field).join(", "))
    .eq("id", id)
    .maybeSingle();
  if (error || !current) return;

  const patch: Record<string, string> = {};
  for (const [field, value] of fields) {
    const existing = (current as Record<string, unknown>)[field];
    if (existing === null || existing === undefined || existing === "") patch[field] = value!;
  }
  if (!Object.keys(patch).length) return;
  await supabase.from(table).update(patch).eq("id", id);
}

/** Every NCAA slice, in the order they should be pulled. */
export const NCAA_SLICES: { division: NcaaDivision; sport: "baseball" | "softball"; label: string }[] =
  NCAA_DIVISIONS.flatMap((division) =>
    (["baseball", "softball"] as const).map((sport) => ({
      division,
      sport,
      label: `NCAA D${division === "I" ? 1 : division === "II" ? 2 : 3} ${sport}`,
    })),
  );
