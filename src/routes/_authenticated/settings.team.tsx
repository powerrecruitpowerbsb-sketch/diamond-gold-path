import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { InvitePanel } from "@/components/admin/InvitePanel";
import { TeamsSeasonsPanel } from "@/components/admin/TeamsSeasons";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { useSeasonContext } from "@/hooks/use-season-context";
import { getSeasonDetail, setTeamCoach } from "@/lib/seasons.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/team")({
  head: () => ({
    meta: [
      { title: "Club management — Curve Recruit" },
      { name: "description", content: "Invite staff and families, assign coaches to teams, and run seasons." },
      { property: "og:title", content: "Club management — Curve Recruit" },
      { property: "og:description", content: "Staff, families, teams and seasons in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: "staff" | "families" | "teams" } =>
    s.tab === "families" || s.tab === "teams" || s.tab === "staff" ? { tab: s.tab } : {},
  component: ClubManagement,
});

const TABS = [
  { id: "staff", label: "Staff" },
  { id: "families", label: "Players & Families" },
  { id: "teams", label: "Teams & Seasons" },
] as const;

const CARD =
  "rounded-xl border border-border bg-card p-4 sm:p-5 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

function ClubManagement() {
  const { tab = "staff" } = Route.useSearch();
  const navigate = useNavigate({ from: "/settings/team" });
  const setTab = (next: (typeof TABS)[number]["id"]) => navigate({ search: { tab: next }, replace: true });
  return (
    <AppShell right={<AuthButton />}>
      <div className="stadium-gradient rounded-2xl px-5 py-7 sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.18em] text-org-accent uppercase">YOUR HUB FOR INVITES</p>
        <h1 className="font-display mt-2 text-[2rem] leading-tight font-bold text-white sm:text-4xl">
          Club Management
        </h1>
      </div>

      <div className="mt-6 flex max-w-full overflow-x-auto rounded-lg sm:inline-flex border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "touch-target shrink-0 whitespace-nowrap rounded-md px-4 text-sm font-semibold",
              tab === t.id ? "bg-org-primary text-org-primary-foreground" : "text-steel hover:text-graphite",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === "teams" ? "" : "max-w-5xl"}>
        {tab === "teams" ? (
          <TeamsSeasonsPanel />
        ) : tab === "staff" ? (
          <>
            <StaffDirectory />
            <InvitePanel
              title="Invite staff"
              description="Enter email(s) below"
              roles={[
                { value: "org_staff", label: "Coach", hint: "" },
                { value: "org_admin", label: "Admin", hint: "Runs invites, teams and seasons." },
              ]}
              peopleLabel="Accounts"
              emptyPeople="No staff yet."
            />
          </>
        ) : (
          <div className={cn(CARD, "mt-6")}>
            <p className={LABEL}>Players &amp; parents</p>
            <p className="mt-2 text-sm text-steel">
              Family invites go out from each player's page, or in bulk with the importer.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/roster/import"
                className="touch-target inline-flex items-center gap-2 rounded bg-seam-red px-4 text-sm font-semibold text-white"
              >
                <Upload className="size-4" aria-hidden /> Bulk import + invite
              </Link>
              <Link
                to="/roster/new"
                className="touch-target inline-flex items-center gap-2 rounded border border-border px-4 text-sm font-semibold text-graphite"
              >
                <UserPlus className="size-4" aria-hidden /> Add one player
              </Link>
              <Link
                to="/roster"
                className="touch-target inline-flex items-center gap-2 rounded border border-border px-4 text-sm font-semibold text-graphite"
              >
                Roster
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StaffDirectory() {
  const ctx = useSeasonContext();
  const qc = useQueryClient();
  const detailFn = useServerFn(getSeasonDetail);
  const coachFn = useServerFn(setTeamCoach);
  const { data, isPending } = useQuery({
    queryKey: ["season-detail", ctx.seasonId],
    queryFn: () => detailFn({ data: { seasonId: ctx.seasonId } }),
    enabled: Boolean(ctx.seasonId),
    retry: false,
  });

  const teams = data?.teams ?? [];
  const staff = data?.staff ?? [];

  async function toggle(teamId: string, userId: string, assigned: boolean) {
    try {
      await coachFn({ data: { teamId, userId, assigned } });
      await qc.invalidateQueries({ queryKey: ["season-detail"] });
      toast.success(assigned ? "Coach assigned" : "Coach removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className={cn(CARD, "mt-6")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-graphite">Staff</h2>
        {data?.season ? <span className={LABEL}>{data.season.name} season</span> : null}
      </div>
      {!ctx.seasonId && !ctx.isPending ? (
        <p className="mt-3 text-sm text-steel">
          Create a season on the Teams & Seasons tab to assign coaches.
        </p>
      ) : isPending ? (
        <p className="mt-3 text-sm text-steel">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="mt-3 text-sm text-steel">No staff yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {staff.map((member) => {
            const mine = teams.filter((t) => t.coaches.some((c) => c.userId === member.id));
            const open = teams.filter((t) => !mine.includes(t));
            return (
              <li key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-56">
                  <p className="truncate font-semibold text-graphite">{member.name}</p>
                  <p className="truncate font-mono text-[11px] text-steel">
                    {member.role === "org_admin" ? "ADMIN" : "COACH"}
                    {member.orgWideAccess ? " · ORG-WIDE" : ""}
                  </p>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {mine.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full border border-org-primary/40 bg-org-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-semibold text-graphite"
                    >
                      {t.name}
                      <button
                        type="button"
                        aria-label={`Remove from ${t.name}`}
                        onClick={() => toggle(t.id, member.id, false)}
                        className="rounded-full p-0.5 text-steel hover:text-seam-red"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {open.length ? (
                    <select
                      value=""
                      aria-label={`Assign ${member.name} to a team`}
                      onChange={(e) => e.target.value && toggle(e.target.value, member.id, true)}
                      className="min-h-8 rounded-full border border-dashed border-border bg-card px-2 text-xs font-semibold text-steel"
                    >
                      <option value="">+ Assign team</option>
                      {open.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : mine.length === 0 ? (
                    <span className="text-xs text-steel">No teams this season</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
