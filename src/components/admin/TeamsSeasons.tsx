import { useMemo, useState } from "react";
import { AGE_GROUPS } from "@/lib/season-constants";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { TeamSchedulePanel } from "@/components/athlete/TeamSchedulePanel";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";


const FIELD =
  "touch-target w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";
const CARD =
  "rounded-xl border border-border bg-card p-4 sm:p-5 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]";

export function TeamsSeasonsPanel() {
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
      <p className="mt-6 rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
        Only organization admins can manage seasons and teams.
      </p>
    );
  }

  const teamCount = detail?.teams?.length ?? 0;
  const rostered = (detail?.teams ?? []).reduce((n: number, t: any) => n + t.athletes.length, 0);
  const unassignedCount = detail?.unassigned?.length ?? 0;

  return (
    <div className="mt-6 space-y-5">
      <SeasonList ctx={ctx} onChanged={refresh} onRollover={setRolloverFrom} />
      {ctx.seasonId && detail ? (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Teams", value: teamCount, tone: "text-graphite" },
            { label: "Rostered", value: rostered, tone: "text-diamond-green" },
            { label: "Unassigned", value: unassignedCount, tone: unassignedCount ? "text-seam-red" : "text-steel" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className={LABEL}>{s.label}</p>
              <p className={cn("font-display text-2xl font-bold tabular-nums", s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="min-w-0">
        {!ctx.seasonId ? (
          <div className={CARD}><p className="text-sm text-steel">Create a season to start building teams.</p></div>
        ) : isPending ? (
          <div className={CARD}><p className="text-sm text-steel">Loading teams…</p></div>
        ) : (
          <TeamManager seasonId={ctx.seasonId} detail={detail} onChanged={refresh} />
        )}
      </div>
      <Dialog open={Boolean(rolloverFrom)} onOpenChange={(o) => !o && setRolloverFrom(null)}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogTitle className="sr-only">Start new season</DialogTitle>
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
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
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

  const season = ctx.seasons.find((s) => s.id === ctx.seasonId);
  const [adding, setAdding] = useState(false);
  const btn = "touch-target inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-graphite hover:bg-chalk";

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className={LABEL}>Season</span>
          <select
            value={ctx.seasonId ?? ""}
            onChange={(e) => ctx.setSeasonId(e.target.value)}
            className={`mt-1 ${FIELD} font-semibold`}
          >
            {ctx.seasons.length === 0 ? <option value="">No seasons yet</option> : null}
            {ctx.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isActive ? " · Active" : s.isArchived ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
        {season ? (
          season.isActive ? (
            <span className="mb-2.5 rounded-md bg-diamond-green-tint px-2 py-0.5 font-mono text-[10px] tracking-wide text-diamond-green uppercase">Active</span>
          ) : season.isArchived ? (
            <span className="mb-2.5 rounded-md bg-chalk px-2 py-0.5 font-mono text-[10px] tracking-wide text-steel uppercase">Archived</span>
          ) : null
        ) : null}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {season && !season.isActive ? (
            <button type="button" className={btn} onClick={async () => {
              await activateFn({ data: { id: season.id } });
              await onChanged();
              toast.success(`${season.name} is now the active season`);
            }}>Make active</button>
          ) : null}
          {season ? (
            <button type="button" className={btn} onClick={async () => {
              await archiveFn({ data: { id: season.id, archived: !season.isArchived } });
              await onChanged();
            }}>{season.isArchived ? "Unarchive" : "Archive"}</button>
          ) : null}
          {season ? (
            <button type="button" className={cn(btn, "border-seam-red/40 text-seam-red hover:bg-seam-red-tint")} onClick={async () => {
              if (!window.confirm(`Delete ${season.name}? Its teams and roster assignments are removed. Athletes, shortlists and notes are kept.`)) return;
              await deleteFn({ data: { id: season.id } });
              await onChanged();
            }}><Trash2 className="size-3.5" aria-hidden /></button>
          ) : null}
          <button type="button" className={btn} onClick={() => setAdding((v) => !v)}>
            <Plus className="size-3.5" aria-hidden /> New season
          </button>
          {season ? (
            <button type="button" onClick={() => onRollover(season.id)} className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-seam-red px-3 text-xs font-semibold text-white hover:opacity-95">
              Roll forward <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {adding || ctx.seasons.length === 0 ? (
        <form onSubmit={async (e) => { await create(e); setAdding(false); }} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <label className="min-w-0 flex-1 sm:max-w-xs">
            <span className={LABEL}>New season name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="2027" className={`mt-1 ${FIELD}`} />
          </label>
          <button type="submit" disabled={busy} className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60">
            <Plus className="size-4" aria-hidden /> Add season
          </button>
        </form>
      ) : null}
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
          <label className="w-full min-w-0 flex-1 sm:min-w-48">
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
                    <select
                      value={team.id}
                      aria-label={`Move ${athlete.name}`}
                      onChange={async (event) => {
                        const next = event.target.value;
                        await assignFn({
                          data: { athleteId: athlete.athleteId, seasonId, teamId: next || null },
                        });
                        toast.success(next ? "Player moved" : "Removed from team");
                        await onChanged();
                      }}
                      className="min-h-8 shrink-0 rounded-md border border-border bg-card px-1.5 text-[11px] font-semibold text-graphite"
                    >
                      {teams.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.id === team.id ? t.name : `Move to ${t.name}`}
                        </option>
                      ))}
                      <option value="">Remove from team</option>
                    </select>
                  </li>
                ))}
              </ul>

              {unassigned.length ? (
                <AddPlayers
                  teamName={team.name}
                  unassigned={unassigned}
                  onAdd={async (ids) => {
                    for (const athleteId of ids) {
                      await assignFn({ data: { athleteId, seasonId, teamId: team.id } });
                    }
                    await onChanged();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      ))}

      {unassigned.length ? (
        <div className={CARD}>
          <p className={LABEL}>Unassigned · {unassigned.length}</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {unassigned.map((athlete) => (
              <li key={athlete.athleteId} className="flex items-center justify-between gap-2 rounded-md bg-chalk px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate font-medium text-graphite">
                  {athlete.name}
                  <span className="ml-2 font-mono text-[11px] text-steel">{athlete.gradYear ?? "—"}</span>
                </span>
                <select
                  value=""
                  aria-label={`Assign ${athlete.name}`}
                  onChange={async (event) => {
                    if (!event.target.value) return;
                    await assignFn({ data: { athleteId: athlete.athleteId, seasonId, teamId: event.target.value } });
                    await onChanged();
                  }}
                  className="min-h-9 rounded-md border border-border bg-card px-2 text-xs font-semibold text-graphite"
                >
                  <option value="">Assign to…</option>
                  {teams.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
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
                  className={`w-full sm:max-w-56 ${FIELD}`}
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
            <div className="scroll-x"><table className="w-full text-left text-sm tabular-nums">
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
            </table></div>
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

function AddPlayers({
  teamName,
  unassigned,
  onAdd,
}: {
  teamName: string;
  unassigned: { athleteId: string; name: string; gradYear?: number | null }[];
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-9 rounded-md border border-dashed border-border px-3 text-xs font-semibold text-org-primary">
        + Add players
      </button>
    );
  return (
    <div className="mt-3 rounded-md border border-border p-2">
      <p className={LABEL}>Add to {teamName}</p>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
        {unassigned.map((a) => (
          <li key={a.athleteId}>
            <label className="flex items-center gap-2 text-sm text-graphite">
              <input
                type="checkbox"
                checked={picked.includes(a.athleteId)}
                onChange={(e) =>
                  setPicked((p) => (e.target.checked ? [...p, a.athleteId] : p.filter((x) => x !== a.athleteId)))
                }
                className="size-4 accent-[var(--org-primary)]"
              />
              {a.name}
              <span className="font-mono text-[11px] text-steel">{a.gradYear ?? ""}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            try { await onAdd(picked); setPicked([]); setOpen(false); } finally { setBusy(false); }
          }}
          className="min-h-9 rounded-md bg-org-primary px-3 text-xs font-semibold text-org-primary-foreground disabled:opacity-50"
        >
          {busy ? "Adding…" : `Add ${picked.length || ""}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-xs text-steel">Cancel</button>
      </div>
    </div>
  );
}
