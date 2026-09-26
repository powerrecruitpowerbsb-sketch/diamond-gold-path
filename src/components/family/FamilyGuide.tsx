import { CalendarClock, CheckCircle2, Circle, DollarSign } from "lucide-react";

import { money } from "@/lib/profile-fields";
import { cn } from "@/lib/utils";

/**
 * The parent side of recruiting: when colleges may talk to the athlete, what
 * the family has to handle, and what the list costs. Rules summarised are the
 * NCAA baseball/softball contact dates; families should confirm with the NCAA.
 */

type Row = Record<string, any>;

function schoolYearEnd(now = new Date()) {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function gradeFor(gradYear: number | null | undefined) {
  if (!gradYear) return null;
  return 12 - (Number(gradYear) - schoolYearEnd());
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Circle;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-chalk/60 p-4">
      <h3 className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-steel uppercase">
        <Icon className="size-3.5" aria-hidden /> {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function FamilyTimeline({ gradYear }: { gradYear: number | null }) {
  if (!gradYear) {
    return (
      <Section title="Timeline" icon={CalendarClock}>
        <p className="text-sm text-steel">Add a grad year to see the recruiting dates.</p>
      </Section>
    );
  }
  const now = new Date();
  const steps = [
    {
      date: new Date(gradYear - 2, 5, 15),
      label: "D1 & D2 coaches may call, text, email and make offers",
      note: "June 15 after sophomore year",
    },
    {
      date: new Date(gradYear - 2, 7, 1),
      label: "D1 official and unofficial visits open",
      note: "August 1 before junior year",
    },
    {
      date: new Date(gradYear - 1, 9, 1),
      label: "Financial aid form (FAFSA) opens",
      note: "Fall of senior year",
    },
    {
      date: new Date(gradYear - 1, 10, 10),
      label: "Early signing period",
      note: "November of senior year",
    },
  ];
  const nextIdx = steps.findIndex((s) => s.date > now);
  return (
    <Section title="Timeline" icon={CalendarClock}>
      <p className="text-sm text-graphite">
        NAIA and junior colleges can contact your athlete at any time. NCAA dates for the Class of{" "}
        {gradYear}:
      </p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => {
          const past = s.date <= now;
          const next = i === nextIdx;
          return (
            <li key={s.label} className="flex gap-3">
              {past ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-diamond-green" aria-hidden />
              ) : (
                <Circle
                  className={cn("mt-0.5 size-4 shrink-0", next ? "text-org-primary" : "text-steel")}
                  aria-hidden
                />
              )}
              <div>
                <p className={cn("text-sm font-semibold", past ? "text-steel" : "text-graphite")}>
                  {s.label}
                  {next ? (
                    <span className="ml-2 rounded-full bg-org-primary/10 px-2 py-0.5 text-[11px] text-org-primary">
                      Next
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-[11px] text-steel">
                  {fmt(s.date)} · {s.note}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-steel">Rules change — confirm dates with the NCAA.</p>
    </Section>
  );
}

export function FamilyChecklist({ athlete, savedCount }: { athlete: Row; savedCount: number }) {
  const grade = gradeFor(athlete['grad_year']);
  const items = [
    { done: Boolean(athlete['eligibility_id']), label: "Register with the NCAA Eligibility Center" },
    { done: athlete['gpa'] != null, label: "Record a current GPA" },
    { done: savedCount >= 5, label: "Build a list of at least 5 colleges" },
    {
      done: grade != null && grade > 11,
      label: "Send official transcripts after junior year",
    },
    { done: false, label: "Complete the FAFSA in the fall of senior year" },
  ];
  return (
    <Section title="Checklist" icon={CheckCircle2}>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-diamond-green" aria-hidden />
            ) : (
              <Circle className="size-4 shrink-0 text-steel" aria-hidden />
            )}
            <span className={item.done ? "text-steel line-through" : "text-graphite"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FamilyFinances({ saved, homeState }: { saved: Row[]; homeState: string | null }) {
  const rows = saved
    .filter((r) => r['status'] !== "eliminated")
    .map((r) => {
      const u = r['program']?.universities ?? {};
      const inState = Boolean(homeState && u.state && u.state === homeState);
      const tuition = u.public_private === "private" || inState ? u.tuition_in_state : u.tuition_out_state;
      return {
        id: r['id'],
        name: u.name ?? "School",
        type: u.public_private as string | null,
        inState,
        tuition: tuition ?? null,
        net: u.est_net_price ?? null,
      };
    });
  const priced = rows.filter((r) => r.net != null).map((r) => Number(r.net));
  return (
    <Section title="Finances" icon={DollarSign}>
      {rows.length === 0 ? (
        <p className="text-sm text-steel">Add colleges to compare costs.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {[
              ["Public", rows.filter((r) => r.type === "public").length],
              ["Private", rows.filter((r) => r.type === "private").length],
              ["In-state", rows.filter((r) => r.inState).length],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="font-mono text-[11px] text-steel uppercase">{k}</dt>
                <dd className="font-semibold text-graphite tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {priced.length ? (
            <p className="mt-3 text-sm text-graphite">
              Average net price range: {money(Math.min(...priced))} – {money(Math.max(...priced))} a
              year
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-border/70 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate text-graphite">
                  {r.name}
                  {r.inState ? (
                    <span className="ml-2 font-mono text-[11px] text-diamond-green">In-state</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-steel tabular-nums">
                  {r.tuition != null ? `${money(r.tuition)} tuition` : "Not reported"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-steel">
            Baseball carries 11.7 scholarships and softball 12, usually split across the roster —
            academic aid and in-state tuition often matter as much.
          </p>
        </>
      )}
    </Section>
  );
}
