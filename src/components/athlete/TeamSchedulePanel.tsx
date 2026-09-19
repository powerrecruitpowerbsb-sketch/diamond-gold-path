import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  EVENT_TYPES,
  deleteScheduleEvent,
  getTeamSchedule,
  saveTeamEvent,
} from "@/lib/athlete-profile.functions";

/**
 * The team's tournament and showcase calendar. Staff post it once here and it
 * appears on every assigned athlete's player card — nobody re-types it.
 */
export function TeamSchedulePanel({ teamId, teamName }: { teamId: string; teamName: string }) {
  const listFn = useServerFn(getTeamSchedule);
  const saveFn = useServerFn(saveTeamEvent);
  const deleteFn = useServerFn(deleteScheduleEvent);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const blank = {
    name: "",
    eventType: "tournament",
    startDate: "",
    endDate: "",
    venue: "",
    city: "",
    state: "",
    linkUrl: "",
  };
  const [form, setForm] = useState(blank);

  const { data } = useQuery({
    queryKey: ["team-schedule", teamId],
    queryFn: () => listFn({ data: { teamId } }),
    retry: false,
  });
  const events = (data?.events ?? []) as Record<string, any>[];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team-schedule", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] }),
    ]);

  const input =
    "mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-graphite";
  const label = "font-mono text-[11px] tracking-wide text-steel uppercase";

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-steel uppercase">
          <CalendarDays className="size-3.5" aria-hidden /> Schedule · {events.length}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-graphite hover:border-org-primary"
        >
          <Plus className="size-3.5" aria-hidden /> Add event
        </button>
      </div>

      {open ? (
        <form
          className="mt-2 grid gap-2 rounded-md border border-border bg-chalk/60 p-3 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await saveFn({ data: { teamId, ...form } });
              setForm(blank);
              setOpen(false);
              await refresh();
              toast.success(`Added to ${teamName}'s schedule`);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        >
          <label className="block sm:col-span-2">
            <span className={label}>Event</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>Type</span>
            <select
              value={form.eventType}
              onChange={(e) => setForm((v) => ({ ...v, eventType: e.target.value }))}
              className={input}
            >
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type[0]!.toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Starts</span>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>Ends</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>Venue</span>
            <input
              value={form.venue}
              onChange={(e) => setForm((v) => ({ ...v, venue: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>City</span>
            <input
              value={form.city}
              onChange={(e) => setForm((v) => ({ ...v, city: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>State</span>
            <input
              maxLength={2}
              value={form.state}
              onChange={(e) => setForm((v) => ({ ...v, state: e.target.value }))}
              className={input}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-org-primary px-3 py-1.5 text-xs font-semibold text-org-primary-foreground"
            >
              Save event
            </button>
          </div>
        </form>
      ) : null}

      {events.length === 0 ? (
        <p className="mt-2 text-xs text-steel">No events posted for this team yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {events.map((row) => (
            <li key={String(row['id'])} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0 truncate text-xs text-graphite">
                <span className="font-semibold">{String(row['name'])}</span>{" "}
                <span className="font-mono text-[11px] text-steel">
                  {[String(row['start_date']), row['city'], row['state']].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteFn({ data: { id: String(row['id']) } });
                    await refresh();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
                className="text-steel hover:text-seam-red"
                aria-label={`Remove ${String(row['name'])}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
