import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { InvitePanel } from "@/components/admin/InvitePanel";
import { AthleteProfilePanel } from "@/components/athlete/AthleteProfilePanel";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { HelpTip } from "@/components/brand/HelpTip";
import {
  addAthleteNote,
  deleteAthleteNote,
  getOrgAthlete,
  setNoteVisibility,
} from "@/lib/athletes.functions";
import {
  SHORTLIST_STATUSES,
  SHORTLIST_STATUS_LABEL,
  removeShortlistEntry,
  updateShortlistEntry,
  type ShortlistStatus,
} from "@/lib/shortlist.functions";
import { ATHLETE_STATUS_LABEL, type AthleteStatus } from "@/lib/season-constants";
import { normalizeSport, SPORT_LABEL } from "@/lib/sport";
import {
  assignAthleteToTeam,
  getAthleteSeasonHistory,
  setAthleteStatus,
} from "@/lib/seasons.functions";
import { useSeasonContext } from "@/hooks/use-season-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/roster/$id")({
  head: () => ({
    meta: [
      { title: "Athlete detail — Curve Recruit" },
      { name: "description", content: "Athlete profile, shortlist board, and staff notes." },
      { property: "og:title", content: "Athlete detail — Curve Recruit" },
      {
        property: "og:description",
        content: "Athlete profile, shortlist status board, and staff notes in Curve Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AthleteDetail,
});

const STATUS_STYLE: Record<ShortlistStatus, string> = {
  researching: "bg-org-primary/10 text-org-primary border-org-primary/25",
  contacted: "bg-org-accent/15 text-navy-deep border-org-accent/40",
  offered: "bg-seam-red-tint text-seam-red border-seam-red/30",
  committed: "bg-diamond-green-tint text-diamond-green border-diamond-green/30",
  eliminated: "bg-muted text-steel border-border",
};

function AthleteDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getOrgAthlete);
  const addNoteFn = useServerFn(addAthleteNote);
  const deleteNoteFn = useServerFn(deleteAthleteNote);
  const visibilityFn = useServerFn(setNoteVisibility);
  const updateEntryFn = useServerFn(updateShortlistEntry);
  const removeEntryFn = useServerFn(removeShortlistEntry);
  const historyFn = useServerFn(getAthleteSeasonHistory);
  const statusFn = useServerFn(setAthleteStatus);
  const assignFn = useServerFn(assignAthleteToTeam);
  const ctx = useSeasonContext();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["org-athlete", id],
    queryFn: () => getFn({ data: { id } }),
    retry: false,
  });

  const { data: history } = useQuery({
    queryKey: ["athlete-season-history", id],
    queryFn: () => historyFn({ data: { athleteId: id } }),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["org-athlete", id] });
    await queryClient.invalidateQueries({ queryKey: ["athlete-season-history", id] });
    await queryClient.invalidateQueries({ queryKey: ["season-detail"] });
    await queryClient.invalidateQueries({ queryKey: ["org-athletes"] });
    await queryClient.invalidateQueries({ queryKey: ["athlete-picker"] });
    await queryClient.invalidateQueries({ queryKey: ["org-dashboard"] });
  };

  async function submitNote(event: React.FormEvent) {
    event.preventDefault();
    try {
      await addNoteFn({ data: { athleteId: id, note, visibleToParent } });
      setNote("");
      setVisibleToParent(false);
      await invalidate();
      toast.success("Note added");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function moveStatus(entryId: string, status: ShortlistStatus) {
    try {
      await updateEntryFn({ data: { id: entryId, status } });
      await invalidate();
      toast.success(`Moved to ${SHORTLIST_STATUS_LABEL[status]}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveNotes(entryId: string, notes: string) {
    try {
      await updateEntryFn({ data: { id: entryId, notes } });
      await invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeEntry(entryId: string, schoolName: string) {
    if (!window.confirm(`Remove ${schoolName} from this shortlist entirely? This deletes the record.`)) {
      return;
    }
    try {
      await removeEntryFn({ data: { id: entryId } });
      await invalidate();
      toast.success("Removed from shortlist");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (error) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(error as Error).message}
        </p>
      </AppShell>
    );
  }

  const athlete = data?.athlete;
  const savedSchools = (data?.savedSchools ?? []) as Record<string, any>[];

  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/roster"
        className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      {isPending || !athlete ? (
        <p className="mt-6 text-sm text-steel">Loading athlete…</p>
      ) : (
        <>
          {/* Recruit command header, same lit plate as the school pages. */}
          <div className="stadium-gradient mt-4 overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-9">
            <p className="font-mono text-[11px] tracking-[0.18em] text-org-accent uppercase">
              {SPORT_LABEL[normalizeSport(athlete['sport'])]}
              {athlete['grad_year'] ? ` · Class of ${athlete['grad_year']}` : ""}
            </p>
            <h1 className="font-display mt-2 text-[2rem] leading-[1.06] font-bold text-white sm:text-4xl">
              {athlete['name']}
            </h1>
            <p className="meta mt-2 normal-case text-white/55">
              {String(athlete['athlete_data_source']).replace("_", " ")} entry
            </p>
            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/12 pt-6 text-sm sm:grid-cols-4">
              {[
                ["Grad year", athlete['grad_year'] ?? "—"],
                ["Position", athlete['primary_position'] ?? "—"],
                ["Bats", athlete['bats'] ?? "—"],
                ["Throws", athlete['throws'] ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-white/55 uppercase">
                    {label}
                  </dt>
                  <dd className="font-display mt-1 text-2xl font-bold tabular-nums text-white">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Season assignment + program status. Assignments are per season;
              status is athlete-level and outlives every season. */}
          <div className="mt-6">
            <AthleteProfilePanel athleteId={id} canVerify />
          </div>

          <section className="mt-6 rounded-xl border border-border bg-card p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <h2 className="font-display text-xl font-bold text-graphite">Seasons &amp; teams</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] tracking-wide text-steel uppercase">
                  {ctx.season?.name ?? "Current season"} team
                </p>
                {ctx.hasSeasons ? (
                  <select
                    value={
                      (history ?? []).find((row) => row.seasonId === ctx.seasonId)?.teamId ?? ""
                    }
                    disabled={ctx.season?.isArchived}
                    onChange={async (event) => {
                      try {
                        await assignFn({
                          data: {
                            athleteId: id,
                            seasonId: ctx.seasonId,
                            teamId: event.target.value || null,
                          },
                        });
                        await invalidate();
                        toast.success("Team assignment updated");
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {ctx.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                        {team.ageGroup ? ` · ${team.ageGroup}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-steel">No seasons set up yet.</p>
                )}

                <p className="mt-4 font-mono text-[11px] tracking-wide text-steel uppercase">
                  Program status
                </p>
                <select
                  value={(athlete['status'] ?? "active") as string}
                  onChange={async (event) => {
                    try {
                      await statusFn({
                        data: { athleteId: id, status: event.target.value as AthleteStatus },
                      });
                      await invalidate();
                      toast.success("Status updated");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite"
                >
                  {Object.entries(ATHLETE_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-steel">
                  Graduated and departed players keep their full shortlist and note history.
                </p>
              </div>

              <div>
                <p className="font-mono text-[11px] tracking-wide text-steel uppercase">
                  Season history
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(history ?? []).length === 0 ? (
                    <li className="text-sm text-steel">No team assignments yet.</li>
                  ) : null}
                  {(history ?? []).map((row) => (
                    <li
                      key={row.assignmentId}
                      className="flex items-center justify-between gap-2 rounded-md bg-chalk px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-steel tabular-nums">
                        {row.seasonName}
                      </span>
                      <span className="font-semibold text-graphite">
                        {row.teamName ?? "Unassigned"}
                        {row.jersey ? (
                          <span className="ml-2 font-mono text-xs font-normal text-steel tabular-nums">
                            #{row.jersey}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Shortlist status board */}
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-graphite">Shortlist</h2>
                <p className="text-sm text-steel">
                  {savedSchools.length} school{savedSchools.length === 1 ? "" : "s"} tracked across
                  five stages.
                </p>
              </div>
              <Link
                to="/search"
                search={{ athleteId: id } as any}
                className="touch-target inline-flex items-center gap-2 rounded-xl bg-seam-red px-4 text-sm font-semibold text-white"
              >
                <Plus className="size-4" aria-hidden /> Add schools
              </Link>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-5">
              {SHORTLIST_STATUSES.map((status) => {
                const group = savedSchools.filter((row) => row['status'] === status);
                return (
                  <div
                    key={status}
                    className="rounded-xl border border-border bg-chalk/60 p-3 shadow-[0_2px_14px_-12px_rgba(18,35,58,0.4)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] font-bold uppercase",
                          STATUS_STYLE[status],
                        )}
                      >
                        {SHORTLIST_STATUS_LABEL[status]}
                      </span>
                      <span className="font-mono text-xs text-steel tabular-nums">
                        {group.length}
                      </span>
                    </div>

                    {group.length === 0 ? (
                      <p className="mt-3 text-xs text-steel">Empty</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {group.map((row) => (
                          <ShortlistCard
                            key={row['id']}
                            row={row}
                            onMove={(next) => void moveStatus(row['id'] as string, next)}
                            onSaveNotes={(notes) => void saveNotes(row['id'] as string, notes)}
                            onRemove={() =>
                              void removeEntry(
                                row['id'] as string,
                                row['program']?.universities?.name ?? "this school",
                              )
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Staff notes */}
          <section className="mt-6 rounded-xl border border-border bg-card p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-xl font-bold text-graphite">Staff notes</h2>
              <HelpTip label="About staff notes">
                Notes are internal by default. Anything marked visible to the parent will appear in
                their family account.
              </HelpTip>
            </div>
            <form onSubmit={submitNote} className="mt-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Development focus, showcase observations…"
                className="w-full rounded-lg border border-border bg-card p-3 text-sm text-graphite outline-none focus:border-org-primary"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label
                  className={cn(
                    "touch-target inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
                    visibleToParent
                      ? "border-org-accent/50 bg-org-accent/15 text-navy-deep"
                      : "border-border bg-chalk text-steel",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={visibleToParent}
                    onChange={(event) => setVisibleToParent(event.target.checked)}
                  />
                  {visibleToParent ? (
                    <Eye className="size-4" aria-hidden />
                  ) : (
                    <EyeOff className="size-4" aria-hidden />
                  )}
                  {visibleToParent ? "Visible to parent" : "Internal only"}
                </label>
                <button
                  type="submit"
                  className="touch-target ml-auto inline-flex items-center rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
                >
                  Add note
                </button>
              </div>
            </form>

            <ul className="mt-4 divide-y divide-border/70">
              {(data?.notes ?? []).map((row: any) => (
                <li key={row.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[11px] text-steel">
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] font-bold",
                          row.visible_to_parent
                            ? "border-org-accent/50 bg-org-accent/15 text-navy-deep"
                            : "border-border bg-chalk text-steel",
                        )}
                      >
                        {row.visible_to_parent ? "Visible to parent" : "Internal only"}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await visibilityFn({
                              data: { id: row.id, visibleToParent: !row.visible_to_parent },
                            });
                            await invalidate();
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                        className="text-[11px] font-semibold text-org-primary underline decoration-dotted underline-offset-2"
                      >
                        {row.visible_to_parent ? "Make internal" : "Share with parent"}
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-graphite">{row.note}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={async () => {
                      try {
                        await deleteNoteFn({ data: { id: row.id } });
                        await invalidate();
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                    className="touch-target grid place-items-center rounded-lg border border-border px-2 text-steel hover:text-seam-red"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <InvitePanel
            athleteId={id}
            title="Family access"
            description={`Invite ${athlete['name']}'s parents or the player themselves. They get an email to set a password, and only see this athlete plus notes marked visible to parent.`}
            roles={[
              { value: "parent", label: "Parent", hint: "Parents see this athlete's shortlist and parent-visible notes." },
              { value: "player", label: "Player", hint: "The athlete gets their own login with the same athlete-scoped view." },
            ]}
            peopleLabel="Linked family accounts"
            emptyPeople="No family accounts linked yet."
          />
        </>
      )}
    </AppShell>
  );
}

function ShortlistCard({
  row,
  onMove,
  onSaveNotes,
  onRemove,
}: {
  row: Record<string, any>;
  onMove: (status: ShortlistStatus) => void;
  onSaveNotes: (notes: string) => void;
  onRemove: () => void;
}) {
  const program = row['program'] ?? {};
  const university = program?.universities ?? {};
  const [notes, setNotes] = useState<string>(String(row['notes'] ?? ""));

  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-[0_2px_10px_-8px_rgba(18,35,58,0.4)]">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/programs/$id"
          params={{ id: String(row['program_id']) }}
          className="font-display text-sm leading-snug font-bold text-org-primary hover:underline"
        >
          {university?.name ?? "Unknown school"}
        </Link>
        <button
          type="button"
          aria-label="Remove from shortlist"
          title="Remove from shortlist"
          onClick={onRemove}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-steel hover:border-seam-red/40 hover:text-seam-red"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-org-primary px-1.5 py-0.5 text-[10px] font-bold text-org-primary-foreground">
          {[program?.governing_body, program?.division].filter(Boolean).join(" ") || "—"}
        </span>
        <span className="font-mono text-[10px] text-steel">
          {[university?.state, program?.conference].filter(Boolean).join(" · ") || "—"}
        </span>
      </p>

      <textarea
        value={notes}
        rows={2}
        placeholder="Notes…"
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => {
          if (notes !== String(row['notes'] ?? "")) onSaveNotes(notes);
        }}
        className="mt-2 w-full rounded-lg border border-border bg-chalk/50 p-2 text-xs text-graphite outline-none focus:border-org-primary focus:bg-card"
      />

      <label className="mt-2 block">
        <span className="sr-only">Move to status</span>
        <select
          value={String(row['status'])}
          onChange={(event) => onMove(event.target.value as ShortlistStatus)}
          className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs font-semibold text-graphite outline-none focus:border-org-primary"
        >
          {SHORTLIST_STATUSES.map((status) => (
            <option key={status} value={status}>
              Move to {SHORTLIST_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
