import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";

import { listRosterSnapshots } from "@/lib/review.functions";

type Snapshot = {
  id: string;
  season_year: number | null;
  pulled_at: string;
  position_counts: Record<string, number> | null;
  class_year_counts: Record<string, number> | null;
  transfer_count: number | null;
  juco_transfer_count: number | null;
  source_url: string | null;
};

function CountRow({ counts }: { counts: Record<string, number> | null }) {
  const entries = Object.entries(counts ?? {}).filter(([, value]) => Number(value) > 0);
  if (entries.length === 0) return <span className="text-steel">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-graphite"
        >
          {key} {value}
        </span>
      ))}
    </span>
  );
}

export function RosterHistory({ programId }: { programId: string }) {
  const fetchSnapshots = useServerFn(listRosterSnapshots);
  const { data: rows = [], isPending } = useQuery({
    queryKey: ["roster-snapshots", programId],
    queryFn: () => fetchSnapshots({ data: { programId } }),
  });

  const snapshots = rows as Snapshot[];

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <History className="size-4 text-steel" aria-hidden />
        <div>
          <h2 className="font-display text-lg font-bold text-graphite">Roster history</h2>
          <p className="text-sm text-steel">
            Composition captured at each roster refresh, most recent first.
          </p>
        </div>
      </header>

      {isPending ? (
        <div className="m-5 h-20 animate-pulse rounded-lg bg-muted" />
      ) : snapshots.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-steel">
          No roster history yet — this builds up after each quarterly refresh.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="meta px-5 py-2">PULLED</th>
                <th className="meta px-5 py-2">SEASON</th>
                <th className="meta px-5 py-2">POSITIONS</th>
                <th className="meta px-5 py-2">CLASS YEARS</th>
                <th className="meta px-5 py-2">TRANSFERS</th>
                <th className="meta px-5 py-2">JUCO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {snapshots.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums text-graphite">
                    {new Date(row.pulled_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-graphite">{row.season_year ?? "—"}</td>
                  <td className="px-5 py-3">
                    <CountRow counts={row.position_counts} />
                  </td>
                  <td className="px-5 py-3">
                    <CountRow counts={row.class_year_counts} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-graphite">{row.transfer_count ?? 0}</td>
                  <td className="px-5 py-3 tabular-nums text-graphite">
                    {row.juco_transfer_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
