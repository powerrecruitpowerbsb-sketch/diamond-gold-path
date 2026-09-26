import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ChevronRight, Film, GraduationCap, Ruler } from "lucide-react";

import { listOrgAthletes } from "@/lib/athletes.functions";

type Props = { seasonId?: string; teamId?: string; sport?: string };

/** Coach to-do list: each item links straight to the player who needs it. */
export function ActionsPanel({ seasonId, teamId, sport }: Props) {
  const listFn = useServerFn(listOrgAthletes);
  const { data, isPending } = useQuery({
    queryKey: ["org-athletes", "actions", seasonId, teamId, sport],
    queryFn: () => listFn({ data: { status: "active", seasonId, teamId, sport } }),
    retry: false,
  });
  const athletes = (data?.athletes ?? []) as Record<string, any>[];

  const groups = [
    {
      key: "verify",
      icon: BadgeCheck,
      label: "Verify numbers",
      tone: "text-diamond-green",
      rows: athletes.filter((a) => (a['unverified_count'] ?? 0) > 0),
      detail: (a: Record<string, any>) => `${a['unverified_count']} waiting`,
    },
    {
      key: "schools",
      icon: GraduationCap,
      label: "Pick colleges",
      tone: "text-seam-red",
      rows: athletes.filter((a) => (a['school_count'] ?? 0) === 0),
      detail: () => "No colleges yet",
    },
    {
      key: "video",
      icon: Film,
      label: "Get video",
      tone: "text-seam-red",
      rows: athletes.filter((a) => (a['video_count'] ?? 0) === 0),
      detail: () => "No clips",
    },
    {
      key: "numbers",
      icon: Ruler,
      label: "Record numbers",
      tone: "text-seam-red",
      rows: athletes.filter((a) => (a['metric_count'] ?? 0) === 0),
      detail: () => "No numbers",
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
      <h2 className="font-display text-xl font-bold text-graphite">Actions</h2>
      {isPending ? (
        <p className="mt-3 text-sm text-steel">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 text-sm text-steel">Nothing waiting. Every player is ready.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg border border-border bg-chalk/60 p-3">
              <p className={`flex items-center gap-2 text-sm font-bold ${g.tone}`}>
                <g.icon className="size-4" aria-hidden /> {g.label}
                <span className="ml-auto font-mono text-xs text-steel">{g.rows.length}</span>
              </p>
              <ul className="mt-2 divide-y divide-border/70">
                {g.rows.slice(0, 5).map((a) => (
                  <li key={a['id']}>
                    <Link
                      to="/roster/$id"
                      params={{ id: a['id'] }}
                      className="flex min-h-11 items-center gap-2 text-sm text-graphite hover:text-org-primary"
                    >
                      <span className="font-semibold">{a['name']}</span>
                      <span className="ml-auto text-xs text-steel">{g.detail(a)}</span>
                      <ChevronRight className="size-4 text-steel" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              {g.rows.length > 5 ? (
                <Link to="/roster" className="mt-1 inline-block text-xs font-semibold text-org-primary">
                  +{g.rows.length - 5} more on the roster
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
