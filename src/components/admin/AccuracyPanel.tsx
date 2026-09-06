import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import { getAccuracySummary, runAccuracySample } from "@/lib/pipeline.functions";

/**
 * Spot-check scoreboard. Coverage says how much is filled in; this says how much
 * of it still checks out against the page it came from.
 */
export function AccuracyPanel() {
  const summaryFn = useServerFn(getAccuracySummary);
  const sampleFn = useServerFn(runAccuracySample);
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["accuracy-summary"],
    queryFn: () => summaryFn(),
    retry: false,
  });

  const sample = useMutation({
    mutationFn: (limit: number) => sampleFn({ data: { limit } }),
    onSuccess: (result: any) => {
      const tally = result?.sample;
      toast.success(
        `Checked ${tally?.checked ?? 0}: ${tally?.match ?? 0} still correct, ${tally?.mismatch ?? 0} changed, ${tally?.unproven ?? 0} unproven.`,
      );
      queryClient.invalidateQueries({ queryKey: ["accuracy-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = summary.data as any;

  return (
    <SectionCard
      title="Accuracy spot checks"
      blurb="We re-read the exact page each head coach name came from and record whether the name is still there."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Score", value: data?.score === null || data?.score === undefined ? "—" : `${data.score}%` },
          { label: "Checked", value: data?.total ?? 0 },
          { label: "Still correct", value: data?.match ?? 0 },
          { label: "Changed", value: data?.mismatch ?? 0 },
          { label: "Unproven", value: data?.unproven ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-steel">{stat.label}</p>
            <p className="font-display text-xl font-bold text-graphite">{String(stat.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={sample.isPending}
          onClick={() => sample.mutate(12)}
          className="inline-flex touch-target items-center rounded-lg bg-seam-red px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {sample.isPending ? "Checking…" : "Check 12 at random"}
        </button>
        <span className="text-xs text-steel">
          Last check:{" "}
          {data?.lastCheckedAt
            ? new Date(data.lastCheckedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
            : "never"}
        </span>
      </div>

      {(data?.recentProblems ?? []).length ? (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {(data.recentProblems as any[]).map((row, index) => (
            <li key={`${row.programId}-${index}`} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-semibold text-graphite">{row.schoolName ?? "Unknown school"}</span>
              <span className="text-steel">{row.sport ?? ""}</span>
              <span className="text-steel">· stored “{row.storedValue ?? "—"}”</span>
              <span className="text-seam-red">· {row.detail}</span>
              {row.programId ? (
                <Link
                  to="/admin/programs/$id"
                  params={{ id: row.programId }}
                  className="ml-auto text-xs font-semibold underline decoration-dotted underline-offset-2"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-steel">No problems found in the current window.</p>
      )}
    </SectionCard>
  );
}
