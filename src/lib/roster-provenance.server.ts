/**
 * Provenance guard for extracted roster and coach rows.
 *
 * Every roster/coach write must name the page it was read from, and that
 * page's domain must be one the school legitimately holds — its own site, an
 * athletics domain already attached to this school, or a domain no other
 * school claims. Anything else is refused and parked in
 * public.roster_write_refusals for a person to look at. This is the same
 * ownership test the link clearings used, applied to the data the links
 * produced.
 */
import { pageOwnership, registrableDomain, resolveSharedDomain } from "@/lib/program-ownership";

export function sourceDomain(url: string | null | undefined): string {
  if (!url) return "";
  const host = String(url).trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").split("/")[0]!.replace(/^www\./, "");
  return registrableDomain(host);
}

export type ProvenanceVerdict =
  | { ok: true; domain: string; reason: string }
  | { ok: false; domain: string; reason: string; holder?: { id: string; name: string } | undefined };

/**
 * May this program store rows read from `sourceUrl`?
 */
export async function checkRosterSource(
  supabase: any,
  programId: string,
  sourceUrl: string | null | undefined,
): Promise<ProvenanceVerdict> {
  const domain = sourceDomain(sourceUrl);
  if (!domain) return { ok: false, domain: "", reason: "the write named no source page" };

  const { data: program, error } = await supabase
    .from("programs")
    .select("id, university_id, athletic_website, roster_url, coaching_staff_url, universities!inner(id, name, website_url)")
    .eq("id", programId)
    .single();
  if (error) throw new Error(error.message);

  const school = (program as any).universities;
  const own = [
    school?.website_url, program.athletic_website, program.roster_url, program.coaching_staff_url,
  ].map(sourceDomain).filter(Boolean);
  if (own.includes(domain)) {
    return { ok: true, domain, reason: "a domain already attached to this school" };
  }

  /* who else claims this domain? */
  const { data: rivals, error: rivalError } = await supabase
    .from("programs")
    .select("university_id, athletic_website, roster_url, coaching_staff_url, universities!inner(id, name, website_url)")
    .or(
      [
        `athletic_website.ilike.%${domain}%`,
        `roster_url.ilike.%${domain}%`,
        `coaching_staff_url.ilike.%${domain}%`,
      ].join(","),
    );
  if (rivalError) throw new Error(rivalError.message);

  const claimants = new Map<string, { id: string; name: string; website: string | null }>();
  for (const row of (rivals ?? []) as any[]) {
    const hit = [row.athletic_website, row.roster_url, row.coaching_staff_url]
      .some((u) => sourceDomain(u) === domain);
    if (!hit) continue;
    const u = row.universities;
    if (!u || u.id === school?.id) continue;
    claimants.set(u.id, { id: u.id, name: u.name, website: u.website_url ?? null });
  }

  if (!claimants.size) {
    return { ok: true, domain, reason: "no other school holds this domain" };
  }

  /* another school holds it: only the strongest claim may write */
  const claims = [
    { schoolId: school.id, name: school.name as string, verdict: pageOwnership({ url: sourceUrl, schoolName: school.name, schoolWebsite: school.website_url }) },
    ...[...claimants.values()].map((c) => ({
      schoolId: c.id, name: c.name,
      verdict: pageOwnership({ url: sourceUrl, schoolName: c.name, schoolWebsite: c.website }),
    })),
  ];
  const { winner } = resolveSharedDomain(claims);
  if (winner && winner.schoolId === school.id && winner.verdict.strength !== "unproven") {
    return { ok: true, domain, reason: `strongest claim on a shared domain (${winner.verdict.reason})` };
  }
  const holder = winner ? { id: winner.schoolId, name: winner.name } : undefined;
  return {
    ok: false,
    domain,
    reason: holder
      ? `${domain} belongs to ${holder.name}, not this school`
      : `${domain} is claimed by another school`,
    holder,
  };
}

export async function recordRefusal(
  supabase: any,
  input: {
    programId: string;
    universityId?: string | null;
    kind: "roster" | "coach" | "snapshot";
    sourceUrl: string;
    domain: string;
    reason: string;
    holderId?: string | null;
    holderDetail?: string | null;
    rows?: number;
  },
) {
  await supabase.from("roster_write_refusals").insert({
    program_id: input.programId,
    university_id: input.universityId ?? null,
    kind: input.kind,
    source_url: input.sourceUrl,
    source_domain: input.domain,
    holder_university_id: input.holderId ?? null,
    holder_detail: input.holderDetail ?? null,
    reason: input.reason,
    rows_refused: input.rows ?? 0,
  });
}
