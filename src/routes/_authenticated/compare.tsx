import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, Check, X } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { getComparePrograms, MAX_COMPARE } from "@/lib/compare.functions";
import { titleCase } from "@/lib/admin-schemas";
import { regionOfState } from "@/lib/regions";

import { cn } from "@/lib/utils";

const compareSearchSchema = z.object({
  ids: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/compare")({
  validateSearch: zodValidator(compareSearchSchema),
  head: () => ({
    meta: [
      { title: "Compare schools — Curve Recruit" },
      {
        name: "description",
        content:
          "Compare up to four college baseball or softball programs side by side on verified academics, cost, and roster size.",
      },
      { property: "og:title", content: "Compare schools — Curve Recruit" },
      {
        property: "og:description",
        content: "Side-by-side verified comparison of college baseball and softball programs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparePage,
});

const money = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const pct = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${Math.round(Number(value) * (Number(value) <= 1 ? 100 : 1))}%`;

const plain = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

type Row = { label: string; verified?: boolean; value: (entry: any) => string };
type Group = { title: string; rows: Row[] };

/**
 * The same rows as before, read in the order a family actually asks the
 * questions: where is it and who runs it, can we get in, what does it cost,
 * how many players are already there.
 */
const GROUPS: Group[] = [
  {
    title: "The school",
    rows: [
      { label: "Sport", value: (e) => titleCase(e.program.sport) },
      {
        label: "Location",
        value: (e) => [e.university?.city, e.university?.state].filter(Boolean).join(", ") || "—",
      },
      // Region comes from the shared state grouping, so it reads the same here as in search.
      { label: "Region", value: (e) => regionOfState(e.university?.state) ?? "Not reported" },
      { label: "Conference", value: (e) => plain(e.program.conference) },
      {
        label: "Undergrad enrollment",
        value: (e) => plain(e.university?.undergrad_enrollment),
      },
      {
        label: "School size",
        value: (e) =>
          e.university?.school_size_bucket ? titleCase(e.university.school_size_bucket) : "—",
      },
      {
        label: "Public / private",
        value: (e) => (e.university?.public_private ? titleCase(e.university.public_private) : "—"),
      },
    ],
  },
  {
    title: "Academics & admissions",
    rows: [
      { label: "Average GPA", verified: true, value: (e) => plain(e.university?.avg_gpa) },
      { label: "Avg SAT", verified: true, value: (e) => plain(e.university?.avg_sat) },
      { label: "Avg ACT", verified: true, value: (e) => plain(e.university?.avg_act) },
      {
        label: "Acceptance rate",
        verified: true,
        value: (e) => pct(e.university?.acceptance_rate),
      },
      { label: "Academic classification", value: (e) => plain(e.academicBucket) },
    ],
  },
  {
    title: "Cost",
    rows: [
      {
        label: "In-state tuition",
        verified: true,
        value: (e) => money(e.university?.tuition_in_state),
      },
      {
        label: "Out-of-state tuition",
        verified: true,
        value: (e) => money(e.university?.tuition_out_state),
      },
      {
        label: "Cost of attendance",
        verified: true,
        value: (e) => money(e.university?.est_cost_of_attendance),
      },
    ],
  },
  {
    title: "The program",
    rows: [
      {
        label: "Roster size",
        verified: true,
        value: (e) => (e.rosterSize ? String(e.rosterSize) : "—"),
      },
      {
        label: "Athletic scholarships",
        value: (e) =>
          e.program.scholarships_available === null || e.program.scholarships_available === undefined
            ? "—"
            : e.program.scholarships_available
              ? "Available"
              : "None",
      },
    ],
  },
];

function ComparePage() {
  const { ids: idsParam } = Route.useSearch();
  const ids = Array.from(new Set(idsParam.split(",").map((v) => v.trim()).filter(Boolean))).slice(
    0,
    MAX_COMPARE,
  );

  const compareFn = useServerFn(getComparePrograms);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["compare", ids],
    queryFn: () => compareFn({ data: { ids } }),
    enabled: ids.length > 0,
  });

  const programs = (data?.programs ?? []) as any[];

  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/search"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to search
      </Link>

      <header className="stadium-gradient overflow-hidden rounded-2xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="meta mb-3 text-org-accent">SIDE BY SIDE</p>
        <h1 className="font-display text-[1.9rem] leading-[1.08] font-bold text-white sm:text-4xl">
          Compare schools
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/75">
          Same rows, same order, every column. Verified figures carry the green seal styling used on
          each program profile.
        </p>
      </header>

      {ids.length < 2 ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-display text-lg font-bold text-graphite">
            Pick at least two programs
          </p>
          <p className="mt-1 text-sm text-steel">
            Use “Compare” on any search result card, then open the tray.
          </p>
          <Link
            to="/search"
            className="touch-target mt-5 inline-flex items-center rounded-lg bg-seam-red px-4 text-sm font-semibold text-white"
          >
            Go to search
          </Link>
        </div>
      ) : isPending ? (
        <div className="mt-8 h-72 animate-pulse rounded-xl bg-muted" />
      ) : isError ? (
        <p className="mt-8 rounded-xl bg-seam-red-tint p-4 text-sm text-seam-red">
          Could not load the comparison. {(error as Error).message}
        </p>
      ) : programs.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-8 text-center text-sm text-steel">
          None of those programs are available to your account.
        </p>
      ) : (
        <section className="surface-raised mt-8 overflow-x-auto rounded-2xl">
          <table className="tabular w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[170px] border-b border-border bg-surface-2 px-4 py-4 text-left align-bottom"
                >
                  <span className="meta">ATTRIBUTE</span>
                </th>
                {programs.map((entry) => {
                  const rest = programs
                    .filter((other) => other.program.id !== entry.program.id)
                    .map((other) => other.program.id)
                    .join(",");
                  return (
                    <th
                      key={entry.program.id}
                      scope="col"
                      className="min-w-[210px] border-b border-border bg-surface-2 px-4 py-4 text-left align-bottom"
                    >
                      <span className="mb-2 flex items-start justify-between gap-2">
                        <span className="rounded-md border border-org-primary/40 bg-org-primary-tint px-2 py-1 text-[11px] font-bold tracking-wide text-org-primary-strong uppercase">
                          {[entry.program.governing_body, entry.program.division]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </span>
                        {/* Dropping a column is just a shorter id list. */}
                        <Link
                          to="/compare"
                          search={{ ids: rest }}
                          aria-label={`Remove ${entry.university?.name ?? "school"}`}
                          className="text-steel hover:text-seam-red"
                        >
                          <X className="size-4" aria-hidden />
                        </Link>
                      </span>
                      <Link
                        to="/programs/$id"
                        params={{ id: entry.program.id }}
                        className="font-display block text-base leading-snug font-bold text-foreground hover:underline"
                      >
                        {entry.university?.name}
                      </Link>
                      <span className="meta mt-1 block normal-case">
                        {[entry.university?.city, entry.university?.state]
                          .filter(Boolean)
                          .join(", ") || "Location not reported"}
                      </span>
                      <span className="meta mt-0.5 block normal-case">
                        {entry.program.conference || "Conference not reported"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {GROUPS.map((group) => (
              <tbody key={group.title}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={programs.length + 1}
                    className="border-y border-border bg-org-primary-tint/60 px-4 py-2 text-left"
                  >
                    <span className="meta text-org-primary-strong">{group.title.toUpperCase()}</span>
                  </th>
                </tr>
                {group.rows.map((row, index) => {
                  const values = programs.map((entry) => row.value(entry));
                  const differs = new Set(values).size > 1;
                  return (
                    <tr key={row.label} className={cn(index % 2 === 1 && "bg-surface-2/50")}>
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 px-4 py-3 text-left align-middle font-semibold text-steel",
                          index % 2 === 1 ? "bg-surface-2" : "bg-card",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {row.verified ? (
                            <span
                              className="grid size-4 shrink-0 place-items-center rounded-full bg-diamond-green"
                              aria-hidden
                            >
                              <Check className="size-2.5 text-navy-deep" strokeWidth={3} />
                            </span>
                          ) : null}
                          {row.label}
                        </span>
                      </th>
                      {programs.map((entry, column) => (
                        <td
                          key={entry.program.id}
                          className={cn(
                            "px-4 py-3 align-middle",
                            row.verified
                              ? "font-display font-bold text-diamond-green"
                              : "text-graphite",
                            differs && row.verified && "bg-diamond-green-tint/50",
                          )}
                        >
                          {values[column]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </section>
      )}

      {programs.length > 0 ? (
        <p className="meta mt-4">
          Verified values are sourced and dated on each program profile · Comparison is ad-hoc and
          not saved
        </p>
      ) : null}
    </AppShell>
  );
}
