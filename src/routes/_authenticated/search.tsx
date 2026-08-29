import { useState } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { ChevronDown, Columns3, MapPin, Search as SearchIcon, SlidersHorizontal } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { VerifiedChip } from "@/components/brand/DataSignals";
import { useCompare } from "@/components/compare/compare-selection";
import { ShortlistSaveButton } from "@/components/brand/ShortlistSaveButton";
import { listAthletePicker } from "@/lib/shortlist.functions";
import { getSearchFacets, searchPrograms } from "@/lib/search.functions";
import {
  ACADEMIC_BUCKETS,
  CAMPUS_SETTINGS,
  GOVERNING_BODIES,
  PUBLIC_PRIVATE,
  SCHOOL_SIZE_BUCKETS,
  titleCase,
} from "@/lib/admin-schemas";
import {
  DIVISIONS_BY_BODY,
  SEARCH_DEFAULTS,
  activeSecondaryCount,
  searchParamsSchema,
  type SearchParams,
} from "@/lib/search-schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: zodValidator(searchParamsSchema),
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  head: () => ({
    meta: [
      { title: "Find your college fit — Power Recruit" },
      {
        name: "description",
        content:
          "Search verified baseball and softball college programs by division, state, academics, cost, and roster construction.",
      },
      { property: "og:title", content: "Find your college fit — Power Recruit" },
      {
        property: "og:description",
        content: "Search verified college baseball and softball programs on Power Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchScreen,
});

const money = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const pct = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${Math.round(Number(value) * (Number(value) <= 1 ? 100 : 1))}%`;

function SearchScreen() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [moreOpen, setMoreOpen] = useState(params.more);
  const compare = useCompare();

  const facetsFn = useServerFn(getSearchFacets);
  const searchFn = useServerFn(searchPrograms);

  const pickerFn = useServerFn(listAthletePicker);
  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    staleTime: 30_000,
    retry: false,
  });
  const contextAthlete = params.athleteId
    ? ((picker.data?.athletes ?? []) as Record<string, any>[]).find(
        (row) => row['id'] === params.athleteId,
      ) ?? null
    : null;

  const facets = useQuery({ queryKey: ["search-facets"], queryFn: () => facetsFn() });
  const results = useQuery({
    queryKey: ["program-search", params],
    queryFn: () => searchFn({ data: params }),
  });

  const set = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const divisions = DIVISIONS_BY_BODY[params.governingBody] ?? [];
  const secondaryCount = activeSecondaryCount(params);
  const rows = results.data?.results ?? [];

  return (
    <AppShell right={<AuthButton />}>
      {/* Hero with the search panel layered in */}
      <section className="stadium-gradient relative overflow-hidden rounded-2xl px-5 pt-10 pb-6 sm:px-8 sm:pt-14">
        <p className="meta mb-3 text-org-accent">VERIFIED COLLEGE DATABASE</p>
        <h1 className="font-display text-[2rem] leading-[1.05] font-bold text-white sm:text-[2.75rem]">
          Find the program that fits.
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-white/75 sm:text-base">
          Every academic, cost, and roster figure below is sourced and dated. Filter the way
          families actually decide.
        </p>

        <div className="mt-8 rounded-2xl bg-card p-4 shadow-[0_18px_44px_-18px_rgba(18,35,58,0.55)] sm:p-5">
          {/* Sport toggle */}
          <div className="mb-4 inline-flex rounded-lg bg-muted p-1">
            {(["baseball", "softball"] as const).map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => set({ sport })}
                className={cn(
                  "touch-target rounded-md px-5 text-sm font-semibold transition-colors",
                  params.sport === sport
                    ? "bg-org-primary text-white"
                    : "text-steel hover:text-graphite",
                )}
              >
                {titleCase(sport)}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="School name">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
                <input
                  value={params.q}
                  onChange={(event) => set({ q: event.target.value })}
                  placeholder="Search schools"
                  className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus:border-org-primary"
                />
              </div>
            </Field>
            <Field label="State">
              <Select
                value={params.state}
                onChange={(value) => set({ state: value })}
                placeholder="All states"
                options={(facets.data?.states ?? []).map((s) => ({ value: s, label: s }))}
              />
            </Field>
            <Field label="Governing body">
              <Select
                value={params.governingBody}
                onChange={(value) => set({ governingBody: value, division: "" })}
                placeholder="All"
                options={GOVERNING_BODIES.map((g) => ({ value: g, label: g }))}
              />
            </Field>
            <Field label="Division">
              <Select
                value={params.division}
                onChange={(value) => set({ division: value })}
                placeholder={divisions.length ? "All divisions" : "All"}
                options={(divisions.length ? divisions : (facets.data?.divisions ?? [])).map(
                  (d) => ({ value: d, label: d }),
                )}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => {
              setMoreOpen((open) => !open);
              set({ more: !moreOpen });
            }}
            aria-expanded={moreOpen}
            className="touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-org-primary hover:bg-muted sm:w-auto sm:px-4"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            More filters
            {secondaryCount > 0 ? (
              <span className="tabular rounded-full bg-org-primary px-2 py-0.5 text-[11px] text-white">
                {secondaryCount}
              </span>
            ) : null}
            <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
          </button>

          {moreOpen ? (
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Region">
                <Select
                  value={params.region}
                  onChange={(value) => set({ region: value })}
                  placeholder="All regions"
                  options={(facets.data?.regions ?? []).map((r) => ({ value: r, label: r }))}
                />
              </Field>
              <Field label="Conference">
                <Select
                  value={params.conference}
                  onChange={(value) => set({ conference: value })}
                  placeholder="All conferences"
                  options={(facets.data?.conferences ?? []).map((c) => ({ value: c, label: c }))}
                />
              </Field>
              <Field label="Public / private">
                <Select
                  value={params.publicPrivate}
                  onChange={(value) => set({ publicPrivate: value })}
                  placeholder="Either"
                  options={PUBLIC_PRIVATE.map((p) => ({ value: p, label: titleCase(p) }))}
                />
              </Field>
              <Field label="School size">
                <Select
                  value={params.schoolSize}
                  onChange={(value) => set({ schoolSize: value })}
                  placeholder="Any size"
                  options={SCHOOL_SIZE_BUCKETS.map((s) => ({ value: s, label: titleCase(s) }))}
                />
              </Field>
              <Field label="Campus setting">
                <Select
                  value={params.campusSetting}
                  onChange={(value) => set({ campusSetting: value })}
                  placeholder="Any setting"
                  options={CAMPUS_SETTINGS.map((s) => ({ value: s, label: titleCase(s) }))}
                />
              </Field>
              <Field label="Academic classification">
                <Select
                  value={params.academicBucket}
                  onChange={(value) => set({ academicBucket: value })}
                  placeholder="Any"
                  options={ACADEMIC_BUCKETS.map((b) => ({ value: b, label: b }))}
                />
              </Field>
              <Field label="Major offered">
                <Select
                  value={params.majorId}
                  onChange={(value) => set({ majorId: value })}
                  placeholder="Any major"
                  options={(facets.data?.majors ?? []).map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                />
              </Field>
              <Field label="Religious affiliation">
                <Select
                  value={params.religious}
                  onChange={(value) => set({ religious: value })}
                  placeholder="Either"
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </Field>
              <Field label="Athletic scholarships">
                <Select
                  value={params.scholarships}
                  onChange={(value) => set({ scholarships: value })}
                  placeholder="Either"
                  options={[
                    { value: "yes", label: "Available" },
                    { value: "no", label: "Not available" },
                  ]}
                />
              </Field>

              <Range
                label="Cost of attendance ($)"
                min={params.tuitionMin}
                max={params.tuitionMax}
                onChange={(tuitionMin, tuitionMax) => set({ tuitionMin, tuitionMax })}
              />
              <Range
                label="Average GPA"
                step={0.1}
                min={params.gpaMin}
                max={params.gpaMax}
                onChange={(gpaMin, gpaMax) => set({ gpaMin, gpaMax })}
              />
              <Range
                label="SAT"
                min={params.satMin}
                max={params.satMax}
                onChange={(satMin, satMax) => set({ satMin, satMax })}
              />
              <Range
                label="ACT"
                min={params.actMin}
                max={params.actMax}
                onChange={(actMin, actMax) => set({ actMin, actMax })}
              />
              <Range
                label="Acceptance rate (%)"
                min={params.acceptanceMin}
                max={params.acceptanceMax}
                onChange={(acceptanceMin, acceptanceMax) => set({ acceptanceMin, acceptanceMax })}
              />
              <Range
                label="Roster size"
                min={params.rosterMin}
                max={params.rosterMax}
                onChange={(rosterMin, rosterMax) => set({ rosterMin, rosterMax })}
              />

              <div className="sm:col-span-2 lg:col-span-3">
                <Link
                  to="/search"
                  search={{ sport: params.sport, more: true } as any}
                  className="text-sm font-semibold text-seam-red underline decoration-dotted underline-offset-4"
                >
                  Clear all filters
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {params.athleteId ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-org-accent/40 bg-org-accent/10 p-4">
          <p className="text-sm text-graphite">
            Building the shortlist for{" "}
            <span className="font-display font-bold">
              {contextAthlete?.['name'] ?? "this athlete"}
            </span>
            . Saves go straight to their board.
          </p>
          <Link
            to="/roster/$id"
            params={{ id: params.athleteId }}
            className="text-sm font-semibold text-org-primary underline decoration-dotted underline-offset-4"
          >
            Back to athlete
          </Link>
          <Link
            to="/search"
            search={(prev: any) => ({ ...prev, athleteId: "" })}
            className="ml-auto text-sm font-semibold text-seam-red underline decoration-dotted underline-offset-4"
          >
            Exit athlete context
          </Link>
        </div>
      ) : null}

      {/* Results */}
      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-graphite">
          {results.isPending ? "Searching…" : `${rows.length} program${rows.length === 1 ? "" : "s"}`}
        </h2>
        <p className="meta">{titleCase(params.sport)}</p>
      </div>

      {results.isError ? (
        <p className="mt-4 rounded-xl bg-seam-red-tint p-4 text-sm text-seam-red">
          Could not load results. {(results.error as Error).message}
        </p>
      ) : null}

      {results.isPending ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-display text-lg font-bold text-graphite">No programs match yet</p>
          <p className="mt-1 text-sm text-steel">
            Widen a filter — division, state, or cost range are the usual culprits.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row: any) => {
            const selected = compare.isSelected(row.id);
            return (
            <div
              key={row.id}
              className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover"
            >
            <Link
              to="/programs/$id"
              params={{ id: row.id }}
              className="group flex flex-1 flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg leading-snug font-bold text-org-primary group-hover:underline">
                  {row.university?.name}
                </h3>
                <span className="shrink-0 rounded-md bg-org-primary px-2 py-1 text-[11px] font-bold text-white">
                  {[row.governing_body, row.division].filter(Boolean).join(" ") || "—"}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-steel">
                <MapPin className="size-3.5" aria-hidden />
                {[row.university?.city, row.university?.state].filter(Boolean).join(", ") || "—"}
                <span className="text-border">·</span>
                {titleCase(row.sport)}
              </p>

              <dl className="tabular mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <Stat label="Cost" value={money(row.university?.est_cost_of_attendance)} />
                <Stat label="Avg GPA" value={row.university?.avg_gpa ?? "—"} />
                <Stat label="Roster" value={row.roster?.size || "—"} />
              </dl>

              <div className="mt-4 flex items-center justify-between gap-2">
                <VerifiedChip>Verified</VerifiedChip>
                <span className="meta">Accept. {pct(row.university?.acceptance_rate)}</span>
              </div>
            </Link>

              <ShortlistSaveButton
                programId={row.id}
                athleteId={params.athleteId || undefined}
                athleteName={(contextAthlete?.['name'] as string | undefined) ?? undefined}
                className="mt-4 w-full"
              />

              <button
                type="button"
                aria-pressed={selected}
                disabled={!selected && compare.isFull}
                onClick={() =>
                  compare.toggle({
                    id: row.id,
                    name: row.university?.name ?? "Program",
                    badge: [row.governing_body, row.division].filter(Boolean).join(" "),
                  })
                }
                className={cn(
                  "touch-target mt-2 flex w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
                  selected
                    ? "border-org-primary bg-org-primary text-white"
                    : "border-border bg-card text-org-primary hover:bg-muted",
                  !selected && compare.isFull && "cursor-not-allowed opacity-50",
                )}
              >
                <Columns3 className="size-4" aria-hidden />
                {selected ? "Selected for compare" : compare.isFull ? "Compare list full" : "Compare"}
              </button>
            </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="meta">{label.toUpperCase()}</dt>
      <dd className="font-display text-base font-bold text-graphite">{String(value)}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="meta mb-1.5 block">{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Range({
  label,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div>
      <span className="meta mb-1.5 block">{label.toUpperCase()}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step ?? 1}
          value={min || ""}
          placeholder="Min"
          onChange={(event) => onChange(Number(event.target.value) || 0, max)}
          className="tabular h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
        />
        <span className="text-steel">–</span>
        <input
          type="number"
          step={step ?? 1}
          value={max || ""}
          placeholder="Max"
          onChange={(event) => onChange(min, Number(event.target.value) || 0)}
          className="tabular h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
        />
      </div>
    </div>
  );
}
