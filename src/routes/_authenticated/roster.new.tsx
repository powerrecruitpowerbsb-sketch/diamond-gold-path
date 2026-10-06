import { useState } from "react";
import { StateSelect, POSITIONS, gradYearOptions } from "@/components/brand/StateSelect";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { useSeasonContext } from "@/hooks/use-season-context";
import { useSportMode } from "@/hooks/use-sport-mode";
import { saveOrgAthlete } from "@/lib/athletes.functions";
import { sendOrgInvite } from "@/lib/invites.functions";
import { SPORTS, SPORT_LABEL } from "@/lib/sport";


export const Route = createFileRoute("/_authenticated/roster/new")({
  head: () => ({
    meta: [
      { title: "Add an athlete — Curve Recruit" },
      { name: "description", content: "Add one of your organization's athletes to Curve Recruit." },
      { property: "og:title", content: "Add an athlete — Curve Recruit" },
      {
        property: "og:description",
        content: "Manual athlete entry for Curve Recruit organization staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAthleteGate,
});

const FIELD =
  "touch-target w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

function NewAthleteGate() {
  const ctx = useSeasonContext();
  if (ctx.isPending) return <AppShell right={<AuthButton />}><p className="text-sm text-steel">Loading…</p></AppShell>;
  if (!ctx.canManage) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-graphite">
          Only owners and admins can add players.{" "}
          <Link to="/roster" className="font-semibold underline">Back to roster</Link>
        </p>
      </AppShell>
    );
  }
  return <NewAthlete />;
}

function NewAthlete() {
  const saveFn = useServerFn(saveOrgAthlete);
  const inviteFn = useServerFn(sendOrgInvite);
  const [sendInvites, setSendInvites] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ctx = useSeasonContext();
  const [saving, setSaving] = useState(false);
  const [teamId, setTeamId] = useState("");
  // New athletes default to whichever sport the app is currently showing.
  const { sport } = useSportMode();
  const [form, setForm] = useState({
    name: "",
    gradYear: "",
    primaryPosition: "",
    bats: "",
    throws: "",
    sport: "",
    playerEmail: "",
    parentEmail: "",
    parent2Email: "",
    parentName: "",
    parent2Name: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveFn({
        data: {
          name: form.name,
          gradYear: form.gradYear ? Number(form.gradYear) : null,
          primaryPosition: form.primaryPosition || null,
          bats: form.bats || null,
          throws: form.throws || null,
          sport: form.sport || sport,
          source: "manual",
          seasonId: ctx.seasonId || null,
          teamId: teamId || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["org-athletes"] });
      await queryClient.invalidateQueries({ queryKey: ["season-detail"] });
      toast.success("Athlete added");

      if (sendInvites) {
        const targets = [
          { email: form.playerEmail.trim(), role: "player" as const, name: form.name.trim() },
          { email: form.parentEmail.trim(), role: "parent" as const, name: form.parentName.trim() },
          { email: form.parent2Email.trim(), role: "parent" as const, name: form.parent2Name.trim() },
        ].filter((t) => t.email);
        for (const t of targets) {
          try {
            const r = await inviteFn({ data: { email: t.email, role: t.role, athleteId: result.id, name: t.name || null } });
            toast.success(r.message);
          } catch (e) {
            toast.error(`${t.email}: ${(e as Error).message}`);
          }
        }
      }

      navigate({ to: "/roster/$id", params: { id: result.id } });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell right={<AuthButton />}>
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary">
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      <form
        onSubmit={submit}
        className="mt-4 max-w-2xl rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]"
      >
        <h1 className="font-display text-2xl font-bold text-graphite">Add</h1>
        <p className="mt-1 text-sm text-steel">Recorded as a manual entry.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={LABEL}>Name *</span>
            <input
              required
              value={form.name}
              onChange={(event) => set("name")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label>
            <span className={LABEL}>Sport *</span>
            <select
              value={form.sport || sport}
              onChange={(event) => set("sport")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            >
              {SPORTS.map((option) => (
                <option key={option} value={option}>
                  {SPORT_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Graduation year</span>
            <select value={form.gradYear} onChange={(event) => set("gradYear")(event.target.value)} className={`mt-1 tabular-nums ${FIELD}`}>
              <option value="">Choose a year</option>
              {gradYearOptions().map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Primary position</span>
            <select value={form.primaryPosition} onChange={(event) => set("primaryPosition")(event.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">Choose a position</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Bats</span>
            <select value={form.bats} onChange={(event) => set("bats")(event.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">—</option>
              <option value="R">R</option>
              <option value="L">L</option>
              <option value="S">S</option>
            </select>
          </label>
          <label>
            <span className={LABEL}>Throws</span>
            <select
              value={form.throws}
              onChange={(event) => set("throws")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            >
              <option value="">—</option>
              <option value="R">R</option>
              <option value="L">L</option>
            </select>
          </label>
          {ctx.hasSeasons ? (
            <label className="sm:col-span-2">
              <span className={LABEL}>Team ({ctx.season?.name ?? "current season"})</span>
              <select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className={`mt-1 ${FIELD}`}
              >
                <option value="">Unassigned for now</option>
                {ctx.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.ageGroup ? ` · ${team.ageGroup}` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-steel">
                Team assignments are per season — the athlete's record and shortlist carry forward
                regardless.
              </span>
            </label>
          ) : null}
          <label>
            <span className={LABEL}>Player email</span>
            <input
              type="email"
              value={form.playerEmail}
              onChange={(event) => set("playerEmail")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label>
            <span className={LABEL}>Parent 1 email</span>
            <input
              type="email"
              value={form.parentEmail}
              onChange={(event) => set("parentEmail")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label>
            <span className={LABEL}>Parent 2 email</span>
            <input
              type="email"
              value={form.parent2Email}
              onChange={(event) => set("parent2Email")(event.target.value)}
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-graphite sm:col-span-2">
            <input
              type="checkbox"
              checked={sendInvites}
              onChange={(event) => setSendInvites(event.target.checked)}
              className="size-4 accent-[var(--org-primary)]"
            />
            Email login invites so they can set up their accounts
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="touch-target mt-6 inline-flex w-full items-center justify-center rounded-xl sm:w-auto bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save athlete"}
        </button>
      </form>
    </AppShell>
  );
}
