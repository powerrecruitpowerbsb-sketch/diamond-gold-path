import { createFileRoute, Link } from "@tanstack/react-router";
import { StateSelect, POSITIONS, gradYearOptions } from "@/components/brand/StateSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteScheduleEvent, saveScheduleEvent } from "@/lib/athlete-profile.functions";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { getAthleteSchedule } from "@/lib/athlete-hub.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "My Schedule — Curve Recruit" },
      { name: "description", content: "Every tournament, showcase and camp on your calendar." },
      { property: "og:title", content: "My Schedule — Curve Recruit" },
      { property: "og:description", content: "Tournaments, showcases and camps for a recruit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const fn = useServerFn(getAthleteSchedule);
  const { data, isPending, error } = useQuery({
    queryKey: ["athlete-schedule"],
    queryFn: () => fn({ data: {} }),
  });
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const events = data?.events ?? [];
  const upcoming = events.filter((e) => String(e['end_date'] ?? e['start_date']) >= today);
  const past = events.filter((e) => String(e['end_date'] ?? e['start_date']) < today).reverse();

  // Group upcoming by month
  const months = new Map<string, Record<string, any>[]>();
  for (const e of upcoming) {
    const k = new Date(`${e['start_date']}T12:00:00`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    months.set(k, [...(months.get(k) ?? []), e]);
  }

  return (
    <AppShell right={<AuthButton />}>
      <div className="space-y-5 sm:space-y-6">
        <div>
          <Link to="/athlete" className="meta inline-flex items-center gap-1 text-steel hover:text-graphite">
            <ArrowLeft className="size-3.5" /> Hub
          </Link>
          <p className="meta mt-3 text-org-accent">Calendar</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-graphite">Schedule</h1>
          {data?.athleteId && !adding ? (
            <Button className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add event
            </Button>
          ) : null}
        </div>

        {adding && data?.athleteId ? (
          <AddEventForm athleteId={data.athleteId} onDone={() => setAdding(false)} />
        ) : null}

        {error ? (
          <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
            {(error as Error).message}
          </p>
        ) : isPending ? (
          <div className="h-48 animate-pulse rounded-2xl bg-card" />
        ) : upcoming.length === 0 ? (
          <div className="surface-raised rounded-2xl border border-white/10 p-8 text-center">
            <CalendarDays className="mx-auto size-6 text-steel" />
            <p className="mt-2 font-mono text-[11px] tracking-wide text-steel uppercase">No events</p>
            {data?.athleteId && !adding ? (
              <Button variant="outline" className="mt-3" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add your first event
              </Button>
            ) : null}
          </div>
        ) : (
          [...months.entries()].map(([month, list]) => (
            <section key={month}>
              <p className="meta mb-2 flex items-center gap-2 text-org-accent"><span className="h-3 w-1 rounded-full bg-org-primary" />{month}</p>
              <ul className="space-y-2">
                {list.map((e, i) => (
                  <EventRow key={e['id']} e={e} next={month === [...months.keys()][0] && i === 0} />
                ))}
              </ul>
            </section>
          ))
        )}

        {past.length ? (
          <section>
            <p className="meta mb-2 text-steel">Past</p>
            <ul className="space-y-2 opacity-70">
              {past.slice(0, 20).map((e) => (
                <EventRow key={e['id']} e={e} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function EventRow({ e, next = false }: { e: Record<string, any>; next?: boolean }) {
  const d = new Date(`${e['start_date']}T12:00:00`);
  const end = e['end_date'] && e['end_date'] !== e['start_date'] ? new Date(`${e['end_date']}T12:00:00`) : null;
  const where = [e['venue'], e['city'], e['state']].filter(Boolean).join(", ");
  return (
    <li
      className={cn(
        "card-panel relative flex items-center gap-4 overflow-hidden rounded-xl border p-3.5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5",
        next ? "border-org-primary/50" : "border-white/10",
      )}
    >
      <div className="grid w-14 shrink-0 place-items-center rounded-lg border border-white/10 bg-card py-2">
        <span className="font-mono text-[10px] text-org-accent uppercase">
          {d.toLocaleDateString(undefined, { weekday: "short" })}
        </span>
        <span className="font-display tabular text-2xl leading-none font-bold text-graphite">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {next ? (
            <span className="rounded bg-org-primary px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-org-primary-foreground uppercase">
              Next
            </span>
          ) : null}
          {e['event_type'] ? (
            <span className="font-mono text-[10px] tracking-wide text-steel uppercase">
              {TYPE_LABEL[e['event_type']] ?? e['event_type']}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold text-graphite">{e['name']}</p>
        <p className="flex items-center gap-1 truncate text-xs text-steel">
          {where ? (
            <>
              <MapPin className="size-3 shrink-0" /> {where}
            </>
          ) : null}
          {end ? ` · through ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
        </p>
      </div>
      {e['org_athlete_id'] ? <DeleteOwn id={e['id']} /> : null}
      {e['link_url'] ? (
        <a
          href={e['link_url']}
          target="_blank"
          rel="noreferrer"
          className="touch-target grid shrink-0 place-items-center px-2 text-org-primary"
          aria-label="Event website"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </li>
  );
}

const TYPES = [
  ["game", "Game"],
  ["high_school", "High school"],
  ["tournament", "Tournament"],
  ["showcase", "Showcase"],
  ["camp", "Camp"],
  ["scrimmage", "Scrimmage"],
  ["practice", "Practice"],
  ["visit", "College visit"],
  ["other", "Other"],
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES);

function AddEventForm({ athleteId, onDone }: { athleteId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveScheduleEvent);
  const [f, setF] = useState({
    name: "",
    eventType: "game",
    startDate: "",
    endDate: "",
    venue: "",
    city: "",
    state: "",
    linkUrl: "",
    notes: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => save({ data: { ...f, athleteId, endDate: f.endDate || null } }),
    onSuccess: () => {
      toast.success("Added to your schedule");
      qc.invalidateQueries({ queryKey: ["athlete-schedule"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = "space-y-1";
  const lbl = "meta text-steel";
  return (
    <form
      className="card-panel relative space-y-3 overflow-hidden rounded-2xl border border-org-primary/40 p-4 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-org-primary"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs font-bold tracking-widest text-graphite uppercase">New event</p>
        <button type="button" onClick={onDone} aria-label="Close" className="touch-target text-steel">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field + " sm:col-span-2"}>
          <span className={lbl}>Name</span>
          <Input required value={f.name} onChange={set("name")} placeholder="vs. Jesuit HS" />
        </label>
        <label className={field}>
          <span className={lbl}>Type</span>
          <select
            value={f.eventType}
            onChange={set("eventType")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
          >
            {TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className={lbl}>Venue</span>
          <Input value={f.venue} onChange={set("venue")} placeholder="Field or complex" />
        </label>
        <label className={field}>
          <span className={lbl}>Start</span>
          <Input required type="date" value={f.startDate} onChange={set("startDate")} />
        </label>
        <label className={field}>
          <span className={lbl}>End (optional)</span>
          <Input type="date" min={f.startDate} value={f.endDate} onChange={set("endDate")} />
        </label>
        <label className={field}>
          <span className={lbl}>City</span>
          <Input value={f.city} onChange={set("city")} />
        </label>
        <label className={field}>
          <span className={lbl}>State</span>
          <StateSelect value={f.state} onValueChange={(v) => setF({ ...f, state: v })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
        </label>
        <label className={field + " sm:col-span-2"}>
          <span className={lbl}>Website (optional)</span>
          <Input type="url" value={f.linkUrl} onChange={set("linkUrl")} placeholder="https://" />
        </label>
        <label className={field + " sm:col-span-2"}>
          <span className={lbl}>Notes</span>
          <Textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Save event"}
        </Button>
      </div>
    </form>
  );
}

function DeleteOwn({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteScheduleEvent);
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["athlete-schedule"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      aria-label="Remove event"
      disabled={m.isPending}
      onClick={() => confirm("Remove this event?") && m.mutate()}
      className="touch-target grid shrink-0 place-items-center px-2 text-steel hover:text-seam-red"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
