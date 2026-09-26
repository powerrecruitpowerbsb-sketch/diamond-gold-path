import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin } from "lucide-react";

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
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-graphite">Schedule</h1>
          <p className="mt-1 text-sm text-steel">Your club posts events here — they show up automatically.</p>
        </div>

        {error ? (
          <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
            {(error as Error).message}
          </p>
        ) : isPending ? (
          <div className="h-48 animate-pulse rounded-2xl bg-card" />
        ) : upcoming.length === 0 ? (
          <div className="surface-raised rounded-2xl border border-white/10 p-8 text-center">
            <CalendarDays className="mx-auto size-6 text-steel" />
            <p className="mt-2 text-sm text-steel">Nothing on the calendar yet.</p>
          </div>
        ) : (
          [...months.entries()].map(([month, list]) => (
            <section key={month}>
              <p className="meta mb-2 text-org-accent">{month}</p>
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
        "surface-raised flex items-center gap-4 rounded-xl border p-3.5",
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
            <span className="font-mono text-[10px] tracking-wide text-steel uppercase">{e['event_type']}</span>
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
