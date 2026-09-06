import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MapPin } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { StitchDivider, VerifiedStat } from "@/components/brand/VerifiedStat";
import { ShortlistSaveButton } from "@/components/brand/ShortlistSaveButton";
import { getProgramProfile } from "@/lib/search.functions";
import { listAthletePicker } from "@/lib/shortlist.functions";
import { INTEL_FIELD_LABELS } from "@/lib/search-schema";
import { titleCase } from "@/lib/admin-schemas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/programs/$id")({
  validateSearch: (search: Record<string, unknown>): { athleteId?: string } =>
    typeof search['athleteId'] === "string" && search['athleteId']
      ? { athleteId: search['athleteId'] }
      : {},
  head: () => ({
    meta: [
      { title: "Program profile — Power Recruit" },
      {
        name: "description",
        content:
          "Verified academics, cost, roster composition, and Power Recruit's own recruiting intelligence for this college program.",
      },
      { property: "og:title", content: "Program profile — Power Recruit" },
      {
        property: "og:description",
        content: "Verified data and recruiting intelligence for a college baseball or softball program.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramProfile,
});

const CLASS_YEARS = ["FR", "SO", "JR", "SR", "GR"] as const;
const POSITION_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF",
  "UTIL",
  "RHP",
  "LHP",
  "TWO_WAY",
] as const;

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

const dateLabel = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

function ProgramProfile() {
  const { id } = Route.useParams();
  const { athleteId } = Route.useSearch();
  const profileFn = useServerFn(getProgramProfile);
  const pickerFn = useServerFn(listAthletePicker);
  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    staleTime: 30_000,
    retry: false,
  });
  const contextAthlete = athleteId
    ? ((picker.data?.athletes ?? []) as Record<string, any>[]).find((row) => row['id'] === athleteId) ??
      null
    : null;
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["program-profile", id],
    queryFn: () => profileFn({ data: { programId: id } }),
  });

  if (isPending) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-graphite">Program not found</h1>
          <p className="mt-2 text-sm text-steel">
            {isError ? (error as Error).message : "This program is not available to your account."}
          </p>
          <Link
            to="/search"
            className="mt-5 inline-flex touch-target items-center rounded-lg bg-seam-red px-4 text-sm font-semibold text-white"
          >
            Back to search
          </Link>
        </div>
      </AppShell>
    );
  }

  const { program, university, intelligence, roster, latestSeason, sources } = data as any;

  // Best available provenance for the verified grid.
  const sourceRows = (sources ?? []) as any[];
  const bestSource =
    sourceRows.find((row) => row.source_url && row.source_type === "official") ??
    sourceRows.find((row) => row.source_url) ??
    null;
  const lastVerified =
    dateLabel(
      sourceRows
        .map((row) => row.last_verified_at)
        .filter(Boolean)
        .sort()
        .reverse()[0],
    ) ??
    dateLabel(program.last_verified_at) ??
    dateLabel(university?.updated_at);
  const sourceHost = bestSource?.source_url
    ? new URL(bestSource.source_url).hostname.replace(/^www\./, "")
    : (university?.tuition_source_url
        ? new URL(university.tuition_source_url).hostname.replace(/^www\./, "")
        : null);
  const sourceUrl = bestSource?.source_url ?? university?.tuition_source_url ?? null;

  // Roster composition grouped by position with counts by class year.
  const rosterRows = (roster ?? []) as any[];
  const positions = Array.from(
    new Set(rosterRows.map((r) => r.position ?? "UNLISTED")),
  ).sort(
    (a, b) =>
      (POSITION_ORDER.indexOf(a as any) + 1 || 99) - (POSITION_ORDER.indexOf(b as any) + 1 || 99),
  );
  const countFor = (position: string, year: string) =>
    rosterRows.filter((r) => (r.position ?? "UNLISTED") === position && r.class_year === year)
      .length;
  const totalFor = (position: string) =>
    rosterRows.filter((r) => (r.position ?? "UNLISTED") === position).length;

  const stats = [
    { label: "Average GPA", value: plain(university?.avg_gpa) },
    { label: "Cost of attendance", value: money(university?.est_cost_of_attendance) },
    { label: "Roster size", value: rosterRows.length ? String(rosterRows.length) : "—" },
    { label: "Acceptance rate", value: pct(university?.acceptance_rate) },
    { label: "Undergrad enrollment", value: plain(university?.undergrad_enrollment) },
    { label: "Avg SAT", value: plain(university?.avg_sat) },
    { label: "Avg ACT", value: plain(university?.avg_act) },
    { label: "Est. net price", value: money(university?.est_net_price) },
    { label: "Out-of-state tuition", value: money(university?.tuition_out_state) },
    { label: "Room & board", value: money(university?.room_board) },
    { label: "Graduation rate", value: pct(university?.graduation_rate) },
    {
      label: "Athletic scholarships",
      value:
        program.scholarships_available === null || program.scholarships_available === undefined
          ? "—"
          : program.scholarships_available
            ? "Available"
            : "None",
    },
  ];

  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/search"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to search
      </Link>

      {/* Header */}
      <header className="stadium-gradient overflow-hidden rounded-2xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[1.9rem] leading-[1.08] font-bold text-white sm:text-4xl">
              {university?.name}
            </h1>
            <p className="mt-1 font-display text-lg text-org-accent">
              {titleCase(program.sport)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <span className="rounded-md bg-org-accent px-3 py-1.5 text-sm font-bold text-navy-deep">
              {[program.governing_body, program.division].filter(Boolean).join(" ") || "—"}
            </span>
            <ShortlistSaveButton
              programId={id}
              athleteId={athleteId || undefined}
              athleteName={(contextAthlete?.['name'] as string | undefined) ?? undefined}
            />
          </div>
        </div>

        <dl className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/12 pt-5 text-sm text-white/75">
          <dd className="flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            {[university?.city, university?.state].filter(Boolean).join(", ") || "—"}
          </dd>
          <dd>{plain(program.conference)}</dd>
          <dd>{university?.public_private ? titleCase(university.public_private) : "—"}</dd>
          {university?.campus_setting ? <dd>{titleCase(university.campus_setting)} campus</dd> : null}
          {program.head_coach_name ? <dd>HC {program.head_coach_name}</dd> : null}
        </dl>
      </header>

      {/* Verified Data */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold text-graphite">Verified Data</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <VerifiedStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
        <p className="meta mt-4">
          Source:{" "}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-org-primary"
            >
              {sourceHost}
            </a>
          ) : (
            "Institutional reporting"
          )}
          {lastVerified ? <> · Last verified: {lastVerified}</> : null} · Refreshed quarterly
        </p>
        <div className="mt-4">
          <ReportMistake programId={id} />
        </div>
      </section>


      <StitchDivider />

      {/* Our Intelligence */}
      <section>
        <h2 className="font-display text-xl font-bold text-seam-red">Our Intelligence</h2>
        {intelligence.length === 0 ? (
          <p className="mt-3 text-sm text-steel">
            Recruiting insight for this program hasn’t been added yet.
          </p>
        ) : (
          <div className="mt-4 rounded-xl border-l-4 border-seam-red bg-seam-red-tint p-5">
            <dl className="grid gap-5 sm:grid-cols-2">
              {intelligence.map((row: any) => (
                <div key={row.id}>
                  <dt className="meta text-seam-red">
                    {(INTEL_FIELD_LABELS[row.field_type] ?? row.field_type).toUpperCase()}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-graphite">{row.content}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {/* Roster composition */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-graphite">Roster composition</h2>
          <p className="meta">{latestSeason ? `${latestSeason} season` : "No roster on file"}</p>
        </div>

        {rosterRows.length === 0 ? (
          <p className="mt-3 text-sm text-steel">No roster has been pulled for this program yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="tabular w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b-2 border-org-primary text-left">
                  <th className="px-4 py-3 font-semibold text-org-primary">Position</th>
                  {CLASS_YEARS.map((year) => (
                    <th key={year} className="px-4 py-3 text-right font-semibold text-org-primary">
                      {year}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-org-primary">Total</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position, index) => (
                  <tr key={position} className={cn(index % 2 === 1 && "bg-muted/50")}>
                    <td className="px-4 py-2.5 font-semibold text-graphite">
                      {position === "TWO_WAY" ? "Two-way" : position}
                    </td>
                    {CLASS_YEARS.map((year) => (
                      <td key={year} className="px-4 py-2.5 text-right text-steel">
                        {countFor(position, year) || "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-semibold text-graphite">
                      {totalFor(position)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="px-4 py-3 font-bold text-graphite">All positions</td>
                  {CLASS_YEARS.map((year) => (
                    <td key={year} className="px-4 py-3 text-right font-semibold text-graphite">
                      {rosterRows.filter((r) => r.class_year === year).length || "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold text-graphite">
                    {rosterRows.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
