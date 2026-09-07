/**
 * Dropping a page that disowned the team it was filed under.
 *
 * Kept apart from the sweep and the scraper so both can use it without importing
 * each other.
 */

export type LinkField = "roster_url" | "coaching_staff_url";

const DISCOVERY_TYPE: Record<LinkField, "roster_page" | "coaching_staff_page"> = {
  roster_url: "roster_page",
  coaching_staff_url: "coaching_staff_page",
};

/**
 * Clear a link the page itself disowned, remember it so no later search proposes
 * it again, and put the team back in line to find the right page.
 */
export async function clearWrongLink(
  supabase: any,
  input: {
    programId: string;
    universityId: string;
    field: LinkField;
    url: string;
    reason: string;
    actorId?: string | null;
  },
): Promise<void> {
  await supabase
    .from("programs")
    .update({ [input.field]: null })
    .eq("id", input.programId);

  await supabase.from("rejected_values").insert({
    table_name: "programs",
    record_id: input.programId,
    field_name: input.field,
    normalized_value: input.url.trim().toLowerCase(),
    reason: input.reason,
    created_by: input.actorId ?? null,
  });

  await supabase.from("url_discovery_queue").insert({
    university_id: input.universityId,
    program_id: input.programId,
    discovery_type: DISCOVERY_TYPE[input.field],
    discovered_url: input.url,
    confidence: "failed",
    status: "rejected",
    notes: input.reason,
    reviewed_by: input.actorId ?? null,
    reviewed_at: new Date().toISOString(),
  });

  // Search again for this page, without stacking up duplicate jobs.
  const { data: existing } = await supabase
    .from("ingest_queue")
    .select("id")
    .eq("program_id", input.programId)
    .eq("stage", "url_discovery")
    .limit(1);
  const job = ((existing ?? []) as any[])[0];
  if (job) {
    await supabase
      .from("ingest_queue")
      .update({ status: "pending", attempts: 0, leased_at: null, last_error: null })
      .eq("id", job.id);
  } else {
    await supabase.from("ingest_queue").insert({
      university_id: input.universityId,
      program_id: input.programId,
      stage: "url_discovery",
      status: "pending",
    });
  }
}
