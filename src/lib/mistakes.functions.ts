/**
 * "Report a mistake" — the human safety net.
 *
 * Anyone using a program page can flag a wrong value. A report means "this looks
 * wrong", not "never suggest this again", so nothing is deleted and nothing is
 * blacklisted: the value is held back from the product, put in the review queue
 * with the reporter's note, and the school goes back in line for a fresh look at
 * its official pages.
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Fields a person may flag from a program page. */
export const REPORTABLE_PROGRAM_FIELDS = [
  "head_coach_name",
  "recruiting_coordinator_name",
  "conference",
  "division",
  "roster_url",
  "coaching_staff_url",
  "athletic_website",
] as const;

export const reportProgramMistake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { programId: string; fieldName: string; note?: string }) => {
    const programId = String(input?.programId ?? "").trim();
    const fieldName = String(input?.fieldName ?? "").trim();
    if (!programId) throw new Error("Choose a program");
    if (!(REPORTABLE_PROGRAM_FIELDS as readonly string[]).includes(fieldName)) {
      throw new Error("That detail can't be reported");
    }
    return { programId, fieldName, note: String(input?.note ?? "").trim().slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: program, error } = await supabaseAdmin
      .from("programs")
      .select("id, university_id, sport, head_coach_name, recruiting_coordinator_name, conference, division, roster_url, coaching_staff_url, athletic_website")
      .eq("id", data.programId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!program) throw new Error("That program no longer exists");

    const current = (program as Record<string, unknown>)[data.fieldName] ?? null;

    // 1. Hold it back and put it in the review queue. The value stays on the
    // record — deleting it, or blacklisting it forever, both throw away a value
    // that may well turn out to be right.
    const { error: reviewError } = await supabaseAdmin.from("pending_data_changes").insert({
      table_name: "programs",
      record_id: program.id,
      field_name: data.fieldName,
      original_value: current as any,
      proposed_value: { action: "withhold", reason: "reported wrong by a person" } as any,
      source_type: "manual",
      status: "pending",
      decided_via: "reported_by_person",
      review_note: data.note || "Reported as wrong by a person",
    });
    if (reviewError) throw new Error(reviewError.message);

    await supabaseAdmin.from("audit_log").insert({
      table_name: "programs",
      record_id: program.id,
      field_name: data.fieldName,
      action: "update",
      old_value: current === null ? null : String(current),
      new_value: current === null ? null : String(current),
      actor_id: context.userId,
    });

    // 3. Look again from the official pages.
    const { requeueSchoolForDiscovery } = await import("@/lib/discovery.server");
    const requeue = await requeueSchoolForDiscovery(supabaseAdmin as any, program.university_id);
    // Re-scrape this program's own pages too. The queue's uniqueness is a
    // partial index, so look first rather than relying on an upsert.
    const { data: existing } = await supabaseAdmin
      .from("ingest_queue")
      .select("id")
      .eq("program_id", program.id)
      .eq("stage", "program_scrape")
      .limit(1);
    if (existing && existing.length) {
      await supabaseAdmin
        .from("ingest_queue")
        .update({ status: "pending", attempts: 0, last_error: null, leased_at: null })
        .eq("id", (existing[0] as { id: string }).id);
    } else {
      await supabaseAdmin.from("ingest_queue").insert({
        university_id: program.university_id,
        program_id: program.id,
        stage: "program_scrape",
        status: "pending",
      });
    }

    return clean({
      withheld: true,
      requeued: requeue.requeued,
      message: requeue.requeued
        ? "Thanks — we've held that back for review and queued a fresh look at the school's official pages."
        : `Thanks — we've held that back for review. ${requeue.reason}`,
    });
  });
