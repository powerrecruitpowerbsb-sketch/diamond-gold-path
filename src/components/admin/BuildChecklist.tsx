import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Minus } from "lucide-react";

import { getCompletionBoard, getPipelineStatus } from "@/lib/pipeline.functions";
import { seasonLabel } from "@/lib/season";

type Step = {
  title: string;
  state: "done" | "working" | "waiting";
  detail: string;
  action?: { to: "/admin/discovery" | "/admin/review" | "/admin/federal-decisions" | "/admin/tools"; label: string };
};

const n = (value: unknown) => Number(value ?? 0).toLocaleString();

/**
 * The whole build, in the order it happens, one line each. Every number here
 * comes from reads the page already makes — nothing new is queried.
 */
export function BuildChecklist() {
  const statusFn = useServerFn(getPipelineStatus);
  const boardFn = useServerFn(getCompletionBoard);

  const { data: status } = useQuery({ queryKey: ["pipeline-status"], queryFn: () => statusFn() });
  const { data: board } = useQuery({
    queryKey: ["completion-board"],
    queryFn: () => boardFn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const b = board as any;
  const season = b ? seasonLabel(b.seasonYear) : "current";

  const steps: Step[] = [
    {
      title: "Member schools pulled in",
      state: (status?.schools.total ?? 0) > 0 ? "done" : "waiting",
      detail: `${n(status?.schools.total)} schools · ${n(status?.programs.total)} baseball and softball teams`,
    },
    {
      title: "School facts from the federal data",
      state: (status?.schools.federalNeedsHelp ?? 0) > 0 ? "working" : "done",
      detail: `${n(status?.schools.withCost)} schools have cost and academic details`
        + ((status?.schools.federalNeedsHelp ?? 0)
          ? ` · ${n(status?.schools.federalNeedsHelp)} need you to pick the right match`
          : " · nothing left to decide"),
      action: (status?.schools.federalNeedsHelp ?? 0)
        ? { to: "/admin/federal-decisions", label: "Pick the matches" }
        : undefined,
    },
    {
      title: "Which schools actually play the sport",
      state: (status?.sponsorship?.undecided ?? 0) > 0 ? "working" : "done",
      detail: `${n(status?.sponsorship?.offered)} confirmed · ${n(status?.sponsorship?.notOffered)} don't field the sport`
        + ((status?.sponsorship?.undecided ?? 0) ? ` · ${n(status?.sponsorship?.undecided)} still unclear` : ""),
      action: (status?.sponsorship?.undecided ?? 0)
        ? { to: "/admin/tools", label: "Settle these" }
        : undefined,
    },
    {
      title: "Official roster and staff pages found",
      state: (b?.needsLinks ?? 0) > 0 ? "working" : b ? "done" : "waiting",
      detail: b
        ? `${n(b.withRosterPage)} teams have a roster page · ${n(b.needsLinks)} still missing one`
        : "Counting…",
      action: (b?.needsLinks ?? 0) ? { to: "/admin/discovery", label: "Help find pages" } : undefined,
    },
    {
      title: "Head coaches confirmed from those pages",
      state: (b?.needsCoach ?? 0) > 0 ? "working" : b ? "done" : "waiting",
      detail: b
        ? `${n(b.withCoach)} teams have a head coach we can show a source for · ${n(b.needsCoach)} to go`
        : "Counting…",
    },
    {
      title: `${season} rosters read`,
      state: (b?.needsRoster ?? 0) > 0 ? "working" : b ? "done" : "waiting",
      detail: b
        ? `${n(b.withCurrentRoster)} teams have a ${season} roster · ${n(b.needsRoster)} to go`
        : "Counting…",
    },
    {
      title: "Keeping it up to date by itself",
      state: "done",
      detail: `Rosters twice a year, school facts yearly · ${n(status?.refresh?.rostersDueNow)} rosters and ${n(status?.refresh?.factsDueNow)} schools due now`,
    },
  ];

  const finishedCount = steps.filter((step) => step.state === "done").length;

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-graphite">
          Building the national database
        </h2>
        <p className="meta tabular-nums">
          {finishedCount} of {steps.length} stages complete
        </p>
      </div>
      <p className="mt-1 text-sm text-steel">
        These happen in order. Anything marked "in progress" is being worked on automatically.
      </p>

      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full ${
                  step.state === "done"
                    ? "bg-diamond-green/15 text-diamond-green"
                    : step.state === "working"
                      ? "bg-warm-gold/25 text-graphite"
                      : "bg-border/50 text-steel"
                }`}
                aria-hidden
              >
                {step.state === "done" ? (
                  <Check className="size-4" />
                ) : step.state === "working" ? (
                  <Loader2 className="size-4" />
                ) : (
                  <Minus className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-graphite">
                  {index + 1}. {step.title}
                  <span
                    className={`ml-2 text-xs font-semibold ${
                      step.state === "done"
                        ? "text-diamond-green"
                        : step.state === "working"
                          ? "text-graphite"
                          : "text-steel"
                    }`}
                  >
                    {step.state === "done" ? "done" : step.state === "working" ? "in progress" : "not started"}
                  </span>
                </p>
                <p className="meta mt-0.5">{step.detail}</p>
              </div>
            </div>
            {step.action ? (
              <Link
                to={step.action.to}
                className="touch-target inline-flex shrink-0 items-center rounded-lg border border-border px-3 text-sm font-semibold text-graphite"
              >
                {step.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
