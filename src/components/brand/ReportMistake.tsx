import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";

import { reportProgramMistake } from "@/lib/mistakes.functions";

const FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "head_coach_name", label: "Head coach name" },
  { value: "recruiting_coordinator_name", label: "Recruiting coordinator name" },
  { value: "conference", label: "Conference" },
  { value: "division", label: "Division" },
  { value: "roster_url", label: "Roster page link" },
  { value: "coaching_staff_url", label: "Coaching staff page link" },
  { value: "athletic_website", label: "Athletics website link" },
];

/** Lets anyone flag a wrong detail: it is held back for review and looked up again. */
export function ReportMistake({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(FIELD_OPTIONS[0]!.value);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const report = useServerFn(reportProgramMistake);

  const submit = useMutation({
    mutationFn: () => report({ data: { programId, fieldName: field, note } }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["program-profile", programId] });
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex touch-target items-center gap-1.5 text-xs font-semibold text-steel underline decoration-dotted underline-offset-2 hover:text-seam-red"
      >
        <Flag className="size-3.5" aria-hidden />
        Something here is wrong
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-bold text-graphite">Report a mistake</h3>
      <p className="mt-1 text-xs text-steel">
        Tell us which detail is wrong. We remove it right away, never use that value again, and check
        the school's official pages for the right one.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-graphite">
          Which detail?
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal"
          >
            {FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-graphite">
          What should it be? (optional)
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. the head coach is now Jane Doe"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={submit.isPending}
          onClick={() => submit.mutate()}
          className="inline-flex touch-target items-center rounded-lg bg-seam-red px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submit.isPending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-steel hover:text-graphite"
        >
          Cancel
        </button>
      </div>
      {submit.isSuccess ? (
        <p className="mt-3 text-xs font-semibold text-graphite">{(submit.data as any)?.message}</p>
      ) : null}
      {submit.isError ? (
        <p className="mt-3 text-xs font-semibold text-seam-red">{(submit.error as Error).message}</p>
      ) : null}
    </div>
  );
}
