import { useState } from "react";
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
    queryFn: () => listFn({ data: { status: "active", seasonId: seasonId ?? "", teamId: teamId ?? "", sport: sport ?? "" } }),
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

  const [open, setOpen] = useState<string | null>(null);
  const active = groups.find((g) => g.key === open) ?? null;

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-graphite">Needs you</h2>
        {isPending ? <span className="text-xs text-steel">Loading…</span> : null}
      </div>
      {!isPending && groups.length === 0 ? (
        <p className="mt-2 text-sm text-steel">Nothing waiting. Every player is ready.</p>
      ) : (
        <div className="mt-2 flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setOpen(open === g.key ? null : g.key)}
              aria-pressed={open === g.key}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                open === g.key ? "border-org-primary bg-org-primary/10" : "border-border bg-chalk/60"
              }`}
            >
              <g.icon className={`size-4 ${g.tone}`} aria-hidden />
              <span className="text-graphite">{g.label}</span>
              <span className="font-mono text-xs text-steel tabular-nums">{g.rows.length}</span>
            </button>
          ))}
        </div>
      )}
      {active ? (
        <ul className="mt-2 divide-y divide-border/70">
          {active.rows.slice(0, 8).map((a) => (
            <li key={a['id']}>
              <Link
                to="/roster/$id"
                params={{ id: a['id'] }}
                className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-graphite hover:text-org-primary"
              >
                <span className="truncate font-semibold">{a['name']}</span>
                <span className="ml-auto shrink-0 text-xs text-steel">{active.detail(a)}</span>
                <ChevronRight className="size-4 text-steel" aria-hidden />
              </Link>
            </li>
          ))}
          {active.rows.length > 8 ? (
            <li className="py-2">
              <Link to="/roster" className="text-xs font-semibold text-org-primary">
                +{active.rows.length - 8} more on the roster
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
