import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
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
        description="Work the list: write up a program, save field by field, move to the next."
        counts={[
          `${rows.length} programs`,
          `${rows.filter((r) => r.filled > 0).length} with intelligence`,
          `${rows.filter((r) => r.statuses.includes("pending")).length} awaiting review`,
        ]}
      />


      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["programs", "Programs"],
            ["mine", "My submissions"],
            ...(canApprove ? ([["queue", "Approval queue"]] as [Tab, string][]) : []),
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(ghost, tab === key && "border-org-primary text-org-primary")}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "mine" ? <MySubmissions /> : null}
      {tab === "queue" ? <ApprovalQueue /> : null}

      {tab === "programs" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <Filters filters={filters} setFilters={setFilters} />
            <div className="mt-3 overflow-x-auto rounded border border-border bg-card">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Program", "Level", "Fields", "Rel.", "Touched"].map((head) => (
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
                  {list.isPending ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-sm text-steel">
                        Loading programs…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-sm text-steel">
                        No programs match these filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => select(row.id)}
                        className={cn(
                          "h-[38px] cursor-pointer border-b border-border last:border-0 hover:bg-muted/60",
                          row.id === selected && "bg-muted",
                        )}
                      >
                        <td className="max-w-[170px] truncate px-3 py-1.5 whitespace-nowrap text-graphite">
                          {row.school}
                          {row.state ? <span className="text-steel"> · {row.state}</span> : null}
                        </td>
                        <td
                          className="px-3 py-1.5 whitespace-nowrap text-steel"
                          title={
                            row.conference
                              ? `${row.conference}${row.conferenceConfirmed ? "" : " (not confirmed)"}`
                              : "Conference not on file"
                          }
                        >
                          {[row.governingBody, row.division].filter(Boolean).join(" ") || "—"}
                        </td>

                        <td className="tabular px-3 py-1.5 whitespace-nowrap text-graphite">
                          {row.filled} / {INTEL_FIELD_COUNT}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-steel">
                          {STRENGTH_CHOICES.find((c) => c.value === row.strength)?.label ??
                            "Not rated"}
                        </td>
                        <td
                          className="px-3 py-1.5 whitespace-nowrap text-steel"
                          title={row.lastBy ? `Last touched by ${row.lastBy}` : ""}
                        >
                          {row.lastAt ? new Date(row.lastAt).toLocaleDateString() : "Never"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
              <p className="py-6 text-sm text-steel">Pick a program from the list to write it up.</p>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Filters({
  filters,
  setFilters,
}: {
  filters: any;
  setFilters: (next: any) => void;
}) {
  const set = (patch: Record<string, unknown>) => setFilters({ ...filters, ...patch });
  const divisions = DIVISIONS_BY_BODY[filters.governingBody] ?? [];
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Sport</span>
          <div className="flex gap-2">
            {["baseball", "softball"].map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => set({ sport })}
                className={cn(ghost, filters.sport === sport && "border-org-primary text-org-primary")}
              >
                {sport === "baseball" ? "Baseball" : "Softball"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>School name</span>
          <input
            className={input}
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search schools"
          />
        </div>
        <div>
          <span className={label}>Location</span>
          <select className={input} value={filters.region} onChange={(e) => set({ region: e.target.value })}>
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
            <span className={label}>Governing body</span>
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
          <span className={label}>Coverage</span>
          <select
            className={input}
            value={filters.coverage}
            onChange={(e) => set({ coverage: e.target.value })}
          >
            <option value="any">Any</option>
            <option value="has">Has intelligence</option>
            <option value="none">None yet</option>
          </select>
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
          <span className={label}>Written by</span>
          <select className={input} value={filters.author} onChange={(e) => set({ author: e.target.value })}>
            <option value="any">Anyone</option>
            <option value="mine">Me</option>
          </select>
        </div>
        <div>
          <span className={label}>Stage</span>
          <select className={input} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            <option value="pending">Awaiting review</option>
            <option value="changes_requested">Sent back</option>
            <option value="rejected">Rejected</option>
            <option value="approved">Approved</option>
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
  const groups: { key: string; title: string; fields: IntelFieldDef[] }[] = [
    { key: "recruiting", title: "Recruiting", fields: INTEL_FIELDS.filter((f) => f.group === "recruiting") },
    { key: "notes", title: "Notes", fields: INTEL_FIELDS.filter((f) => f.group === "notes") },
  ];

  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <div>
          <h2 className="font-display text-lg font-bold text-graphite">
            {program.universities?.name}
          </h2>
          <p className="meta">
            {program.sport === "baseball" ? "Baseball" : "Softball"} ·{" "}
            {[program.governing_body, program.division].filter(Boolean).join(" ") || "Level not confirmed"}
            {program.universities?.state ? ` · ${program.universities.state}` : ""}
          </p>
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

      <RelationshipBlock
        programId={programId}
        canRate={canRate}
        relationship={detail.data.relationship as any}
        interactions={detail.data.interactions as any[]}
        people={detail.data.people as Record<string, string>}
        onSaved={refresh}
      />

      {groups.map((group) => (
        <section key={group.key} className="mt-6">
          <h3 className="border-b border-border pb-1 font-display text-base font-bold text-graphite">
            {group.title}
          </h3>
          <div className="mt-2 divide-y divide-border">
            {group.fields.map((field) => (
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
        </section>
      ))}
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
  const [choice, setChoice] = useState<string>(record?.structured_value ?? "");
  const [positions, setPositions] = useState<string[]>(record?.positions ?? []);
  const [gradPositions, setGradPositions] = useState<string[]>(
    record?.structured_detail?.positions ?? [],
  );
  const [gradYear, setGradYear] = useState<string>(record?.structured_detail?.year ?? "");

  const saveFn = useServerFn(saveIntelField);
  const shareFn = useServerFn(setIntelVisibility);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          programId,
          fieldKey: field.key,
          content,
          structuredValue: field.kind === "choice" ? choice || null : null,
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

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-graphite">{field.label}</span>
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
        <select className={cn(input, "mt-2")} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Not recorded</option>
          {(field.choices ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {field.kind === "positions" || field.kind === "grad_needs" ? (
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
                  on ? "border-org-primary bg-org-primary text-white" : "bg-card text-steel",
                )}
              >
                {POSITION_LABELS[value] ?? value}
              </button>
            );
          })}
        </div>
      ) : null}

      {field.kind === "grad_needs" ? (
        <input
          className={cn(input, "mt-2")}
          value={gradYear}
          onChange={(e) => setGradYear(e.target.value)}
          placeholder="Year, e.g. 2027"
        />
      ) : null}

      <textarea
        className="mt-2 min-h-[64px] w-full rounded border border-border bg-card p-2 text-sm text-graphite focus:outline-none focus:ring-1 focus:ring-org-primary"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={field.help ?? "What did you see?"}
      />

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
      <h3 className="border-b border-border pb-1 font-display text-base font-bold text-graphite">
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
          <p className="meta mt-2">No interactions logged yet.</p>
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
