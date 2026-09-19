import { useState } from "react";
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
import { SPORTS, SPORT_LABEL } from "@/lib/sport";


export const Route = createFileRoute("/_authenticated/roster/new")({
  head: () => ({
    meta: [
      { title: "Add an athlete — Power Recruit" },
      { name: "description", content: "Add one of your organization's athletes to Power Recruit." },
      { property: "og:title", content: "Add an athlete — Power Recruit" },
      {
        property: "og:description",
        content: "Manual athlete entry for Power Recruit organization staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAthlete,
});

const FIELD =
  "touch-target w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite outline-none focus:border-org-primary";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

function NewAthlete() {
  const saveFn = useServerFn(saveOrgAthlete);
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
        className="mt-4 max-w-2xl rounded-xl border border-border bg-card p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]"
      >
        <h1 className="font-display text-2xl font-bold text-graphite">Add an athlete</h1>
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
            <input
              inputMode="numeric"
              value={form.gradYear}
              onChange={(event) => set("gradYear")(event.target.value)}
              placeholder="2027"
              className={`mt-1 tabular-nums ${FIELD}`}
            />
          </label>
          <label>
            <span className={LABEL}>Primary position</span>
            <input
              value={form.primaryPosition}
              onChange={(event) => set("primaryPosition")(event.target.value)}
              placeholder="RHP, SS, C…"
              className={`mt-1 ${FIELD}`}
            />
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
        </div>


        <button
          type="submit"
          disabled={saving}
          className="touch-target mt-6 inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save athlete"}
        </button>
      </form>
    </AppShell>
  );
}
