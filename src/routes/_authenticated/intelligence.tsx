import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { actionClass } from "@/components/brand/ActionButton";
import { AuthButton } from "@/components/brand/AuthButton";
import { PageHeader } from "@/components/console/PageHeader";
import { useMyAccount } from "@/hooks/use-my-account";
import {
  INTEL_FIELDS,
  INTEL_FIELD_COUNT,
  INTEL_POSITIONS,
  POSITION_LABELS,
  STATUS_LABELS,
  STRENGTH_CHOICES,
  fieldLabel,
  type IntelFieldDef,
} from "@/lib/intel-fields";
import {
  getIntelProgram,
  listApprovalQueue,
  listIntelPrograms,
  listMySubmissions,
  logInteraction,
  reviewIntel,
  saveIntelField,
  saveRelationship,
  setIntelVisibility,
} from "@/lib/intel-workstation.functions";
import { DIVISIONS_BY_BODY } from "@/lib/search-schema";
import { REGIONS } from "@/lib/regions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/intelligence")({
  validateSearch: (search: Record<string, unknown>): { programId?: string } =>
    typeof search['programId'] === "string" && search['programId']
      ? { programId: search['programId'] }
      : {},
  head: () => ({
    meta: [
      { title: "Intelligence workstation — Power Recruit" },
      {
        name: "description",
        content:
          "Write and review your organization's recruiting intelligence on college baseball and softball programs, program by program.",
      },
      { property: "og:title", content: "Intelligence workstation — Power Recruit" },
      {
        property: "og:description",
        content: "Work a list of programs and write up recruiting intelligence in one sitting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workstation,
});

const input =
  "h-8 w-full rounded border border-border bg-card px-2 text-sm text-graphite focus:outline-none focus:ring-1 focus:ring-org-primary";
const label = "mb-1 block text-[13px] font-medium text-steel";
const button = actionClass("primary", "sm");
const ghost = actionClass("secondary", "sm");
const sectionHeading =
  "relative border-b border-border pb-1.5 font-display text-base font-bold text-org-primary after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-10 after:bg-org-accent";

type Tab = "programs" | "mine" | "queue";

function Workstation() {
  const { programId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { account, isPending: accountPending } = useMyAccount();
  const role = account?.primaryRole ?? null;
  const allowed =
    role === "org_owner" ||
    role === "org_admin" ||
    role === "org_staff" ||
    role === "superadmin";

  const [tab, setTab] = useState<Tab>("programs");
  const [filters, setFilters] = useState({
    sport: "baseball",
    q: "",
    region: "",
    governingBody: "",
    division: "",
    conference: "",
    coverage: "any" as "any" | "has" | "none",
    strength: "",
    author: "any" as "any" | "mine",
    status: "",
    staleBefore: "",
  });

  const listFn = useServerFn(listIntelPrograms);
  const list = useQuery({
    queryKey: ["intel-list", filters],
    queryFn: () => listFn({ data: filters }),
    enabled: allowed,
    retry: false,
  });

  if (accountPending) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="h-24 animate-pulse rounded bg-muted" />
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="rounded border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-graphite">Staff only</h1>
          <p className="mt-2 text-sm text-steel">
            The intelligence workstation is for organization staff. Program intelligence you can see
            is shown on each program page.
          </p>
          <Link to="/search" className={cn(ghost, "mt-4")}>
            Back to search
          </Link>
        </div>
      </AppShell>
    );
  }

  const rows = list.data?.rows ?? [];
  const viewer = list.data?.viewer ?? null;
  const canApprove = viewer?.canApprove ?? false;
  const selected = programId ?? rows[0]?.id ?? null;

  const select = (id: string) => navigate({ search: { programId: id } });
  const index = rows.findIndex((r) => r.id === selected);
  const next = index >= 0 && index + 1 < rows.length ? rows[index + 1] : null;

  return (
    <AppShell right={<AuthButton />}>
      <PageHeader
        title="Intelligence workstation"
        description="Pick a program, write it up, move to the next."
        counts={[
          `${rows.length} in view`,
          `${rows.filter((r) => r.filled > 0).length} written up`,
          `${rows.filter((r) => r.statuses.includes("pending")).length} awaiting review`,
        ]}
      />

      <div className="mt-4 inline-flex rounded-lg border border-border bg-card p-1">
        {(
          [
            ["programs", "Workstation"],
            ["mine", "My submissions"],
            ...(canApprove ? ([["queue", "Approval queue"]] as [Tab, string][]) : []),
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "touch-target rounded-md px-4 text-sm font-semibold",
              tab === key
                ? "bg-org-primary text-org-primary-foreground"
                : "text-steel hover:text-graphite",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "mine" ? <MySubmissions /> : null}
      {tab === "queue" ? <ApprovalQueue /> : null}

      {tab === "programs" ? (
        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ProgramSwitcher
            filters={filters}
            setFilters={setFilters}
            rows={rows}
            loading={list.isPending}
            selected={selected}
            onSelect={select}
          />

          <div>
            {selected ? (
              <EditPanel
                programId={selected}
                canApprove={canApprove}
                canRate={viewer?.canRate ?? false}
                onNext={next ? () => select(next.id) : null}
                nextLabel={next?.school ?? null}
              />
            ) : (
              <div className="rounded-lg border border-border bg-card p-10 text-center">
                <h2 className="font-display text-xl font-bold text-graphite">
                  Nothing open yet
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-steel">
                  Type a school name on the left, or pick one of the queues, to start writing.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Left rail: find a program fast, no wall of filters                   */
/* ------------------------------------------------------------------ */

const QUEUES: { key: string; text: string; patch: Record<string, unknown> }[] = [
  { key: "all", text: "All", patch: { coverage: "any", status: "", author: "any" } },
  { key: "review", text: "Needs review", patch: { coverage: "any", status: "pending", author: "any" } },
  { key: "mine", text: "Mine", patch: { coverage: "any", status: "", author: "mine" } },
  { key: "written", text: "Written up", patch: { coverage: "has", status: "", author: "any" } },
  { key: "empty", text: "Nothing yet", patch: { coverage: "none", status: "", author: "any" } },
];

function activeQueue(filters: any) {
  if (filters.status === "pending") return "review";
  if (filters.author === "mine") return "mine";
  if (filters.coverage === "has") return "written";
  if (filters.coverage === "none") return "empty";
  return "all";
}

function ProgramSwitcher({
  filters,
  setFilters,
  rows,
  loading,
  selected,
  onSelect,
}: {
  filters: any;
  setFilters: (next: any) => void;
  rows: any[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Record<string, unknown>) => setFilters({ ...filters, ...patch });
  const divisions = DIVISIONS_BY_BODY[filters.governingBody] ?? [];
  const queue = activeQueue(filters);
  const shown = rows.slice(0, 40);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="inline-flex w-full rounded-md border border-border p-0.5">
          {(["baseball", "softball"] as const).map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => set({ sport })}
              className={cn(
                "h-8 flex-1 rounded-sm text-sm font-semibold",
                filters.sport === sport
                  ? "bg-org-primary text-org-primary-foreground"
                  : "text-steel hover:text-graphite",
              )}
            >
              {sport === "baseball" ? "Baseball" : "Softball"}
            </button>
          ))}
        </div>

        <input
          className={cn(input, "mt-2 h-9")}
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Jump to a school…"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUEUES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={queue === item.key}
              onClick={() => set(item.patch)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] font-semibold",
                queue === item.key
                  ? "border-org-accent bg-org-accent-tint text-org-accent-strong"
                  : "border-border text-steel hover:text-graphite",
              )}
            >
              {item.text}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          className="mt-2 text-[12px] font-semibold text-org-primary underline decoration-dotted underline-offset-4"
        >
          {advanced ? "Hide narrowing" : "Narrow by level, place or date"}
        </button>

        {advanced ? (
          <div className="mt-2 grid gap-2">
            <div>
              <span className={label}>Location</span>
              <select
                className={input}
                value={filters.region}
                onChange={(e) => set({ region: e.target.value })}
              >
                <option value="">Anywhere</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={label}>Body</span>
                <select
                  className={input}
                  value={filters.governingBody}
                  onChange={(e) => set({ governingBody: e.target.value, division: "" })}
                >
                  <option value="">Any</option>
                  {["NCAA", "NAIA", "NJCAA", "CCCAA", "NWAC"].map((body) => (
                    <option key={body} value={body}>
                      {body}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className={label}>Division</span>
                <select
                  className={input}
                  value={filters.division}
                  onChange={(e) => set({ division: e.target.value })}
                  disabled={!divisions.length}
                >
                  <option value="">Any</option>
                  {divisions.map((division) => (
                    <option key={division} value={division}>
                      {division}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <span className={label}>Conference</span>
              <input
                className={input}
                value={filters.conference}
                onChange={(e) => set({ conference: e.target.value })}
                placeholder="Exact conference name"
              />
            </div>
            <div>
              <span className={label}>Relationship strength</span>
              <select
                className={input}
                value={filters.strength}
                onChange={(e) => set({ strength: e.target.value })}
              >
                <option value="">Any</option>
                {STRENGTH_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Not updated since</span>
              <input
                type="date"
                className={input}
                value={filters.staleBefore}
                onChange={(e) => set({ staleBefore: e.target.value })}
              />
            </div>
          </div>
        ) : null}
      </div>

      <ul className="max-h-[520px] overflow-y-auto">
        {loading ? (
          <li className="p-3 text-sm text-steel">Loading…</li>
        ) : shown.length === 0 ? (
          <li className="p-3 text-sm text-steel">Nothing here. Try another queue or name.</li>
        ) : (
          shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left hover:bg-muted/60",
                  row.id === selected && "bg-org-primary-tint",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-graphite">
                    {row.school}
                  </span>
                  <span className="meta block truncate">
                    {[row.governingBody, row.division].filter(Boolean).join(" ") || "Level unknown"}
                    {row.state ? ` · ${row.state}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {row.statuses.includes("pending") ? (
                    <span className="size-2 rounded-full bg-org-accent" title="Awaiting review" />
                  ) : null}
                  <span className="tabular text-[11px] font-semibold text-steel">
                    {row.filled}/{INTEL_FIELD_COUNT}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
        {!loading && rows.length > shown.length ? (
          <li className="p-3 text-xs text-steel">
            Showing the first {shown.length} of {rows.length}. Type a name to go straight to one.
          </li>
        ) : null}
      </ul>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* The editing panel                                                    */
/* ------------------------------------------------------------------ */

function EditPanel({
  programId,
  canApprove,
  canRate,
  onNext,
  nextLabel,
}: {
  programId: string;
  canApprove: boolean;
  canRate: boolean;
  onNext: (() => void) | null;
  nextLabel: string | null;
}) {
  const queryClient = useQueryClient();
  const detailFn = useServerFn(getIntelProgram);
  const detail = useQuery({
    queryKey: ["intel-program", programId],
    queryFn: () => detailFn({ data: { programId } }),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["intel-program", programId] });
    queryClient.invalidateQueries({ queryKey: ["intel-list"] });
    queryClient.invalidateQueries({ queryKey: ["intel-queue"] });
    queryClient.invalidateQueries({ queryKey: ["intel-mine"] });
  };

  const recordByField = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of (detail.data?.records ?? []) as any[]) map.set(row.field_type as string, row);
    return map;
  }, [detail.data]);

  if (detail.isPending) {
    return <div className="h-64 animate-pulse rounded bg-muted" />;
  }
  if (detail.isError || !detail.data?.program) {
    return <p className="py-6 text-sm text-steel">That program could not be loaded.</p>;
  }

  const program = detail.data.program as any;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-org-primary-tint px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-org-primary">
            {program.universities?.name}
          </h2>
          <p className="mt-0.5 text-sm text-steel">
            {program.sport === "baseball" ? "Baseball" : "Softball"} ·{" "}
            {[program.governing_body, program.division].filter(Boolean).join(" ") ||
              "Level not confirmed"}
            {program.conference ? ` · ${program.conference}` : ""}
            {program.universities?.state ? ` · ${program.universities.state}` : ""}
          </p>
          {program.head_coach_name ? (
            <p className="text-sm text-steel">Head coach: {program.head_coach_name}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link to="/programs/$id" params={{ id: programId }} className={ghost}>
            View profile
          </Link>
          {onNext ? (
            <button type="button" onClick={onNext} className={button}>
              Next: {nextLabel}
            </button>
          ) : null}
        </div>
      </div>

      <WorkPanels
        programId={programId}
        canApprove={canApprove}
        canRate={canRate}
        detail={detail.data}
        recordByField={recordByField}
        refresh={refresh}
      />
    </div>
  );
}

/* Four panels instead of one endless form. */
function WorkPanels({
  programId,
  canApprove,
  canRate,
  detail,
  recordByField,
  refresh,
}: {
  programId: string;
  canApprove: boolean;
  canRate: boolean;
  detail: any;
  recordByField: Map<string, any>;
  refresh: () => void;
}) {
  const panels: { key: string; text: string; fields?: IntelFieldDef[] }[] = [
    { key: "relationship", text: "Relationship" },
    {
      key: "recruiting",
      text: "Recruiting",
      fields: INTEL_FIELDS.filter((f) => f.group === "recruiting"),
    },
    { key: "notes", text: "Notes", fields: INTEL_FIELDS.filter((f) => f.group === "notes") },
  ];
  const [panel, setPanel] = useState("relationship");
  const current = panels.find((p) => p.key === panel) ?? panels[0]!;
  const pendingCount = (detail.records ?? []).filter((r: any) => r.status === "pending").length;

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {panels.map((item) => {
          const done = item.fields
            ? item.fields.filter((f) => recordByField.get(f.key)).length
            : null;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={panel === item.key}
              onClick={() => setPanel(item.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
                panel === item.key
                  ? "border-org-accent text-org-primary"
                  : "border-transparent text-steel hover:text-graphite",
              )}
            >
              {item.text}
              {done !== null ? (
                <span className="tabular ml-1.5 text-[11px] text-steel">
                  {done}/{item.fields!.length}
                </span>
              ) : null}
            </button>
          );
        })}
        {pendingCount ? (
          <span className="ml-auto self-center text-[12px] font-semibold text-org-accent-strong">
            {pendingCount} awaiting review
          </span>
        ) : null}
      </div>

      {panel === "relationship" ? (
        <RelationshipBlock
          programId={programId}
          canRate={canRate}
          relationship={detail.relationship as any}
          interactions={detail.interactions as any[]}
          people={detail.people as Record<string, string>}
          onSaved={refresh}
        />
      ) : (
        <div className="mt-2 divide-y divide-border">
          {(current.fields ?? []).map((field) => (
            <FieldRow
              key={field.key}
              programId={programId}
              field={field}
              record={recordByField.get(field.key) ?? null}
              canApprove={canApprove}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function FieldRow({
  programId,
  field,
  record,
  canApprove,
  onSaved,
}: {
  programId: string;
  field: IntelFieldDef;
  record: any | null;
  canApprove: boolean;
  onSaved: () => void;
}) {
  const [content, setContent] = useState<string>(record?.content ?? "");
  const [choices, setChoices] = useState<string[]>(structuredValues(record?.structured_value));
  const [positions, setPositions] = useState<string[]>(record?.positions ?? []);
  const [gradPositions, setGradPositions] = useState<string[]>(
    record?.structured_detail?.positions ?? [],
  );
  const [gradYear, setGradYear] = useState<string>(record?.structured_detail?.year ?? "");
  const [noteOpen, setNoteOpen] = useState<boolean>(
    field.kind === "text" || Boolean(record?.content),
  );

  const saveFn = useServerFn(saveIntelField);
  const shareFn = useServerFn(setIntelVisibility);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          programId,
          fieldKey: field.key,
          content,
          structuredValue: field.kind === "choice" ? choices.join(",") || null : null,
          positions: field.kind === "positions" ? positions : [],
          structuredDetail:
            field.kind === "grad_needs" && (gradPositions.length || gradYear)
              ? { positions: gradPositions, year: gradYear }
              : null,
        },
      }),
    onSuccess: (result: any) => {
      toast.success(result?.status === "pending" ? "Sent for review" : "Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const share = useMutation({
    mutationFn: (visibility: string) => shareFn({ data: { id: record.id, visibility } }),
    onSuccess: () => {
      toast.success("Visibility updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePosition = (
    value: string,
    current: string[],
    setter: (next: string[]) => void,
  ) => setter(current.includes(value) ? current.filter((p) => p !== value) : [...current, value]);

  const toggleChoice = (value: string) =>
    setChoices((current) =>
      field.multi
        ? current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        : current.includes(value)
          ? []
          : [value],
    );

  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
      on
        ? "border-org-accent bg-org-accent text-org-accent-foreground"
        : "border-border bg-card text-steel hover:border-org-primary hover:text-graphite",
    );

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-graphite">
          {field.label}
          {field.multi ? (
            <span className="ml-1.5 text-[11px] font-medium text-steel">pick any that apply</span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          {record ? (
            <span className="meta">{STATUS_LABELS[record.status] ?? record.status}</span>
          ) : null}
          {record ? (
            <span className="meta">
              {record.visibility === "shared_with_families" ? "Families can see this" : "Staff only"}
            </span>
          ) : null}
          {record && field.audience === "org" ? (
            <button
              type="button"
              onClick={() =>
                share.mutate(
                  record.visibility === "shared_with_families" ? "org_only" : "shared_with_families",
                )
              }
              className="text-[11px] font-semibold text-org-primary underline decoration-dotted underline-offset-2"
            >
              {record.visibility === "shared_with_families" ? "Make staff only" : "Share with families"}
            </button>
          ) : null}
        </span>
      </div>
      {record?.review_note ? (
        <p className="mt-1 text-xs text-seam-red">Reviewer: {record.review_note}</p>
      ) : null}

      {field.kind === "choice" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(field.choices ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={choices.includes(option.value)}
              onClick={() => toggleChoice(option.value)}
              className={chip(choices.includes(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {field.kind === "positions" || field.kind === "grad_needs" ? (
        <>
          {field.kind === "positions" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {POSITION_GROUP_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPositions(preset.positions)}
                  className="rounded-full border border-dashed border-org-primary/50 px-2.5 py-1 text-[11px] font-semibold text-org-primary hover:bg-org-primary-tint"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1">
            {INTEL_POSITIONS.map((value) => {
              const current = field.kind === "positions" ? positions : gradPositions;
              const setter = field.kind === "positions" ? setPositions : setGradPositions;
              const on = current.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => togglePosition(value, current, setter)}
                  className={cn(
                    "rounded border border-border px-2 py-0.5 text-[11px] font-semibold",
                    on ? "border-org-primary bg-org-primary text-org-primary-foreground" : "bg-card text-steel",
                  )}
                >
                  {POSITION_LABELS[value] ?? value}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {field.kind === "grad_needs" ? (
        <input
          className={cn(input, "mt-2")}
          value={gradYear}
          onChange={(e) => setGradYear(e.target.value)}
          placeholder="Year, e.g. 2027"
        />
      ) : null}

      {/* Notes stay tucked away so the list reads as a short pick-list. */}
      {field.kind === "text" ? null : noteOpen ? (
        <button
          type="button"
          onClick={() => setNoteOpen(false)}
          className="mt-2 text-[11px] font-semibold text-org-primary underline decoration-dotted underline-offset-2"
        >
          Hide note
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className={cn(
            "mt-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            content.trim()
              ? "border-org-primary bg-org-primary-tint text-org-primary"
              : "border-dashed border-border text-steel hover:border-org-primary hover:text-org-primary",
          )}
        >
          {content.trim() ? `Note: ${content.trim().slice(0, 60)}${content.trim().length > 60 ? "…" : ""}` : "+ Add note"}
        </button>
      )}

      {noteOpen ? (
        <textarea
          className="mt-2 min-h-[64px] w-full rounded border border-border bg-card p-2 text-sm text-graphite focus:outline-none focus:ring-1 focus:ring-org-primary"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={field.help ?? "What did you see?"}
        />
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className={button}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {canApprove ? "Save" : "Send for review"}
        </button>
        {record?.editor_user_id ? <span className="meta">Edited after submission</span> : null}
      </div>
    </div>
  );
}

function RelationshipBlock({
  programId,
  canRate,
  relationship,
  interactions,
  people,
  onSaved,
}: {
  programId: string;
  canRate: boolean;
  relationship: any | null;
  interactions: any[];
  people: Record<string, string>;
  onSaved: () => void;
}) {
  const [strength, setStrength] = useState<string>(relationship?.strength_label ?? "");
  const [placed, setPlaced] = useState<string>(
    relationship?.placed_players_before === null || relationship?.placed_players_before === undefined
      ? ""
      : relationship.placed_players_before
        ? "yes"
        : "no",
  );
  const [contact, setContact] = useState<string>(relationship?.primary_college_contact ?? "");
  const [stability, setStability] = useState<string>(relationship?.program_stability_note ?? "");
  const [note, setNote] = useState("");
  const [event, setEvent] = useState("");

  const saveFn = useServerFn(saveRelationship);
  const logFn = useServerFn(logInteraction);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          programId,
          strengthLabel: canRate ? strength || null : null,
          placedPlayersBefore: placed === "" ? null : placed === "yes",
          primaryCollegeContact: contact || null,
          programStabilityNote: stability || null,
        },
      }),
    onSuccess: () => {
      toast.success("Relationship saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const log = useMutation({
    mutationFn: () => logFn({ data: { programId, notes: note, eventContext: event || null } }),
    onSuccess: () => {
      toast.success("Interaction logged");
      setNote("");
      setEvent("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mt-4">
      <h3 className={sectionHeading}>
        Relationship
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Strength {canRate ? "" : "(admins set this)"}</span>
          <select
            className={input}
            value={strength}
            disabled={!canRate}
            onChange={(e) => setStrength(e.target.value)}
          >
            <option value="">Not rated</option>
            {STRENGTH_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Placed players here before</span>
          <select className={input} value={placed} onChange={(e) => setPlaced(e.target.value)}>
            <option value="">Not recorded</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <span className={label}>Primary college contact (staff only)</span>
          <input className={input} value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div>
          <span className={label}>Program stability note (staff only)</span>
          <input className={input} value={stability} onChange={(e) => setStability(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        className={cn(button, "mt-2")}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        Save relationship
      </button>

      <div className="mt-4">
        <span className={label}>Log an interaction (staff only)</span>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
          <textarea
            className="min-h-[52px] w-full rounded border border-border bg-card p-2 text-sm text-graphite"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was said, and by whom"
          />
          <input
            className={input}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            placeholder="Where, e.g. PG showcase"
          />
        </div>
        <button
          type="button"
          className={cn(button, "mt-2")}
          disabled={log.isPending || !note.trim()}
          onClick={() => log.mutate()}
        >
          Log interaction
        </button>
        {interactions.length ? (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {interactions.map((row) => (
              <li key={row.id} className="py-2 text-sm text-graphite">
                <span className="meta">
                  {new Date(row.interaction_date).toLocaleDateString()}
                  {row.event_context ? ` · ${row.event_context}` : ""}
                  {people[row.staff_id] ? ` · ${people[row.staff_id]}` : ""}
                </span>
                <p className="mt-0.5">{row.notes}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-steel">Nothing logged yet. The first note goes here.</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* My submissions and the approval queue                                */
/* ------------------------------------------------------------------ */

function MySubmissions() {
  const fn = useServerFn(listMySubmissions);
  const query = useQuery({ queryKey: ["intel-mine"], queryFn: () => fn(), retry: false });
  const rows = (query.data ?? []) as any[];

  if (query.isPending) return <div className="mt-4 h-32 animate-pulse rounded bg-muted" />;
  if (!rows.length)
    return <p className="mt-4 py-6 text-sm text-steel">You haven’t written anything yet.</p>;

  return (
    <div className="mt-4 overflow-x-auto rounded border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Program", "Field", "Stage", "Reviewer note", "Updated"].map((head) => (
              <th
                key={head}
                className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="h-[38px] border-b border-border last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap text-graphite">
                {row.school}
                <span className="text-steel"> · {row.level || "—"}</span>
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-steel">{fieldLabel(row.field_type)}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-graphite">
                {STATUS_LABELS[row.status] ?? row.status}
              </td>
              <td className="max-w-[280px] truncate px-3 py-1.5 text-steel">
                {row.review_note ?? "—"}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-steel">
                {new Date(row.updated_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalQueue() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listApprovalQueue);
  const reviewFn = useServerFn(reviewIntel);
  const query = useQuery({ queryKey: ["intel-queue"], queryFn: () => listFn(), retry: false });
  const rows = (query.data ?? []) as any[];
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const review = useMutation({
    mutationFn: (vars: { id: string; decision: string; content?: string; note?: string }) =>
      reviewFn({ data: vars }),
    onSuccess: () => {
      toast.success("Decision recorded");
      queryClient.invalidateQueries({ queryKey: ["intel-queue"] });
      queryClient.invalidateQueries({ queryKey: ["intel-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isPending) return <div className="mt-4 h-32 animate-pulse rounded bg-muted" />;
  if (!rows.length)
    return <p className="mt-4 py-6 text-sm text-steel">Nothing is waiting for review.</p>;

  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded border border-border bg-card p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-graphite">
              {row.school} · {fieldLabel(row.field_type)}
            </p>
            <p className="meta">
              {row.authorName ? `Written by ${row.authorName}` : "Author unknown"}
              {row.editorName ? ` · edited by ${row.editorName}` : ""} ·{" "}
              {STATUS_LABELS[row.status] ?? row.status}
            </p>
          </div>
          <textarea
            className="mt-2 min-h-[64px] w-full rounded border border-border bg-card p-2 text-sm text-graphite"
            value={edits[row.id] ?? row.content ?? ""}
            onChange={(e) => setEdits({ ...edits, [row.id]: e.target.value })}
          />
          <input
            className={cn(input, "mt-2")}
            value={notes[row.id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
            placeholder="Note back to the author (optional)"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() =>
                review.mutate({
                  id: row.id,
                  decision: "approve",
                  content: edits[row.id] ?? row.content ?? "",
                  ...(notes[row.id] ? { note: notes[row.id] } : {}),
                })
              }
            >
              {edits[row.id] !== undefined && edits[row.id] !== row.content
                ? "Edit and approve"
                : "Approve"}
            </button>
            <button
              type="button"
              className={ghost}
              onClick={() =>
                review.mutate({
                  id: row.id,
                  decision: "send_back",
                  ...(notes[row.id] ? { note: notes[row.id] } : {}),
                })
              }
            >
              Send back for editing
            </button>
            <button
              type="button"
              className={ghost}
              onClick={() =>
                review.mutate({
                  id: row.id,
                  decision: "reject",
                  ...(notes[row.id] ? { note: notes[row.id] } : {}),
                })
              }
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
