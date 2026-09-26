import { useMemo, useState } from "react";
import { AGE_GROUPS } from "@/lib/season-constants";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { TeamSchedulePanel } from "@/components/athlete/TeamSchedulePanel";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { useSeasonContext } from "@/hooks/use-season-context";
import { ATHLETE_STATUS_LABEL, type AthleteStatus } from "@/lib/season-constants";
import {
  activateSeason,
  assignAthleteToTeam,
  deleteSeason,
  deleteTeam,
  getRolloverPlan,
  getSeasonDetail,
  runRollover,
  saveSeason,
  saveTeam,
  setSeasonArchived,
  setTeamCoach,
} from "@/lib/seasons.functions";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/seasons")({
  head: () => ({
    meta: [
      { title: "Seasons & teams — Curve Recruit" },
      {
        name: "description",
        content:
          "Create seasons, build teams, assign coaches and athletes, and roll your roster forward into a new season.",
      },
      { property: "og:title", content: "Seasons & teams — Curve Recruit" },
      {
        property: "og:description",
        content: "Season and team structure for your travel organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeasonsSettings,
});

const FIELD =
  "touch-target w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";
const CARD =
  "rounded-xl border border-border bg-card p-5 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]";

function SeasonsSettings() {
  const ctx = useSeasonContext();
  const queryClient = useQueryClient();
  const [rolloverFrom, setRolloverFrom] = useState<string | null>(null);

  const detailFn = useServerFn(getSeasonDetail);
  const { data: detail, isPending } = useQuery({
    queryKey: ["season-detail", ctx.seasonId],
    queryFn: () => detailFn({ data: { seasonId: ctx.seasonId } }),
    enabled: Boolean(ctx.seasonId),
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["season-context"] });
    await queryClient.invalidateQueries({ queryKey: ["season-detail"] });
    await queryClient.invalidateQueries({ queryKey: ["org-athletes"] });
    await queryClient.invalidateQueries({ queryKey: ["org-dashboard"] });
  };

  if (!ctx.isPending && !ctx.canManage) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          Only organization admins can manage seasons and teams.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/roster"
        className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      <div className="mt-4">
        <p className="font-mono text-xs tracking-wide text-steel uppercase">Organization structure</p>
        <h1 className="font-display text-3xl font-bold text-graphite">Seasons &amp; teams</h1>
        <p className="mt-1 max-w-2xl text-sm text-steel">
          Teams are created inside a season. Athletes keep one record and one shortlist — they simply
          get a new team assignment each season, all the way until they graduate out of the program.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <SeasonList ctx={ctx} onChanged={refresh} onRollover={setRolloverFrom} />

        <div className="min-w-0">
          {rolloverFrom ? (
            <RolloverWizard
              fromSeasonId={rolloverFrom}
              fromSeasonName={ctx.seasons.find((s) => s.id === rolloverFrom)?.name ?? ""}
              onClose={() => setRolloverFrom(null)}
              onDone={async (seasonId) => {
                setRolloverFrom(null);
                await refresh();
                ctx.setSeasonId(seasonId);
              }}
            />
          ) : !ctx.seasonId ? (
            <div className={CARD}>
              <p className="text-sm text-steel">Create a season to start building teams.</p>
            </div>
          ) : isPending ? (
            <div className={CARD}>
              <p className="text-sm text-steel">Loading teams…</p>
            </div>
          ) : (
            <TeamManager
              seasonId={ctx.seasonId}
              detail={detail}
              onChanged={refresh}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function SeasonList({
  ctx,
  onChanged,
  onRollover,
}: {
  ctx: ReturnType<typeof useSeasonContext>;
  onChanged: () => Promise<void>;
  onRollover: (id: string) => void;
}) {
  const saveFn = useServerFn(saveSeason);
  const activateFn = useServerFn(activateSeason);
  const archiveFn = useServerFn(setSeasonArchived);
  const deleteFn = useServerFn(deleteSeason);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveFn({ data: { name, makeActive: !ctx.hasSeasons } });
      setName("");
      await onChanged();
      ctx.setSeasonId(result.id);
      toast.success("Season created");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={CARD}>
      <h2 className="font-display text-lg font-bold text-graphite">Seasons</h2>

      <ul className="mt-3 space-y-2">
        {ctx.seasons.map((season) => (
          <li
            key={season.id}
            className={cn(
              "rounded-lg border p-3",
              season.id === ctx.seasonId
                ? "border-org-primary bg-org-primary/5"
                : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => ctx.setSeasonId(season.id)}
                className="text-left text-sm font-semibold text-graphite hover:text-org-primary"
              >
                {season.name}
              </button>
              {season.isActive ? (
                <span className="rounded-md bg-diamond-green-tint px-2 py-0.5 font-mono text-[10px] tracking-wide text-diamond-green uppercase">
                  Active
                </span>
              ) : season.isArchived ? (
                <span className="rounded-md bg-chalk px-2 py-0.5 font-mono text-[10px] tracking-wide text-steel uppercase">
                  Archived
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {!season.isActive ? (
                <button
                  type="button"
                  onClick={async () => {
                    await activateFn({ data: { id: season.id } });
                    await onChanged();
                    toast.success(`${season.name} is now the active season`);
                  }}
                  className="rounded-md border border-border px-2 py-1 font-semibold text-graphite hover:bg-chalk"
                >
                  Make active
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  await archiveFn({ data: { id: season.id, archived: !season.isArchived } });
                  await onChanged();
                }}
                className="rounded-md border border-border px-2 py-1 font-semibold text-graphite hover:bg-chalk"
              >
                {season.isArchived ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => onRollover(season.id)}
                className="inline-flex items-center gap-1 rounded-md bg-seam-red px-2 py-1 font-semibold text-white hover:opacity-95"
              >
                Roll forward <ArrowRight className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Delete ${season.name}? Its teams and roster assignments are removed. Athletes, shortlists and notes are kept.`,
                    )
                  )
                    return;
                  await deleteFn({ data: { id: season.id } });
                  await onChanged();
                }}
                className="rounded-md border border-seam-red/40 px-2 py-1 font-semibold text-seam-red hover:bg-seam-red-tint"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={create} className="mt-4 border-t border-border pt-4">
        <label>
          <span className={LABEL}>New season name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="2027"
            className={`mt-1 ${FIELD}`}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="touch-target mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden /> Add season
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Detail = Awaited<ReturnType<typeof getSeasonDetail>>;

function TeamManager({
  seasonId,
  detail,
  onChanged,
}: {
  seasonId: string;
  detail: Detail | undefined;
  onChanged: () => Promise<void>;
}) {
  const saveTeamFn = useServerFn(saveTeam);
  const deleteTeamFn = useServerFn(deleteTeam);
  const coachFn = useServerFn(setTeamCoach);
  const assignFn = useServerFn(assignAthleteToTeam);
  const [teamName, setTeamName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const teams = detail?.teams ?? [];
  const staff = detail?.staff ?? [];
  const unassigned = detail?.unassigned ?? [];

  async function addTeam(event: React.FormEvent) {
    event.preventDefault();
    try {
      await saveTeamFn({ data: { seasonId, name: teamName, ageGroup } });
      setTeamName("");
      setAgeGroup("");
      await onChanged();
      toast.success("Team created");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addTeam} className={CARD}>
        <h2 className="font-display text-lg font-bold text-graphite">
          Teams in {detail?.season?.name ?? "this season"}
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1">
            <span className={LABEL}>Team name</span>
            <input
              required
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="16U Black"
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label className="w-32">
            <span className={LABEL}>Age group</span>
            <input
              value={ageGroup}
              onChange={(event) => setAgeGroup(event.target.value)}
              placeholder="16U"
              list="age-groups"
              className={`mt-1 ${FIELD}`}
            />
            <datalist id="age-groups">
              {AGE_GROUPS.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
          </label>
          <button
            type="submit"
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
          >
            <Plus className="size-4" aria-hidden /> Add team
          </button>
        </div>
      </form>

      {teams.length === 0 ? (
        <div className={CARD}>
          <p className="text-sm text-steel">No teams in this season yet.</p>
        </div>
      ) : null}

      {teams.map((team) => (
        <div key={team.id} className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-graphite">
                {team.name}
                {team.ageGroup ? (
                  <span className="ml-2 font-mono text-xs font-normal text-steel">{team.ageGroup}</span>
                ) : null}
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-steel">
                <Users className="size-3.5" aria-hidden /> {team.athletes.length} athletes ·{" "}
                {team.coaches.length} coaches
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Remove ${team.name} from this season?`)) return;
                await deleteTeamFn({ data: { id: team.id } });
                await onChanged();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-seam-red/40 px-2 py-1 text-xs font-semibold text-seam-red hover:bg-seam-red-tint"
            >
              <Trash2 className="size-3.5" aria-hidden /> Delete team
            </button>
          </div>

          <div className="mt-4">
            <TeamSchedulePanel teamId={team.id} teamName={team.name} />
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <p className={LABEL}>Assigned coaches</p>
              <p className="mt-1 text-xs text-steel">
                A coach only sees athletes on the teams checked here, unless they have organization-wide
                access.
              </p>
              <ul className="mt-2 space-y-1.5">
                {staff.length === 0 ? (
                  <li className="text-sm text-steel">No staff accounts yet.</li>
                ) : null}
                {staff.map((member) => {
                  const assigned = team.coaches.some((c) => c.userId === member.id);
                  return (
                    <li key={member.id}>
                      <label className="flex items-center gap-2 text-sm text-graphite">
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={async (event) => {
                            await coachFn({
                              data: {
                                teamId: team.id,
                                userId: member.id,
                                assigned: event.target.checked,
                              },
                            });
                            await onChanged();
                          }}
                          className="size-4 accent-[var(--org-primary)]"
                        />
                        {member.name}
                        {member.orgWideAccess ? (
                          <span className="rounded bg-org-accent/20 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-graphite uppercase">
                            Org-wide
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className={LABEL}>Roster</p>
              <ul className="mt-2 space-y-1.5">
                {team.athletes.length === 0 ? (
                  <li className="text-sm text-steel">No athletes assigned.</li>
                ) : null}
                {team.athletes.map((athlete) => (
                  <li
                    key={athlete.assignmentId}
                    className="flex items-center justify-between gap-2 rounded-md bg-chalk px-2 py-1.5 text-sm"
                  >
                    <Link
                      to="/roster/$id"
                      params={{ id: athlete.athleteId }}
                      className="font-medium text-graphite hover:text-org-primary hover:underline"
                    >
                      {athlete.name}
                      <span className="ml-2 font-mono text-[11px] text-steel tabular-nums">
                        {athlete.gradYear ?? "—"} · {athlete.position ?? "—"}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        await assignFn({
                          data: { athleteId: athlete.athleteId, seasonId, teamId: null },
                        });
                        await onChanged();
                      }}
                      className="font-mono text-[11px] text-steel hover:text-seam-red"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>

              {unassigned.length ? (
                <label className="mt-3 block">
                  <span className={LABEL}>Add athlete to {team.name}</span>
                  <select
                    value=""
                    onChange={async (event) => {
                      const athleteId = event.target.value;
                      if (!athleteId) return;
                      await assignFn({ data: { athleteId, seasonId, teamId: team.id } });
                      await onChanged();
                    }}
                    className={`mt-1 ${FIELD}`}
                  >
                    <option value="">Select an athlete…</option>
                    {unassigned.map((athlete) => (
                      <option key={athlete.athleteId} value={athlete.athleteId}>
                        {athlete.name}
                        {athlete.gradYear ? ` (${athlete.gradYear})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ))}

      {unassigned.length ? (
        <div className={CARD}>
          <p className={LABEL}>Not on a team this season</p>
          <p className="mt-2 text-sm text-steel">
            {unassigned.map((a) => a.name).join(", ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type PlanTeam = { key: string; name: string; ageGroup: string; sourceTeamId: string | null; keep: boolean };
type PlanAthlete = { athleteId: string; teamKey: string; status: AthleteStatus };

function RolloverWizard({
  fromSeasonId,
  fromSeasonName,
  onClose,
  onDone,
}: {
  fromSeasonId: string;
  fromSeasonName: string;
  onClose: () => void;
  onDone: (seasonId: string) => Promise<void>;
}) {
  const planFn = useServerFn(getRolloverPlan);
  const runFn = useServerFn(runRollover);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [archiveSource, setArchiveSource] = useState(true);
  const [teams, setTeams] = useState<PlanTeam[] | null>(null);
  const [athletes, setAthletes] = useState<PlanAthlete[] | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: plan, isPending } = useQuery({
    queryKey: ["rollover-plan", fromSeasonId],
    queryFn: () => planFn({ data: { fromSeasonId } }),
    retry: false,
  });

  const planTeams = useMemo<PlanTeam[]>(
    () =>
      teams ??
      (plan?.teams ?? []).map((team) => ({
        key: team.id,
        name: team.name,
        ageGroup: team.ageGroup ?? "",
        sourceTeamId: team.id,
        keep: true,
      })),
    [teams, plan],
  );

  const planAthletes = useMemo<PlanAthlete[]>(
    () =>
      athletes ??
      (plan?.athletes ?? []).map((athlete) => ({
        athleteId: athlete.athleteId,
        teamKey: athlete.currentTeamId ?? "",
        status: "active" as AthleteStatus,
      })),
    [athletes, plan],
  );

  const keptTeams = planTeams.filter((team) => team.keep && team.name.trim());

  async function submit() {
    setBusy(true);
    try {
      const result = await runFn({
        data: {
          fromSeasonId,
          name,
          archiveSource,
          teams: keptTeams.map((team) => ({
            key: team.key,
            name: team.name,
            ageGroup: team.ageGroup || null,
            sourceTeamId: team.sourceTeamId,
          })),
          athletes: planAthletes.map((athlete) => ({
            athleteId: athlete.athleteId,
            teamKey: keptTeams.some((t) => t.key === athlete.teamKey) ? athlete.teamKey : null,
            status: athlete.status,
          })),
        },
      });
      toast.success(`${name} created with ${result.teams} teams`);
      await onDone(result.seasonId);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-wide text-steel uppercase">
            Step {step} of 3 · rolling forward from {fromSeasonName}
          </p>
          <h2 className="font-display text-xl font-bold text-graphite">Start a new season</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-medium text-steel hover:text-seam-red">
          Cancel
        </button>
      </div>

      {isPending ? <p className="mt-4 text-sm text-steel">Loading current season…</p> : null}

      {!isPending && step === 1 ? (
        <div className="mt-4 max-w-sm">
          <label>
            <span className={LABEL}>New season name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="2027"
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-graphite">
            <input
              type="checkbox"
              checked={archiveSource}
              onChange={(event) => setArchiveSource(event.target.checked)}
              className="size-4 accent-[var(--org-primary)]"
            />
            Archive {fromSeasonName} when the new season goes live
          </label>
          <p className="mt-2 text-xs text-steel">
            Archiving only freezes that season's team assignments. Athletes, shortlists and notes stay
            live and follow each player forward.
          </p>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => setStep(2)}
            className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
          >
            Teams <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {!isPending && step === 2 ? (
        <div className="mt-4">
          <p className="text-sm text-steel">
            Uncheck teams that are folding, and rename any that are moving up an age group.
          </p>
          <ul className="mt-3 space-y-2">
            {planTeams.map((team, index) => (
              <li key={team.key} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={team.keep}
                  onChange={(event) => {
                    const next = [...planTeams];
                    next[index] = { ...team, keep: event.target.checked };
                    setTeams(next);
                  }}
                  className="size-4 accent-[var(--org-primary)]"
                />
                <input
                  value={team.name}
                  onChange={(event) => {
                    const next = [...planTeams];
                    next[index] = { ...team, name: event.target.value };
                    setTeams(next);
                  }}
                  className={`max-w-56 ${FIELD}`}
                />
                <input
                  value={team.ageGroup}
                  placeholder="Age group"
                  list="age-groups"
                  onChange={(event) => {
                    const next = [...planTeams];
                    next[index] = { ...team, ageGroup: event.target.value };
                    setTeams(next);
                  }}
                  className={`w-28 ${FIELD}`}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setTeams([
                ...planTeams,
                {
                  key: `new-${planTeams.length}-${Date.now()}`,
                  name: "",
                  ageGroup: "",
                  sourceTeamId: null,
                  keep: true,
                },
              ])
            }
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-graphite hover:bg-chalk"
          >
            <Plus className="size-3.5" aria-hidden /> Add a new team
          </button>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="touch-target rounded-xl border border-border px-4 text-sm font-semibold text-graphite"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!keptTeams.length}
              onClick={() => setStep(3)}
              className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
            >
              Players <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {!isPending && step === 3 ? (
        <div className="mt-4">
          <p className="text-sm text-steel">
            Choose where each player lands. Mark anyone leaving the program as graduated or departed —
            their record and shortlist history stay searchable either way.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="bg-chalk font-mono text-[11px] tracking-wide text-steel uppercase">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Grad</th>
                  <th className="px-3 py-2">New team</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {planAthletes.map((athlete, index) => {
                  const source = plan?.athletes.find((a) => a.athleteId === athlete.athleteId);
                  return (
                    <tr key={athlete.athleteId} className="border-t border-border/70">
                      <td className="px-3 py-2 font-semibold text-graphite">{source?.name}</td>
                      <td className="px-3 py-2 text-steel">{source?.gradYear ?? "—"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={athlete.teamKey}
                          disabled={athlete.status !== "active"}
                          onChange={(event) => {
                            const next = [...planAthletes];
                            next[index] = { ...athlete, teamKey: event.target.value };
                            setAthletes(next);
                          }}
                          className={FIELD}
                        >
                          <option value="">Unassigned</option>
                          {keptTeams.map((team) => (
                            <option key={team.key} value={team.key}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={athlete.status}
                          onChange={(event) => {
                            const next = [...planAthletes];
                            next[index] = {
                              ...athlete,
                              status: event.target.value as AthleteStatus,
                            };
                            setAthletes(next);
                          }}
                          className={FIELD}
                        >
                          {(Object.keys(ATHLETE_STATUS_LABEL) as AthleteStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {ATHLETE_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="touch-target rounded-xl border border-border px-4 text-sm font-semibold text-graphite"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="touch-target inline-flex items-center gap-2 rounded-xl bg-seam-red px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Check className="size-4" aria-hidden /> {busy ? "Creating…" : `Create ${name || "season"}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
