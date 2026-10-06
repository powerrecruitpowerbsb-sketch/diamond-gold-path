import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { ChevronDown, Columns3, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useMyAccount } from "@/hooks/use-my-account";

import { AppShell } from "@/components/brand/AppShell";
import { DisclosureButton } from "@/components/brand/ActionButton";
import { EmptyState } from "@/components/brand/EmptyState";
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
import {
  INTEL_FIELDS,
  INTEL_FIELD_MAP,
  INTEL_POSITIONS,
  POSITION_LABELS,
  STRENGTH_CHOICES,
} from "@/lib/intel-fields";
import { REGIONS, allStates, regionOfState, stateName, statesInRegion } from "@/lib/regions";
import { useSportMode } from "@/hooks/use-sport-mode";
import { normalizeSport } from "@/lib/sport";
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
      { title: "Find your college fit — Curve Recruit" },
      {
        name: "description",
        content:
          "Search verified baseball and softball college programs by division, location, cost, academics, and roster construction.",
      },
      { property: "og:title", content: "Find your college fit — Curve Recruit" },
      {
        property: "og:description",
        content: "Search verified college baseball and softball programs on Curve Recruit.",
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

/** The pick-list answers our own staff records, offered as fit filters. */
const INTEL_CHOICE_FIELDS = INTEL_FIELDS.filter(
  (field) => field.group === "recruiting" && field.kind === "choice",
);

/** "style_of_play:power_slugging" → "Style of play: Power & slugging". */
function intelTokenLabel(token: string): string {
  const [field, ...rest] = token.split(":");
  const value = rest.join(":");
  const def = INTEL_FIELD_MAP[field ?? ""];
  const choice = def?.choices?.find((c) => c.value === value);
  return `${def?.label ?? field}: ${choice?.label ?? value}`;
}

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
  // Picking states is a filter in its own right; "states" is not in the defaults
  // object the keys above come from, so it has to be counted explicitly.
  if (params.states.length > 0) return true;
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
  // The header switch decides the sport; the URL follows it, so a shared link
  // still carries the sport it was searched in.
  const { sport: sportMode, setSport } = useSportMode();
  useEffect(() => {
    if (params.sport !== sportMode) {
      void navigate({ search: (prev: any) => ({ ...prev, sport: sportMode }), replace: true, resetScroll: false });
    }
  }, [sportMode, params.sport, navigate]);

  // Only athletes of this sport can take one of these programs.
  const pickerAthletes = ((picker.data?.athletes ?? []) as Record<string, any>[]).filter(
    (row) => normalizeSport(row["sport"]) === params.sport,
  );
  const { account } = useMyAccount();
  const role = account?.primaryRole ?? null;
  const isFamily = role === "player" || role === "parent";
  // A player searches for themselves — no picker, their card is the context.
  const ownAthleteId =
    isFamily && pickerAthletes.length === 1 ? String(pickerAthletes[0]?.["id"] ?? "") : "";
  useEffect(() => {
    if (ownAthleteId && params.athleteId !== ownAthleteId) {
      void navigate({ search: (prev: any) => ({ ...prev, athleteId: ownAthleteId }), replace: true, resetScroll: false });
    }
  }, [ownAthleteId, params.athleteId, navigate]);
  const contextAthlete = params.athleteId
    ? pickerAthletes.find((row) => row["id"] === params.athleteId) ?? null
    : null;

  const facets = useQuery({ queryKey: ["search-facets"], queryFn: () => facetsFn() });
  const results = useQuery({
    queryKey: ["program-search", params],
    queryFn: () => searchFn({ data: params }),
    enabled: searching,
    placeholderData: (prev) => prev,
  });


  // Filters update the URL in place — never jump the page back to the top.
  const set = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });

  // The name box types locally and updates the search after a short pause.
  const [qDraft, setQDraft] = useState(params.q);
  // Last value this box sent to the URL; only outside changes overwrite the box.
  const submittedQ = useRef(params.q);
  useEffect(() => {
    if (params.q === submittedQ.current) return;
    submittedQ.current = params.q;
    setQDraft(params.q);
  }, [params.q]);
  const submitQ = (value: string) => {
    if (value === submittedQ.current) return;
    submittedQ.current = value;
    set({ q: value });
  };
  useEffect(() => {
    const timer = setTimeout(() => submitQ(qDraft), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  const divisions = DIVISIONS_BY_BODY[params.governingBody] ?? [];
  const secondaryCount = activeSecondaryCount(params);
  // Verified vs unverified is an internal data-quality signal, kept in the
  // console. A family sees the conference we hold, and it filters normally.
  const conferences = facets.data?.conferences ?? [];


  // Location is one control: a region, or states within it.
  const regionStates = params.region ? statesInRegion(params.region) : [];
  // Every state is always listed (never waits on loading); a chosen region narrows to its states.
  const stateOptions = (regionStates.length ? regionStates : allStates())
    .slice()
    .sort((a, b) => stateName(a).localeCompare(stateName(b)));
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

  // With fit criteria on, the server already puts the fits first. Only a
  // deliberate sort choice overrides that order.
  const fitActive =
    params.intel.length > 0 || params.intelPositions.length > 0 || Boolean(params.relationship);
  // The first intelligence condition decides which row the workstation opens on.
  const focusFieldKey = params.intel[0]?.split(":")[0] ?? null;

  const served = (results.data?.results ?? []) as any[];
  const rows = (fitActive && params.sort === "name" ? [...served] : [...served]).sort((a, b) => {
    if (fitActive && params.sort === "name") {
      const fitDiff = (b.fit?.matched ?? 0) - (a.fit?.matched ?? 0);
      if (fitDiff !== 0) return fitDiff;
      return String(a.university?.name ?? "").localeCompare(String(b.university?.name ?? ""));
    }
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
  for (const token of params.intel) {
    chips.push({
      label: intelTokenLabel(token),
      clear: { intel: params.intel.filter((t) => t !== token) },
    });
  }
  if (params.intelPositions.length > 0)
    chips.push({
      label: `Prioritizing ${params.intelPositions
        .map((p) => POSITION_LABELS[p] ?? p)
        .join(", ")}`,
      clear: { intelPositions: [] },
    });
  if (params.relationship)
    chips.push({
      label: `Relationship: ${
        STRENGTH_CHOICES.find((c) => c.value === params.relationship)?.label ?? params.relationship
      }`,
      clear: { relationship: "" },
    });
  if (params.intelOnly) chips.push({ label: "Fits only", clear: { intelOnly: false } });

  return (
    <AppShell right={<AuthButton />}>
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-bold text-org-primary">Find a program</h1>
        <p className="mt-1.5 text-[15px] text-steel">
          {!searching
            ? "3,238 programs"
            : results.isPending
              ? "Searching…"
              : `${(results.data?.matches ?? rows.length).toLocaleString("en-US")} ${titleCase(
                  params.sport,
                ).toLowerCase()} teams match${
                  results.data?.capped ? ` · showing the first ${rows.length}` : ""
                }`}
        </p>

        {isFamily && contextAthlete ? (
          <p className="mt-3 text-sm text-steel">
            Saving to <span className="font-semibold text-graphite">{String(contextAthlete["name"])}</span>'s
            list
          </p>
        ) : pickerAthletes.length > 0 && !(isFamily && pickerAthletes.length === 1) ? (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="meta text-steel">Adding to</span>
            <select
              value={params.athleteId ?? ""}
              onChange={(event) => set({ athleteId: event.target.value })}
              className="h-8 rounded border border-input bg-card px-2 text-sm"
            >
              <option value="">{isFamily ? "Choose your athlete…" : "Choose a player…"}</option>
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
                : "Pick a player and Add to their Record."}
            </span>
          </label>
        ) : null}
      </header>

      {/* ---------------- Primary bar: the search most people need ------------- */}
      <div className="mt-4 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["baseball", "softball"] as const).map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => {
                  setSport(sport);
                  set({ sport });
                }}
                className={cn(
                  "h-9 rounded-sm px-4 text-sm font-semibold",
                  params.sport === sport
                    ? "bg-sport-strong text-sport-foreground"
                    : "text-steel hover:text-graphite",
                )}
              >
                {titleCase(sport)}
              </button>
            ))}
          </div>

          <label className="w-full sm:w-auto sm:min-w-[220px] sm:flex-1">
            <span className="sr-only">School name</span>
            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:border-org-primary">
              <SearchIcon className="size-4 shrink-0 text-steel" aria-hidden />
              <input
                value={qDraft}
                onChange={(event) => setQDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitQ(qDraft);
                }}
                placeholder="Search a school by name"
                className="h-full w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          <label className="w-full sm:w-[190px]">
            <span className="sr-only">Location</span>
            <select
              value=""
              aria-label="Add a region or state"
              onChange={(event) => addLocation(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
            >
              <option value="">
                {params.region || params.states.length ? "Add a state…" : "Anywhere"}
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
                    {stateName(code)} ({code})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="min-w-0 flex-1 sm:w-[150px] sm:flex-none">
            <span className="sr-only">Governing body</span>
            <select
              value={params.governingBody}
              onChange={(event) => set({ governingBody: event.target.value, division: "" })}
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
            >
              <option value="">All bodies</option>
              {GOVERNING_BODIES.map((body) => (
                <option key={body} value={body}>
                  {body}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0 flex-1 sm:w-[140px] sm:flex-none">
            <span className="sr-only">Division</span>
            <select
              value={params.division}
              onChange={(event) => set({ division: event.target.value })}
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
            >
              <option value="">{divisions.length ? "All divisions" : "All levels"}</option>
              {(divisions.length ? divisions : (facets.data?.divisions ?? [])).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <DisclosureButton
            open={moreOpen}
            count={secondaryCount}
            className="w-full justify-center sm:w-auto"
            onClick={() => {
              setMoreOpen((open) => !open);
              set({ more: !moreOpen });
            }}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            More filters
          </DisclosureButton>
        </div>

        {/* --------------- Everything else, in three plain groups --------------- */}
        {moreOpen ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <FilterGroup
              title="Cost"
              hint="Net price, tuition, cost of attendance"
              active={[params.netPriceMin, params.netPriceMax, params.tuitionInMin, params.tuitionInMax, params.tuitionMin, params.tuitionMax, params.coaMin, params.coaMax].filter(Boolean).length}
              defaultOpen
            >
              <Range
                label="Net price" lo={0} hi={80000} step={1000} format={usd}
                min={params.netPriceMin}
                max={params.netPriceMax}
                onChange={(netPriceMin, netPriceMax) => set({ netPriceMin, netPriceMax })}
              />
              <Range
                label="Tuition (in state)" lo={0} hi={70000} step={1000} format={usd}
                min={params.tuitionInMin}
                max={params.tuitionInMax}
                onChange={(tuitionInMin, tuitionInMax) => set({ tuitionInMin, tuitionInMax })}
              />
              <Range
                label="Tuition (out of state)" lo={0} hi={70000} step={1000} format={usd}
                min={params.tuitionMin}
                max={params.tuitionMax}
                onChange={(tuitionMin, tuitionMax) => set({ tuitionMin, tuitionMax })}
              />
              <Range
                label="Cost of attendance" lo={0} hi={95000} step={1000} format={usd}
                min={params.coaMin}
                max={params.coaMax}
                onChange={(coaMin, coaMax) => set({ coaMin, coaMax })}
              />
            </FilterGroup>

            <FilterGroup
              title="Academics"
              hint="Major, SAT, ACT, acceptance rate"
              active={[params.majorId, params.satMin, params.satMax, params.actMin, params.actMax, params.acceptanceMin, params.acceptanceMax, params.academicBucket].filter(Boolean).length}
            >
              <Field label="Major offered">
                <MajorPicker
                  value={params.majorId}
                  onChange={(value) => set({ majorId: value })}
                  majors={facets.data?.majors ?? []}
                />
              </Field>
              <Range
                label="SAT" lo={400} hi={1600} step={10}
                min={params.satMin}
                max={params.satMax}
                onChange={(satMin, satMax) => set({ satMin, satMax })}
              />
              <Range
                label="ACT" lo={1} hi={36} step={1}
                min={params.actMin}
                max={params.actMax}
                onChange={(actMin, actMax) => set({ actMin, actMax })}
              />
              <Range
                label="Acceptance rate" lo={0} hi={100} step={1} format={pct}
                min={params.acceptanceMin}
                max={params.acceptanceMax}
                onChange={(acceptanceMin, acceptanceMax) => set({ acceptanceMin, acceptanceMax })}
              />
              <Field label="Academic classification">
                <Select
                  value={params.academicBucket}
                  onChange={(value) => set({ academicBucket: value })}
                  placeholder="Any"
                  options={ACADEMIC_BUCKETS.map((b) => ({ value: b, label: b }))}
                />
              </Field>
            </FilterGroup>

            <FilterGroup
              title="Roster"
              hint="Size, openings by position, transfers, conference"
              active={[params.rosterMin, params.rosterMax, params.positionGroup, params.seniorGroup, params.transferPctMin, params.transferPctMax, params.conference, params.scholarships].filter(Boolean).length}
            >
              <Range
                label="Roster size" lo={0} hi={80} step={1}
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
                  <select
                    value={params.positionMin || ""}
                    onChange={(event) => set({ positionMin: Number(event.target.value) || 0 })}
                    className="h-9 w-28 shrink-0 rounded border border-input bg-card px-2 text-sm"
                  >
                    <option value="">Min</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Min {n}
                      </option>
                    ))}
                  </select>
                  <select
                    value={params.positionMax || ""}
                    onChange={(event) => set({ positionMax: Number(event.target.value) || 0 })}
                    className="h-9 w-28 shrink-0 rounded border border-input bg-card px-2 text-sm"
                  >
                    <option value="">Max</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Max {n}
                      </option>
                    ))}
                  </select>
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
                  <select
                    value={params.seniorMin || ""}
                    onChange={(event) => set({ seniorMin: Number(event.target.value) || 0 })}
                    className="h-9 w-28 shrink-0 rounded border border-input bg-card px-2 text-sm"
                  >
                    <option value="">At least</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        At least {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Range
                label="Transfers on roster" lo={0} hi={100} step={1} format={pct}
                min={params.transferPctMin}
                max={params.transferPctMax}
                onChange={(transferPctMin, transferPctMax) =>
                  set({ transferPctMin, transferPctMax })
                }
              />
              <Field label="Conference">
                <Select
                  value={params.conference}
                  onChange={(value) => set({ conference: value })}
                  placeholder="All conferences"
                  options={conferences.map((c) => ({ value: c.name, label: c.name }))}
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
            </FilterGroup>

            <FilterGroup
              title="Campus"
              hint="Public or private, size, setting, religious"
              active={[params.publicPrivate, params.schoolSize, params.campusSetting, params.religious].filter(Boolean).length}
            >
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
            </FilterGroup>

            {isFamily ? null : (
            <FilterGroup
              title="Intelligence"
              hint="Your staff's notes on each program"
              active={params.intel.length + params.intelPositions.length + (params.relationship ? 1 : 0)}
            >
              {INTEL_CHOICE_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <Select
                    value=""
                    onChange={(value) => {
                      const token = `${field.key}:${value}`;
                      if (!value || params.intel.includes(token)) return;
                      set({ intel: [...params.intel, token] });
                    }}
                    placeholder={
                      params.intel.some((t) => t.startsWith(`${field.key}:`))
                        ? "Add another…"
                        : "Any"
                    }
                    options={(field.choices ?? []).map((choice) => ({
                      value: choice.value,
                      label: choice.label,
                    }))}
                  />
                </Field>
              ))}
              <Field label="Staff relationship">
                <Select
                  value={params.relationship}
                  onChange={(value) => set({ relationship: value })}
                  placeholder="Any"
                  options={STRENGTH_CHOICES}
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="meta mb-1.5 block">PRIORITIZING A POSITION</span>
                <div className="flex flex-wrap gap-1.5">
                  {INTEL_POSITIONS.map((position) => {
                    const on = params.intelPositions.includes(position);
                    return (
                      <button
                        key={position}
                        type="button"
                        onClick={() =>
                          set({
                            intelPositions: on
                              ? params.intelPositions.filter((p) => p !== position)
                              : [...params.intelPositions, position],
                          })
                        }
                        className={cn(
                          "h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors",
                          on
                            ? "border-org-accent bg-org-accent-tint text-org-accent-strong"
                            : "border-border text-steel hover:bg-muted",
                        )}
                      >
                        {POSITION_LABELS[position] ?? position}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-sm text-graphite">
                  <input
                    type="checkbox"
                    checked={params.intelOnly}
                    onChange={(event) => set({ intelOnly: event.target.checked })}
                  />
                  Only show programs that fit — otherwise fits rise to the top and the rest stay
                  below.
                </label>
              </div>
            </FilterGroup>
            )}

            <Link
              to="/search"
              search={{ sport: params.sport, more: true } as any}
              className="inline-block text-sm font-semibold text-seam-red underline decoration-dotted underline-offset-4"
            >
              Clear all filters
            </Link>
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

      {params.athleteId && !isFamily ? (
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

      {results.data?.unpublishedPositions ? (
        <p className="mt-3 rounded border border-border bg-muted/50 p-2.5 text-sm text-steel">
          {results.data.unpublishedPositions} team
          {results.data.unpublishedPositions === 1 ? "" : "s"} hidden
          · no positions published
        </p>
      ) : null}

      {fitActive && results.data?.intel ? (
        <p className="mt-3 rounded border border-seam-red/40 bg-seam-red-tint p-2.5 text-sm text-graphite">
          {results.data.intel.withIntel === 0
            ? "None of these programs has a write-up from your staff yet, so nothing can be matched. Add intelligence on a program and it will rise to the top here."
            : `${results.data.intel.fittingAll} of these programs meet every one of your ${results.data.intel.criteria} intelligence condition${
                results.data.intel.criteria === 1 ? "" : "s"
              } · ${results.data.intel.withIntel} written up so far${
                params.intelOnly ? "" : " · the rest stay listed below"
              }.`}
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
        <>
          {/* Sorting is a single control, not eleven column buttons. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="meta text-steel">Sort by</span>
            <select
              value={sortKey}
              onChange={(event) => set({ sort: event.target.value })}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-org-primary"
            >
              {SORTABLE.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.header}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => set({ dir: dir === "asc" ? "desc" : "asc" })}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm font-semibold text-org-primary hover:bg-muted"
            >
              {dir === "asc" ? "Low to high ↑" : "High to low ↓"}
            </button>
          </div>

          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {rows.map((row: any) => {
              const u = row.university ?? {};
              const selected = compare.isSelected(row.id);
              const region = regionOfState(u.state);
              const meta = [
                u.state,
                region,
                [row.governing_body, row.division].filter(Boolean).join(" ") || null,
                row.conference || null,
              ].filter(Boolean) as string[];
              const openRow = () =>
                setOpenEntry({
                  id: null,
                  programId: row.id,
                  school: String(u.name ?? "Program"),
                  sport: row.sport ?? null,
                  notes: null,
                  threadId: null,
                  athleteId: params.athleteId || null,
                });
              return (
                <li key={row.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={openRow}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRow();
                      }
                    }}
                    className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-org-primary/60"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-display grid size-11 shrink-0 place-items-center rounded-lg bg-org-primary/15 text-sm font-bold text-org-primary">
                        {String(u.name ?? "")
                          .replace(/University|College|of|the|at/gi, "")
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((w: string) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "C"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-bold text-graphite group-hover:text-org-primary">
                          {u.name}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-steel">
                          {[u.city, u.state].filter(Boolean).join(", ") || NOT_REPORTED}
                          {region ? ` · ${region}` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {[row.governing_body, row.division].filter(Boolean).length ? (
                            <span className="rounded-md bg-org-primary px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-org-primary-foreground uppercase">
                              {[row.governing_body, row.division].filter(Boolean).join(" ")}
                            </span>
                          ) : null}
                          {row.conference ? (
                            <span className="max-w-[200px] truncate rounded-md border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-steel uppercase">
                              {row.conference}
                            </span>
                          ) : null}
                          {fitActive ? (
                            <Link
                              to="/intelligence"
                              search={{
                                programId: row.id,
                                ...(focusFieldKey ? { field: focusFieldKey } : {}),
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className={
                                row.fit?.matched > 0
                                  ? "rounded-md border border-seam-red/50 bg-seam-red-tint px-2 py-0.5 text-[11px] font-semibold text-seam-red"
                                  : "rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-steel"
                              }
                            >
                              {row.fit?.matched > 0
                                ? `Fits ${row.fit.matched} of ${row.fit.total}`
                                : row.fit?.evaluated
                                  ? "No match on file"
                                  : "Not written up yet"}
                            </Link>
                          ) : null}
                          {!fitActive && row.onFile ? (
                            <span className="rounded-md border border-seam-red/50 bg-seam-red-tint px-2 py-0.5 text-[11px] font-semibold text-seam-red">
                              {row.onFile.strength
                                ? `${String(row.onFile.strength).replace(/^\w/, (c: string) => c.toUpperCase())} relationship`
                                : row.onFile.placed
                                  ? "Placed players here"
                                  : "Intel on file"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <dl className="tabular mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3">
                      {[
                        ["Net price", money(u.est_net_price)],
                        ["Roster", row.roster?.size ? String(row.roster.size) : "—"],
                        ["Students", number(u.undergrad_enrollment)],
                        ["SAT", plain(u.avg_sat)],
                      ].map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="meta truncate text-steel">{k}</dt>
                          <dd className="truncate text-sm font-bold text-graphite">
                            {!v || v === NOT_REPORTED ? "—" : v}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs text-steel">
                        Coach{" "}
                        <span className="text-graphite">{row.head_coach_name ?? "not published"}</span>
                      </p>
                    <div
                      className="flex shrink-0 items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ShortlistSaveButton
                        programId={row.id}
                        athleteId={params.athleteId || undefined}
                        athleteName={
                          role === "player"
                            ? "me"
                            : ((contextAthlete?.["name"] as string | undefined) ?? undefined)
                        }
                      />
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={selected ? "Selected for compare" : "Add to compare"}
                        title={selected ? "Selected for compare" : "Add to compare"}
                        disabled={!selected && compare.isFull}
                        onClick={() =>
                          compare.toggle({
                            id: row.id,
                            name: u.name ?? "Program",
                            badge: [row.governing_body, row.division].filter(Boolean).join(" "),
                          })
                        }
                        className={cn(
                          "flex size-10 items-center justify-center rounded-md border transition-colors",
                          selected
                            ? "border-org-primary bg-org-primary text-org-primary-foreground"
                            : "border-border text-org-primary hover:bg-muted",
                          !selected && compare.isFull && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Columns3 className="size-4" aria-hidden />
                      </button>
                    </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}






      <SchoolSheet
        entry={openEntry}
        athleteId={params.athleteId || null}
        onClose={() => setOpenEntry(null)}
      />
    </AppShell>
  );
}

function FilterGroup({
  title,
  hint,
  active = 0,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  active?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || active > 0);
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold text-graphite">{title}</span>
            {active > 0 ? (
              <span className="tabular rounded-full bg-org-primary px-1.5 text-[11px] font-bold text-org-primary-foreground">
                {active}
              </span>
            ) : null}
          </span>
          {hint ? <span className="block truncate text-xs text-steel">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-steel transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid gap-x-6 gap-y-4 border-t border-border px-3.5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

const usd = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
const pct = (n: number) => `${n}%`;

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
  lo,
  hi,
  step = 1,
  format = (n: number) => n.toLocaleString("en-US"),
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  lo: number;
  hi: number;
  step?: number;
  format?: (n: number) => string;
  onChange: (min: number, max: number) => void;
}) {
  // 0 in the URL means "no limit", which the slider shows as its end stop.
  const committed: [number, number] = [min || lo, max || hi];
  const [draft, setDraft] = useState<[number, number]>(committed);
  useEffect(() => setDraft([min || lo, max || hi]), [min, max, lo, hi]);
  const any = draft[0] <= lo && draft[1] >= hi;
  const text = any
    ? "Any"
    : draft[0] <= lo
      ? `Up to ${format(draft[1])}`
      : draft[1] >= hi
        ? `${format(draft[0])}+`
        : `${format(draft[0])} – ${format(draft[1])}`;
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="meta">{label.toUpperCase()}</span>
        <span className={cn("tabular text-sm font-semibold", any ? "text-steel" : "text-org-primary")}>{text}</span>
      </div>
      <SliderPrimitive.Root
        min={lo}
        max={hi}
        step={step}
        value={draft}
        minStepsBetweenThumbs={1}
        onValueChange={(v) => setDraft([v[0] ?? lo, v[1] ?? hi])}
        onValueCommit={(v) => {
          const a = v[0] ?? lo;
          const b = v[1] ?? hi;
          onChange(a <= lo ? 0 : a, b >= hi ? 0 : b);
        }}
        className="relative flex h-6 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-org-primary" />
        </SliderPrimitive.Track>
        {[0, 1].map((i) => (
          <SliderPrimitive.Thumb
            key={i}
            aria-label={`${label} ${i === 0 ? "minimum" : "maximum"}`}
            className="block size-5 rounded-full border-2 border-org-primary bg-card shadow focus-visible:ring-2 focus-visible:ring-org-primary/40 focus-visible:outline-none"
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}

function MajorPicker({
  value,
  onChange,
  majors,
}: {
  value: string;
  onChange: (value: string) => void;
  majors: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = majors.find((m) => m.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-base md:text-sm"
        >
          <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
            {selected?.name ?? "Any major"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type a major — Business, Nursing…" />
          <CommandList>
            <CommandEmpty>No major matches that.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__any" onSelect={() => { onChange(""); setOpen(false); }}>
                  Any major
                </CommandItem>
              )}
              {majors.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => { onChange(m.id); setOpen(false); }}
                >
                  <Check className={m.id === value ? "mr-2 h-4 w-4" : "mr-2 h-4 w-4 opacity-0"} />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
