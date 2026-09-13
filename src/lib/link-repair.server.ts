/**
 * A failed check withholds a stored address. It never erases one.
 *
 * The old behaviour here deleted the stored page, blacklisted it forever, and
 * queued a fresh search. That cost 402 correct links when the identity check was
 * comparing school names against page navigation text, and a permanent blacklist
 * meant the correct address could never be proposed again. So nothing is
 * deleted and nothing is blacklisted: the address stays on the record, is marked
 * withheld so the product does not show it, and every withholding is written to
 * the reversible archive under a run id.
 */

export type LinkField = "roster_url" | "coaching_staff_url";

/** Loose key so two spellings of the same address count as one. */
export function linkKey(url: string): string {
  return String(url).trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export type WithholdInput = {
  runId: string;
  programId: string;
  universityId: string;
  field: LinkField | "athletic_website";
  url: string;
  reason: string;
  holderUniversityId?: string | null;
  holderProgramId?: string | null;
  actorId?: string | null;
};

/**
 * Mark a stored address as withheld: logged, archived, kept on the record.
 * Returns nothing — there is no failure path that removes data.
 */
export async function withholdLink(supabase: any, input: WithholdInput): Promise<void> {
  await supabase.from("link_conflicts").insert({
    program_id: input.programId,
    university_id: input.universityId,
    field: input.field,
    attempted_url: input.url,
    normalized_key: linkKey(input.url),
    holder_university_id: input.holderUniversityId ?? null,
    holder_program_id: input.holderProgramId ?? null,
    status: "withheld",
    detail: input.reason,
  });

  // The archive is the record of every change, reversible by run id. Nothing was
  // blanked, so prior and new value are the same address; restoring a row means
  // releasing the withholding.
  await supabase.from("link_clear_archive").insert({
    run_id: input.runId,
    university_id: input.universityId,
    program_id: input.programId,
    field: input.field,
    prior_value: input.url,
    determination: "withheld",
    evidence: input.reason,
  });

  // Look for a better page, but held: nothing can lease a held job until a
  // person releases it.
  const { data: existing } = await supabase
    .from("ingest_queue")
    .select("id, status")
    .eq("program_id", input.programId)
    .eq("stage", "url_discovery")
    .limit(1);
  const job = ((existing ?? []) as { id: string; status: string }[])[0];
  if (job) {
    if (job.status !== "pending" && job.status !== "running") {
      await supabase
        .from("ingest_queue")
        .update({ status: "held", attempts: 0, leased_at: null, last_error: input.reason })
        .eq("id", job.id);
    }
  } else {
    await supabase.from("ingest_queue").insert({
      university_id: input.universityId,
      program_id: input.programId,
      stage: "url_discovery",
      status: "held",
      last_error: input.reason,
    });
  }
}
