import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import {
  auditPageOwnership,
  clearBacklog,
  getCompletionBoard,
  queueRemainingWork,
} from "@/lib/pipeline.functions";
import { seasonLabel } from "@/lib/season";

/**
 * One board that answers "how far from finished are we?" — a team counts as done
 * only when it has a roster page, a staff page, a current roster and a head
 * coach we can show a source for.
 */
export function CompletionBoard() {
  const boardFn = useServerFn(getCompletionBoard);
  const queueFn = useServerFn(queueRemainingWork);
  const ownershipFn = useServerFn(auditPageOwnership);
  const backlogFn = useServerFn(clearBacklog);
  const queryClient = useQueryClient();

  const board = useQuery({
    queryKey: ["completion-board"],
    queryFn: () => boardFn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["completion-board"] });

  const queueWork = useMutation({
    mutationFn: () => queueFn({ data: {} }),
    onSuccess: (result: any) => {
      toast.success(
        `Lined up ${result.discovery} page searches and ${result.scrape} roster/coach pulls.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ownership = useMutation({
    mutationFn: (apply: boolean) => ownershipFn({ data: { apply } }),
    onSuccess: (result: any, apply) => {
      toast.success(
        apply
          ? `Cleared ${result.cleared} mixed-up page link(s) and queued a fresh search.`
          : `Found ${result.total} team(s) holding another school's pages.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const backlog = useMutation({
    mutationFn: (apply: boolean) => backlogFn({ data: { apply } }),
    onSuccess: (result: any, apply) => {
      const retired = result.emptyLinks?.retired ?? result.emptyLinks?.found ?? 0;
      toast.success(
        `${apply ? "Handled" : "Would handle"} ${result.facts?.applied ?? 0} fact(s) and ${result.links?.approve ?? 0} link approvals, ${result.links?.reject ?? 0} rejections${retired ? `, and cleared ${retired} empty search${retired === 1 ? "" : "es"}` : ""}.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = board.data as any;
  const done = data?.done ?? 0;
  const sponsored = data?.sponsored ?? 0;
  const percent = sponsored ? Math.round((done / sponsored) * 100) : 0;
  const busy = queueWork.isPending || ownership.isPending || backlog.isPending;

  return (
    <SectionCard
      title="How close is the database to finished?"
      blurb={`A team counts as finished when we hold its roster page, its staff page, a ${data ? seasonLabel(data.seasonYear) : "current"} roster and a head coach with a source page.`}
    >
      {board.isLoading ? <p className="text-sm text-steel">Counting…</p> : null}
      {board.error ? (
        <p className="text-sm text-seam-red">{(board.error as Error).message}</p>
      ) : null}

      {data ? (
        <>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="font-display text-3xl font-bold text-graphite">{percent}% finished</p>
              <p className="text-sm text-steel">
                {done.toLocaleString()} of {sponsored.toLocaleString()} teams
              </p>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-seam-red" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Roster page", value: data.withRosterPage },
              { label: "Staff page", value: data.withStaffPage },
              { label: `${seasonLabel(data.seasonYear)} roster`, value: data.withCurrentRoster },
              { label: "Head coach", value: data.withCoach },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-steel">{stat.label}</p>
                <p className="font-display text-xl font-bold text-graphite">
                  {Number(stat.value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Still need pages", value: data.needsLinks },
              { label: "Still need a roster", value: data.needsRoster },
              { label: "Still need a coach", value: data.needsCoach },
              { label: "Sport not confirmed", value: data.unverifiedSponsorship },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-steel">{stat.label}</p>
                <p className="font-display text-xl font-bold text-graphite">
                  {Number(stat.value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-steel">
            Waiting to be collected: {Number(data.queue?.pending ?? 0).toLocaleString()} ·{" "}
            in progress: {Number(data.queue?.running ?? 0).toLocaleString()} ·{" "}
            gave up after 3 tries: {Number(data.queue?.exhausted ?? 0).toLocaleString()}
          </p>

          {data.stalled ? (
            <p className="mt-2 rounded-lg border border-seam-red/40 bg-seam-red/10 p-3 text-sm text-seam-red">
              Collection says it's running but nothing has happened for over 10 minutes. Stop it and
              start it again below.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => queueWork.mutate()}
              className="inline-flex touch-target items-center rounded-lg bg-seam-red px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {queueWork.isPending ? "Lining up…" : "Line up everything that's missing"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => backlog.mutate(true)}
              className="inline-flex touch-target items-center rounded-lg border border-border px-4 text-sm font-semibold text-graphite disabled:opacity-60"
            >
              {backlog.isPending ? "Working through…" : "Work through the waiting items"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => ownership.mutate(false)}
              className="inline-flex touch-target items-center rounded-lg border border-border px-4 text-sm font-semibold text-graphite disabled:opacity-60"
            >
              Check for mixed-up schools
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => ownership.mutate(true)}
              className="inline-flex touch-target items-center rounded-lg border border-border px-4 text-sm font-semibold text-graphite disabled:opacity-60"
            >
              Clear the mix-ups
            </button>
          </div>

          {(ownership.data as any)?.problems?.length ? (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {(ownership.data as any).problems.slice(0, 12).map((row: any) => (
                <li key={`${row.programId}-${row.domain}`} className="p-3 text-sm">
                  <span className="font-semibold text-graphite">{row.schoolName ?? "Unknown school"}</span>{" "}
                  <span className="text-steel">
                    ({row.sport}) is using {row.domain}
                    {row.keptBy ? `, which belongs to ${row.keptBy}` : ""}.
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {(ownership.data as any)?.standoffs?.length ? (
            <div className="mt-4 rounded-xl border border-border p-3 text-sm">
              <p className="font-semibold text-graphite">Needs your eyes: two schools, one site</p>
              <p className="mt-1 text-steel">
                The address doesn't name either school, so nothing was changed. Tell me which school
                each site belongs to and I'll clear the other.
              </p>
              <ul className="mt-2 space-y-1 text-steel">
                {(ownership.data as any).standoffs.slice(0, 12).map((row: any) => (
                  <li key={row.domain}>
                    <span className="font-semibold text-graphite">{row.domain}</span> — claimed by{" "}
                    {row.schools.join(" and ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}
