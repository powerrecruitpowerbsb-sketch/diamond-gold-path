import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, GraduationCap, PlusCircle, Trophy, Users } from "lucide-react";

import { getAdminStats } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/form-kit";
import { ActivityFeed } from "@/components/admin/ActivityFeed";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

const STAT_META = [
  { key: "universities", label: "Universities", icon: Building2 },
  { key: "programs", label: "Programs", icon: Trophy },
  { key: "majors", label: "Majors", icon: GraduationCap },
  { key: "rosterPlayers", label: "Roster players", icon: Users },
] as const;

function AdminHome() {
  const stats = useServerFn(getAdminStats);
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: () => stats() });

  return (
    <div className="grid gap-6">
      <div className="stadium-gradient rounded-xl p-6 sm:p-8">
        <p className="meta text-white/60">Superadmin</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">
          Power Recruit data console
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/70">
          Add schools, keep sourced fields verified, and record classification intelligence. Every
          change is captured in the audit log.
        </p>
        <Button
          asChild
          className="mt-5 touch-target bg-seam-red text-white hover:bg-seam-red/90"
        >
          <Link to="/admin/schools/new">
            <PlusCircle className="size-4" aria-hidden />
            Add a new school
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_META.map((meta) => (
          <div
            key={meta.key}
            className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_14px_-8px_rgba(18,35,58,0.35)]"
          >
            <meta.icon className="size-5 text-org-primary" aria-hidden />
            <p className="mt-3 font-display text-3xl font-bold tabular text-graphite">
              {data ? data[meta.key] : "—"}
            </p>
            <p className="text-xs font-semibold tracking-wide text-steel uppercase">{meta.label}</p>
          </div>
        ))}
      </div>

      <SectionCard
        title="Recent activity"
        blurb="Who changed what, in plain English. Every write is recorded automatically."
        aside={
          <Button asChild variant="outline" className="touch-target">
            <Link to="/admin/audit">View full log</Link>
          </Button>
        }
      >
        <ActivityFeed rows={((data?.recent ?? []) as any[]).slice(0, 24)} />
      </SectionCard>
    </div>
  );
}
