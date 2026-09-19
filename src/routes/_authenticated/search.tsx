import { useEffect, useState } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { ChevronDown, Columns3, SlidersHorizontal, X } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { useCompare } from "@/components/compare/compare-selection";
import { ShortlistSaveButton } from "@/components/brand/ShortlistSaveButton";
import { SchoolSheet, type SheetEntry } from "@/components/list/SchoolSheet";
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
import { POSITION_GROUP_LABELS, type PositionGroup } from "@/lib/position-group";
import { REGIONS, regionOfState, statesInRegion } from "@/lib/regions";
import {
  DIVISIONS_BY_BODY,
  SEARCH_DEFAULTS,
  activeSecondaryCount,
  searchParamsSchema,
  type SearchParams,
} from "@/lib/search-schema";
import { NOT_REPORTED } from "@/lib/profile-fields";
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
          "Search verified baseball and softball college programs by division, location, cost, academics, and roster construction.",
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
    ? NOT_REPORTED
    : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const number = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? NOT_REPORTED
    : Number(value).toLocaleString("en-US");

/** Test scores are not counts — no thousands separator. */
const plain = (value: unknown) =>
  value === null || value === undefined || value === "" ? NOT_REPORTED : String(value);


const POSITION_GROUPS = Object.keys(POSITION_GROUP_LABELS) as PositionGroup[];

type SortKey =
  | "name"
  | "state"
  | "region"
  | "level"
  | "conference"
  | "enrollment"
  | "netPrice"
  | "sat"
  | "act"
  | "roster"
  | "coach";

const SORTABLE: { key: SortKey; header: string; numeric?: boolean }[] = [
  { key: "name", header: "School" },
  { key: "state", header: "State" },
  { key: "region", header: "Region" },
  { key: "level", header: "Level" },
  { key: "conference", header: "Conference" },
  { key: "enrollment", header: "Enrol", numeric: true },
  { key: "netPrice", header: "Net price", numeric: true },
  { key: "sat", header: "SAT", numeric: true },
  { key: "roster", header: "Roster", numeric: true },
  { key: "coach", header: "Head coach" },
];

function sortValue(key: SortKey, row: any): string | number | null {
  const u = row.university ?? {};
  switch (key) {
    case "name":
      return String(u.name ?? "");
    case "state":
      return String(u.state ?? "");
    case "region":
      return regionOfState(u.state) ?? "";
    case "level":
      return [row.governing_body, row.division].filter(Boolean).join(" ");
    case "conference":
      return String(row.conference ?? "");
    case "enrollment":
      return u.undergrad_enrollment ?? null;
    case "netPrice":
      return u.est_net_price ?? null;
    case "sat":
      return u.avg_sat ?? null;
    case "act":
      return u.avg_act ?? null;
    case "roster":
      return row.roster?.size || null;
    case "coach":
      return String(row.head_coach_name ?? "");
  }
}

/** Keys that describe *what* you're looking for; sport/sorting/athlete don't count. */
const CRITERIA_KEYS = Object.keys(SEARCH_DEFAULTS).filter(
  (key) => !["sport", "sort", "dir", "more", "athleteId"].includes(key),
) as (keyof SearchParams)[];

function hasCriteria(params: SearchParams) {
  return CRITERIA_KEYS.some((key) => {
    const value = params[key];
    const fallback = (SEARCH_DEFAULTS as Record<string, unknown>)[key as string];
    if (Array.isArray(value)) return value.length > 0;
    return value !== fallback && value !== "" && value !== 0;
  });
}

function SearchScreen() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [moreOpen, setMoreOpen] = useState(params.more);
  const [openEntry, setOpenEntry] = useState<SheetEntry | null>(null);
  const compare = useCompare();
  const searching = hasCriteria(params);

  const facetsFn = useServerFn(getSearchFacets);
  const searchFn = useServerFn(searchPrograms);

  const pickerFn = useServerFn(listAthletePicker);
  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    staleTime: 30_000,
    retry: false,
  });
  const pickerAthletes = (picker.data?.athletes ?? []) as Record<string, any>[];
  const contextAthlete = params.athleteId
    ? pickerAthletes.find((row) => row["id"] === params.athleteId) ?? null
    : null;

  const facets = useQuery({ queryKey: ["search-facets"], queryFn: () => facetsFn() });
  const results = useQuery({
    queryKey: ["program-search", params],
    queryFn: () => searchFn({ data: params }),
    enabled: searching,
  });


  const set = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const divisions = DIVISIONS_BY_BODY[params.governingBody] ?? [];
  const secondaryCount = activeSecondaryCount(params);
  // Verified vs unverified is an internal data-quality signal, kept in the
  // console. A family sees the conference we hold, and it filters normally.
  const conferences = facets.data?.conferences ?? [];


  // Location is one control: a region, or states within it.
  const regionStates = params.region ? statesInRegion(params.region) : [];
  const stateOptions = (facets.data?.states ?? []).filter(
    (code) => regionStates.length === 0 || regionStates.includes(code),
  );
  const addLocation = (value: string) => {
    if (!value) return;
    if (REGIONS.includes(value as any)) {
      set({ region: value, states: [] });
      return;
    }
    if (params.states.includes(value)) return;
    set({ states: [...params.states, value] });
  };

  const dir = params.dir === "desc" ? "desc" : "asc";
  const sortKey = (SORTABLE.find((c) => c.key === params.sort)?.key ?? "name") as SortKey;
  const toggleSort = (key: SortKey) =>
    set({ sort: key, dir: sortKey === key && dir === "asc" ? "desc" : "asc" });

  const rows = [...((results.data?.results ?? []) as any[])].sort((a, b) => {
    const left = sortValue(sortKey, a);
    const right = sortValue(sortKey, b);
    if (left === null && right === null) return 0;
    // Missing values always sit at the bottom, either direction.
    if (left === null) return 1;
    if (right === null) return -1;
    const cmp =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return dir === "asc" ? cmp : -cmp;
  });

  const chips: { label: string; clear: Partial<SearchParams> }[] = [];
  if (params.q) chips.push({ label: `Name: ${params.q}`, clear: { q: "" } });
  if (params.region) chips.push({ label: params.region, clear: { region: "", states: [] } });
  for (const code of params.states) {
    chips.push({
      label: code,
      clear: { states: params.states.filter((s) => s !== code) },
    });
  }
  if (params.governingBody)
    chips.push({
      label: [params.governingBody, params.division].filter(Boolean).join(" "),
      clear: { governingBody: "", division: "" },
    });
  else if (params.division)
    chips.push({ label: params.division, clear: { division: "" } });
  if (params.netPriceMin || params.netPriceMax)
    chips.push({
      label: `Net price ${params.netPriceMin ? money(params.netPriceMin) : "any"} – ${
        params.netPriceMax ? money(params.netPriceMax) : "any"
      }`,
      clear: { netPriceMin: 0, netPriceMax: 0 },
    });
  if (params.majorId)
    chips.push({
      label:
        (facets.data?.majors ?? []).find((m) => m.id === params.majorId)?.name ?? "Major",
      clear: { majorId: "" },
    });
  if (params.conference)
    chips.push({
      label: params.conference,
      clear: { conference: "" },
    });
  if (params.publicPrivate)
    chips.push({ label: titleCase(params.publicPrivate), clear: { publicPrivate: "" } });
  if (params.schoolSize)
    chips.push({ label: `${titleCase(params.schoolSize)} school`, clear: { schoolSize: "" } });
  if (params.campusSetting)
    chips.push({ label: titleCase(params.campusSetting), clear: { campusSetting: "" } });
  if (params.academicBucket)
    chips.push({ label: params.academicBucket, clear: { academicBucket: "" } });
  if (params.religious)
    chips.push({
      label: params.religious === "yes" ? "Religious" : "Not religious",
      clear: { religious: "" },
    });
  if (params.scholarships)
    chips.push({
      label: params.scholarships === "yes" ? "Scholarships" : "No scholarships",
      clear: { scholarships: "" },
    });
  if (params.rosterMin || params.rosterMax)
    chips.push({
      label: `Roster ${params.rosterMin || "any"}–${params.rosterMax || "any"}`,
      clear: { rosterMin: 0, rosterMax: 0 },
    });
  if (params.positionGroup)
    chips.push({
      label: `${POSITION_GROUP_LABELS[params.positionGroup as PositionGroup] ?? params.positionGroup}: ${
        params.positionMin || 0
      }–${params.positionMax || "any"}`,
      clear: { positionGroup: "", positionMin: 0, positionMax: 0 },
    });
  if (params.seniorGroup)
    chips.push({
      label: `${params.seniorMin || 1}+ senior ${(
        POSITION_GROUP_LABELS[params.seniorGroup as PositionGroup] ?? params.seniorGroup
      ).toLowerCase()}`,
      clear: { seniorGroup: "", seniorMin: 0 },
    });
  if (params.transferPctMin || params.transferPctMax)
    chips.push({
      label: `Transfers ${params.transferPctMin || 0}–${params.transferPctMax || 100}%`,
      clear: { transferPctMin: 0, transferPctMax: 0 },
    });

  return (
    <AppShell right={<AuthButton />}>
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-bold text-org-primary">Find a program</h1>
        <p className="mt-1.5 text-[15px] text-steel">
          {!searching
            ? "Search 3,238 programs by name, location, or level."
            : results.isPending
              ? "Searching…"
              : `${(results.data?.matches ?? rows.length).toLocaleString("en-US")} ${titleCase(
                  params.sport,
                ).toLowerCase()} teams match${
                  results.data?.capped ? ` · showing the first ${rows.length}` : ""
                }`}
        </p>

        {pickerAthletes.length > 0 ? (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="meta text-steel">Adding to</span>
            <select
              value={params.athleteId ?? ""}
              onChange={(event) => set({ athleteId: event.target.value })}
              className="h-8 rounded border border-input bg-card px-2 text-sm"
            >
              <option value="">Choose a player…</option>
              {pickerAthletes.map((athlete) => (
                <option key={String(athlete["id"])} value={String(athlete["id"])}>
                  {String(athlete["name"])}
                  {athlete["grad_year"] ? ` · ${athlete["grad_year"]}` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-steel">
              {params.athleteId
                ? "Every row adds to this player's list."
                : "Pick a player once and every row adds to their list."}
            </span>
          </label>
        ) : null}
      </header>


      {/* Results render in place, above the filter panel that produced them. */}
      {results.data?.unpublishedPositions ? (
        <p className="mt-3 rounded border border-border bg-muted/50 p-2.5 text-sm text-steel">
          {results.data.unpublishedPositions} team
          {results.data.unpublishedPositions === 1 ? "" : "s"} left out of the position filter
          because the school publishes no positions — not counted as zero.
        </p>
      ) : null}

      {results.isError ? (
        <p className="mt-3 rounded border border-seam-red bg-seam-red-tint p-3 text-sm text-seam-red">
          Could not load results. {(results.error as Error).message}
        </p>
      ) : null}

      {!searching ? (
        <EmptyState className="mt-4" icon={SearchIcon} headline="Start with one filter">
          Pick a level, a state, or type a school name.
        </EmptyState>
      ) : results.isPending ? (
        <div className="mt-4 h-64 animate-pulse rounded border border-border bg-card" />
      ) : rows.length === 0 ? (
        <EmptyState className="mt-4" icon={SearchIcon} headline="Nothing matches yet">
          Widen a filter. Division, location and net price narrow things fastest.
        </EmptyState>
      ) : (
        <div className="mt-4 overflow-x-auto rounded border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Matching college teams</caption>
            <thead>
              <tr className="border-b border-border">
                {SORTABLE.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sortKey === column.key
                        ? dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase",
                      column.numeric && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="uppercase hover:text-graphite"
                    >
                      {column.header}
                      {sortKey === column.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-[11px] text-steel uppercase">
                  Add to list
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => {
                const u = row.university ?? {};
                const selected = compare.isSelected(row.id);
                const region = regionOfState(u.state);
                // Same behaviour as College list: the row opens over the results.
                const openRow = () =>
                  setOpenEntry({
                    // Notes live on the saved-list row; from Search there isn't one yet.
                    id: null,
                    programId: row.id,
                    school: String(u.name ?? "Program"),
                    sport: row.sport ?? null,
                    notes: null,
                    threadId: null,
                    athleteId: params.athleteId || null,
                  });
                return (
                  <tr
                    key={row.id}
                    onClick={openRow}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="h-[38px] max-w-[240px] truncate px-3 py-1.5 align-middle whitespace-nowrap">
                      <span className="font-semibold text-org-primary underline-offset-2 hover:underline">
                        {u.name}
                      </span>
                    </td>
                    <td className="h-[38px] px-3 py-1.5 align-middle whitespace-nowrap text-graphite">
                      {u.state ?? NOT_REPORTED}
                    </td>
                    <td className="h-[38px] px-3 py-1.5 align-middle whitespace-nowrap text-graphite">
                      {region ?? NOT_REPORTED}
                    </td>
                    <td className="h-[38px] px-3 py-1.5 align-middle whitespace-nowrap text-graphite">
                      {[row.governing_body, row.division].filter(Boolean).join(" ") || NOT_REPORTED}
                    </td>
                    <td className="h-[38px] max-w-[200px] truncate px-3 py-1.5 align-middle whitespace-nowrap text-graphite">
                      {row.conference ? (
                        row.conference
                      ) : (
                        NOT_REPORTED
                      )}

                    </td>
                    <td className="tabular h-[38px] px-3 py-1.5 text-right align-middle whitespace-nowrap text-graphite">
                      {number(u.undergrad_enrollment)}
                    </td>
                    <td className="tabular h-[38px] px-3 py-1.5 text-right align-middle whitespace-nowrap text-graphite">
                      {money(u.est_net_price)}
                    </td>
                    <td className="tabular h-[38px] px-3 py-1.5 text-right align-middle whitespace-nowrap text-graphite">
                      {plain(u.avg_sat)}
                    </td>
                    <td className="tabular h-[38px] px-3 py-1.5 text-right align-middle whitespace-nowrap text-graphite">
                      {row.roster?.size ? row.roster.size : "No roster on file"}
                    </td>
                    <td className="h-[38px] max-w-[170px] truncate px-3 py-1.5 align-middle whitespace-nowrap text-graphite">
                      {row.head_coach_name ?? "Not published by the school"}
                    </td>
                    <td
                      className="h-[38px] px-3 py-1.5 align-middle"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <ShortlistSaveButton
                          programId={row.id}
                          athleteId={params.athleteId || undefined}
                          athleteName={
                            (contextAthlete?.["name"] as string | undefined) ?? undefined
                          }
                          className="h-8 rounded border border-border bg-card px-2 text-xs font-semibold text-org-primary hover:bg-muted"
                        />



                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={selected ? "Selected for compare" : "Add to compare"}
                          disabled={!selected && compare.isFull}
                          onClick={() =>
                            compare.toggle({
                              id: row.id,
                              name: u.name ?? "Program",
                              badge: [row.governing_body, row.division].filter(Boolean).join(" "),
                            })
                          }
                          className={cn(
                            "flex size-8 items-center justify-center rounded border",
                            selected
                              ? "border-org-primary bg-org-primary text-white"
                              : "border-border text-org-primary hover:bg-muted",
                            !selected && compare.isFull && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <Columns3 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Six primary filters */}
      <div className="mt-4 rounded border border-border bg-card p-3">
        <div className="mb-3 inline-flex rounded border border-border p-0.5">
          {(["baseball", "softball"] as const).map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => set({ sport })}
              className={cn(
                "h-8 rounded-sm px-4 text-sm font-semibold",
                params.sport === sport
                  ? "bg-org-primary text-white"
                  : "text-steel hover:text-graphite",
              )}
            >
              {titleCase(sport)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="School name">
            <input
              value={params.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Search schools"
              className="h-9 w-full rounded border border-input bg-card px-2.5 text-sm outline-none focus:border-org-primary"
            />
          </Field>

          <Field label="Location">
            <select
              value=""
              aria-label="Add a region or state"
              onChange={(event) => addLocation(event.target.value)}
              className="h-9 w-full rounded border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
            >
              <option value="">
                {params.region || params.states.length
                  ? "Add a state…"
                  : "Anywhere — region or state"}
              </option>
              {params.region ? null : (
                <optgroup label="Regions">
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="States">
                {stateOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>

          <Field label="Governing body & division">
            <div className="flex gap-2">
              <Select
                value={params.governingBody}
                onChange={(value) => set({ governingBody: value, division: "" })}
                placeholder="All bodies"
                options={GOVERNING_BODIES.map((g) => ({ value: g, label: g }))}
              />
              <Select
                value={params.division}
                onChange={(value) => set({ division: value })}
                placeholder={divisions.length ? "All divisions" : "All"}
                options={(divisions.length ? divisions : (facets.data?.divisions ?? [])).map(
                  (d) => ({ value: d, label: d }),
                )}
              />
            </div>
          </Field>

          <Range
            label="Net price ($ a family pays)"
            min={params.netPriceMin}
            max={params.netPriceMax}
            onChange={(netPriceMin, netPriceMax) => set({ netPriceMin, netPriceMax })}
          />

          <Field label="Major offered">
            <Select
              value={params.majorId}
              onChange={(value) => set({ majorId: value })}
              placeholder="Any major"
              options={(facets.data?.majors ?? []).map((m) => ({ value: m.id, label: m.name }))}
            />
          </Field>

          <div className="flex items-end">
            <DisclosureButton
              open={moreOpen}
              count={secondaryCount}
              onClick={() => {
                setMoreOpen((open) => !open);
                set({ more: !moreOpen });
              }}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              More filters
            </DisclosureButton>
          </div>
        </div>

        {moreOpen ? (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Conference">
              <Select
                value={params.conference}
                onChange={(value) => set({ conference: value })}
                placeholder="All conferences"
                options={conferences.map((c) => ({
                  value: c.name,
                  label: c.name,
                }))}
              />
            </Field>
            <Field label="Academic classification (not classified yet)">
              <Select
                value={params.academicBucket}
                onChange={(value) => set({ academicBucket: value })}
                placeholder="Any"
                options={ACADEMIC_BUCKETS.map((b) => ({ value: b, label: b }))}
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
              label="Tuition, out of state ($)"
              min={params.tuitionMin}
              max={params.tuitionMax}
              onChange={(tuitionMin, tuitionMax) => set({ tuitionMin, tuitionMax })}
            />
            <Range
              label="Total cost of attendance ($)"
              min={params.coaMin}
              max={params.coaMax}
              onChange={(coaMin, coaMax) => set({ coaMin, coaMax })}
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

            <div className="sm:col-span-2 lg:col-span-3">
              <p className="meta mt-1 mb-2">ROSTER COMPOSITION</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Range
                  label="Roster size"
                  min={params.rosterMin}
                  max={params.rosterMax}
                  onChange={(rosterMin, rosterMax) => set({ rosterMin, rosterMax })}
                />
                <div>
                  <span className="meta mb-1.5 block">COUNT AT A POSITION</span>
                  <div className="flex gap-2">
                    <Select
                      value={params.positionGroup}
                      onChange={(value) => set({ positionGroup: value })}
                      placeholder="Any position"
                      options={POSITION_GROUPS.map((group) => ({
                        value: group,
                        label: POSITION_GROUP_LABELS[group],
                      }))}
                    />
                    <input
                      type="number"
                      value={params.positionMin || ""}
                      placeholder="Min"
                      onChange={(event) => set({ positionMin: Number(event.target.value) || 0 })}
                      className="tabular h-9 w-20 rounded border border-input bg-card px-2 text-sm"
                    />
                    <input
                      type="number"
                      value={params.positionMax || ""}
                      placeholder="Max"
                      onChange={(event) => set({ positionMax: Number(event.target.value) || 0 })}
                      className="tabular h-9 w-20 rounded border border-input bg-card px-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <span className="meta mb-1.5 block">SENIORS GRADUATING AT A POSITION</span>
                  <div className="flex gap-2">
                    <Select
                      value={params.seniorGroup}
                      onChange={(value) => set({ seniorGroup: value })}
                      placeholder="Any position"
                      options={POSITION_GROUPS.map((group) => ({
                        value: group,
                        label: POSITION_GROUP_LABELS[group],
                      }))}
                    />
                    <input
                      type="number"
                      value={params.seniorMin || ""}
                      placeholder="At least"
                      onChange={(event) => set({ seniorMin: Number(event.target.value) || 0 })}
                      className="tabular h-9 w-24 rounded border border-input bg-card px-2 text-sm"
                    />
                  </div>
                </div>
                <Range
                  label="Transfer share of roster (%)"
                  min={params.transferPctMin}
                  max={params.transferPctMax}
                  onChange={(transferPctMin, transferPctMax) =>
                    set({ transferPctMin, transferPctMax })
                  }
                />
              </div>
            </div>

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

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => set(chip.clear)}
              className="flex h-8 items-center gap-1.5 rounded-full border border-org-accent bg-org-accent-tint px-3 text-[12px] font-semibold text-org-accent-strong transition-colors hover:bg-org-accent/25"
            >
              {chip.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      {params.athleteId ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-org-accent/40 bg-org-accent/10 p-3">
          <p className="text-sm text-graphite">
            Building the shortlist for{" "}
            <span className="font-semibold">{contextAthlete?.["name"] ?? "this athlete"}</span>.
            Saves go straight to their board.
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





      <SchoolSheet
        entry={openEntry}
        athleteId={params.athleteId || null}
        onClose={() => setOpenEntry(null)}
      />
    </AppShell>
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
      className="h-9 w-full rounded border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
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
          className="tabular h-9 w-full rounded border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
        />
        <span className="text-steel">–</span>
        <input
          type="number"
          step={step ?? 1}
          value={max || ""}
          placeholder="Max"
          onChange={(event) => onChange(min, Number(event.target.value) || 0)}
          className="tabular h-9 w-full rounded border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
        />
      </div>
    </div>
  );
}
