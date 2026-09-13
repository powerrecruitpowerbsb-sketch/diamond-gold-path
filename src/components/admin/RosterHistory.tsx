import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listRosterSnapshots } from "@/lib/review.functions";

type Snapshot = {
  id: string;
  season_year: number | null;
  pulled_at: string;
  position_counts: Record<string, number> | null;
  class_year_counts: Record<string, number> | null;
  transfer_count: number;
  juco_transfer_count: number;
  source_url: string | null;
};

const CLASS_ORDER = ["FR", "SO", "JR", "SR", "GR"];

function total(counts: Record<string, number> | null) {
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function countsLine(counts: Record<string, number> | null, order?: string[]) {
  if (!counts) return "—";
  const entries = Object.entries(counts).filter(([, value]) => Number(value) > 0);
  if (!entries.length) return "—";
  if (order) {
    entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  } else {
    entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  }
  return entries.map(([key, value]) => `${key} ${value}`).join(" · ");
}

export function RosterHistory({ programId }: { programId: string }) {
  const listFn = useServerFn(listRosterSnapshots);
  const { data = [], isPending } = useQuery({
    queryKey: ["roster-snapshots", programId],
    queryFn: () => listFn({ data: { programId } }),
  });

  const snapshots = data as unknown as Snapshot[];
  const maxSize = Math.max(1, ...snapshots.map((s) => total(s.position_counts)));

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-bold text-org-primary">Roster history</h2>
        <p className="text-sm text-steel">
          Roster composition captured at each refresh, most recent first.
        </p>
      </header>

      {isPending ? (
        <div className="m-5 h-24 animate-pulse rounded-lg bg-muted" />
      ) : snapshots.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-steel">
          No roster history yet — this builds up after each quarterly refresh.
        </p>
      ) : (
        <div className="space-y-5 px-5 py-4">
          <div className="flex items-end gap-3 overflow-x-auto">
            {[...snapshots]
              .reverse()
              .map((snapshot) => {
                const size = total(snapshot.position_counts);
                return (
                  <div key={snapshot.id} className="flex w-16 shrink-0 flex-col items-center gap-1">
                    <span className="meta tabular-nums">{size}</span>
                    <div className="flex h-24 w-8 flex-col justify-end overflow-hidden rounded-md bg-muted">
                      <div
                        className="w-full bg-org-primary/80"
                        style={{ height: `${Math.round((size / maxSize) * 100)}%` }}
                      />
                      <div
                        className="w-full bg-seam-red/80"
                        style={{
                          height: `${Math.round(((snapshot.transfer_count || 0) / maxSize) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="meta tabular-nums">{snapshot.season_year ?? "—"}</span>
                  </div>
                );
              })}
            <p className="meta ml-2 self-center">
              ROSTER SIZE (NAVY) · TRANSFERS (RED)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="meta py-2">PULLED</th>
                  <th className="meta py-2">SEASON</th>
                  <th className="meta py-2">SIZE</th>
                  <th className="meta py-2">TRANSFERS</th>
                  <th className="meta py-2">JUCO</th>
                  <th className="meta py-2">POSITIONS</th>
                  <th className="meta py-2">CLASS YEARS</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-border/60 align-top">
                    <td className="py-2.5 tabular-nums text-steel">
                      {new Date(snapshot.pulled_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 tabular-nums">{snapshot.season_year ?? "—"}</td>
                    <td className="py-2.5 font-semibold tabular-nums">
                      {total(snapshot.position_counts)}
                    </td>
                    <td className="py-2.5 tabular-nums">{snapshot.transfer_count}</td>
                    <td className="py-2.5 tabular-nums">{snapshot.juco_transfer_count}</td>
                    <td className="py-2.5 text-steel">{countsLine(snapshot.position_counts)}</td>
                    <td className="py-2.5 text-steel">
                      {countsLine(snapshot.class_year_counts, CLASS_ORDER)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
