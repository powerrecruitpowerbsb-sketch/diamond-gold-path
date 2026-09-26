import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { SchoolSheet, type SheetEntry } from "@/components/list/SchoolSheet";
import { StageSettings } from "@/components/list/StageSettings";
import { Button } from "@/components/ui/button";
import { getCollegeList, moveToStage } from "@/lib/continuum.functions";
import { activityChipLabel, chipTone, highlightChips } from "@/lib/athlete-activity";
import { useSportMode } from "@/hooks/use-sport-mode";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/list")({
  head: () => ({
    meta: [
      { title: "College list — Curve Recruit" },
      {
        name: "description",
        content:
          "Every school on an athlete's college list, with the stage each one is at and the conversation about it.",
      },
      { property: "og:title", content: "College list — Curve Recruit" },
      {
        property: "og:description",
        content: "Track each school an athlete is looking at, from researching through committed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CollegeList,
});

type SortKey =
  | "athlete"
  | "school"
  | "sport"
  | "level"
  | "conference"
  | "state"
  | "stage"
  | "activity";

/** Sortable columns; the Athlete column only appears when every athlete is on screen. */
const COLUMNS: { key: SortKey; header: string; athleteOnly?: boolean }[] = [
  { key: "athlete", header: "Athlete", athleteOnly: true },
  { key: "school", header: "School" },
  { key: "sport", header: "Sport" },
  { key: "level", header: "Level" },
  { key: "conference", header: "Conference" },
  { key: "state", header: "State" },
  { key: "stage", header: "Stage" },
  { key: "activity", header: "Last activity" },
];

function sortValue(
  key: SortKey,
  entry: Record<string, any>,
  stageOrder: Map<string, number>,
): string | number {
  switch (key) {
    case "athlete":
      return String(entry['athleteName'] ?? "");
    case "school":
      return String(entry['school'] ?? "");
    case "sport":
      return String(entry['sport'] ?? "");
    case "level":
      return [entry['governingBody'], entry['division']].filter(Boolean).join(" ");
    case "conference":
      return String(entry['conference'] ?? "");
    case "state":
      return String(entry['state'] ?? "");
    case "stage":
      return stageOrder.get(String(entry['stageId'] ?? "")) ?? 999;
    case "activity":
      return String(entry['lastMessageAt'] ?? entry['updatedAt'] ?? "");
  }
}


function CollegeList() {
  const listFn = useServerFn(getCollegeList);
  const moveFn = useServerFn(moveToStage);
  const queryClient = useQueryClient();

  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [openEntry, setOpenEntry] = useState<SheetEntry | null>(null);
  const [sheetTab, setSheetTab] = useState<string>("overview");
  const [showStages, setShowStages] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("athlete");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Staff see one sport at a time, set by the header switch; a family always
  // sees their own athlete whichever way the switch is set.
  const { sport } = useSportMode();
  const list = useQuery({
    queryKey: ["college-list", athleteId, sport],
    queryFn: () => listFn({ data: { athleteId: athleteId ?? "", sport } }),
    retry: false,
  });

  const data = list.data;
  const stages = (data?.stages ?? []) as Record<string, any>[];
  const entries = (data?.entries ?? []) as Record<string, any>[];
  const currentAthlete = athleteId ?? data?.athleteId ?? null;
  const showingAll = currentAthlete === "all";

  const move = useMutation({
    mutationFn: (input: { entryId: string; stageId: string }) => moveFn({ data: input }),
    onSuccess: () => {
      toast.success("Moved");
      queryClient.invalidateQueries({ queryKey: ["college-list"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const levels = useMemo(
    () =>
      Array.from(
        new Set(
          entries
            .map((e) => [e['governingBody'], e['division']].filter(Boolean).join(" "))
            .filter(Boolean),
        ),
      ).sort(),
    [entries],
  );

  const stageOrder = useMemo(
    () => new Map(stages.map((stage, index) => [String(stage['id']), index])),
    [stages],
  );

  const filtered = entries
    .filter((entry) => {
      if (stageFilter !== "all" && entry['stageId'] !== stageFilter) return false;
      if (sportFilter !== "all" && entry['sport'] !== sportFilter) return false;
      const level = [entry['governingBody'], entry['division']].filter(Boolean).join(" ");
      if (levelFilter !== "all" && level !== levelFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const left = sortValue(sortKey, a, stageOrder);
      const right = sortValue(sortKey, b, stageOrder);
      const cmp =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return dir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  const coachPicks = entries.filter((e) => e['coachPick']);
  const stageIndex = (id: unknown) => stages.findIndex((st) => String(st['id']) === String(id));
  const openSheet = (entry: Record<string, any>, tab: string) => {
    setSheetTab(tab);
    setOpenEntry({
      id: String(entry['id']),
      programId: String(entry['programId']),
      school: String(entry['school']),
      sport: (entry['sport'] ?? null) as string | null,
      notes: (entry['notes'] ?? null) as string | null,
      threadId: (entry['threadId'] ?? null) as string | null,
      athleteId: (entry['athleteId'] ?? null) as string | null,
    });
  };
  const countFor = (stageId: string) => entries.filter((e) => e['stageId'] === stageId).length;
  const columns = COLUMNS.filter((column) => showingAll || !column.athleteOnly);

  return (
    <AppShell right={<AuthButton />}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">My Colleges</h1>
          <p className="mt-1 text-sm text-steel">
            Every school on the list, where it stands, and what your coaches think. Tap a stage to
            filter; tap a school to open it.
          </p>
        </div>
        {data?.viewer.isAdminLevel ? (
          <Button
            variant="outline"
            className="touch-target"
            onClick={() => setShowStages((open) => !open)}
          >
            <Settings2 className="mr-1 size-4" /> {showStages ? "Close stages" : "Stage names"}
          </Button>
        ) : null}
      </div>

      {showStages ? <StageSettings /> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {data?.viewer.isStaff || (data?.athletes ?? []).length > 1 ? (
          <label className="text-sm">
            <span className="meta block text-steel">Athlete</span>
            <select
              value={currentAthlete ?? ""}
              onChange={(event) => setAthleteId(event.target.value)}
              className="touch-target mt-1 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm font-medium text-graphite outline-none focus:border-org-accent"
            >
              {data?.viewer.isStaff ? (
                <option value="all">All athletes ({(data?.athletes ?? []).length})</option>
              ) : null}
              {(data?.athletes ?? []).map((athlete) => (
                <option key={String(athlete.id)} value={String(athlete.id)}>
                  {String(athlete.name)}
                  {athlete.gradYear ? ` · ${athlete.gradYear}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-sm">
          <span className="meta block text-steel">Sport</span>
          <select
            value={sportFilter}
            onChange={(event) => setSportFilter(event.target.value)}
            className="touch-target mt-1 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm font-medium text-graphite outline-none focus:border-org-accent"
          >
            <option value="all">Both</option>
            <option value="baseball">Baseball</option>
            <option value="softball">Softball</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="meta block text-steel">Level</span>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            className="touch-target mt-1 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm font-medium text-graphite outline-none focus:border-org-accent"
          >
            <option value="all">All levels</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      {entries.length > 0 ? (
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StageTile
            label="All"
            count={entries.length}
            active={stageFilter === "all"}
            onClick={() => setStageFilter("all")}
          />
          {stages.map((stage, i) => (
            <StageTile
              key={String(stage['id'])}
              label={String(stage['name'])}
              count={countFor(String(stage['id']))}
              step={i + 1}
              active={stageFilter === String(stage['id'])}
              onClick={() => setStageFilter(String(stage['id']))}
            />
          ))}
        </div>
      ) : null}

      {!showingAll && coachPicks.length > 0 && stageFilter === "all" ? (
        <section className="mt-6">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold text-graphite">
            <Sparkles className="size-4 text-org-accent" aria-hidden /> Picks
          </h2>
          <ul className="mt-2 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
            {coachPicks.map((entry) => (
              <li key={String(entry['id'])} className="w-72 shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => openSheet(entry, "overview")}
                  className="h-full w-full rounded-xl border border-org-primary/40 bg-org-primary/10 p-4 text-left transition-colors hover:border-org-primary"
                >
                  <span className="font-mono text-[10px] tracking-[0.16em] text-org-accent uppercase">
                    Coach pick · {String(entry['coachPick'])}
                  </span>
                  <span className="font-display mt-1 block truncate text-base font-bold text-graphite">
                    {String(entry['school'])}
                  </span>
                  {entry['coachMessage'] ? (
                    <span className="mt-2 line-clamp-3 block text-sm text-graphite/85 italic">
                      “{String(entry['coachMessage'])}”
                    </span>
                  ) : (
                    <span className="mt-2 block text-sm text-steel">Your coach thinks this is a fit.</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {list.isPending ? (
        <p className="mt-6 text-sm text-steel">Loading…</p>
      ) : list.error ? (
        <p className="mt-6 rounded border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(list.error as Error).message}
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded border border-border p-6 text-sm text-steel">
          Nothing on the list for this filter yet. Add schools from Search.
        </p>
      ) : (
        <>
        <ul className={cn("mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3", showingAll && "md:hidden")}>
          {filtered.map((entry) => {
            const level = [entry['governingBody'], entry['division']].filter(Boolean).join(" ");
            const si = stageIndex(entry['stageId']);
            const chips = highlightChips((entry['activityChips'] ?? []) as string[]);
            const when = entry['lastMessageAt'] ?? entry['updatedAt'];
            return (
              <li
                key={String(entry['id'])}
                className={cn(
                  "flex flex-col rounded-2xl border surface-raised p-4 transition-colors",
                  entry['coachPick'] ? "border-org-primary/50" : "border-border hover:border-org-primary/40",
                )}
              >
                <button type="button" onClick={() => openSheet(entry, "overview")} className="flex w-full items-start gap-3 text-left">
                  <span className="font-display grid size-11 shrink-0 place-items-center rounded-lg bg-org-primary/15 text-sm font-bold text-org-primary">
                    {String(entry['school'] ?? "")
                      .replace(/University|College|of|the|at/gi, "")
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((w: string) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "C"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {showingAll ? (
                      <span className="block font-mono text-[10px] tracking-wide text-steel uppercase">
                        {String(entry['athleteName'] ?? "—")}
                      </span>
                    ) : null}
                    <span className="font-display block text-base leading-tight font-bold text-graphite">
                      {String(entry['school'])}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {level ? (
                        <span className="rounded-md bg-org-primary px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-org-primary-foreground uppercase">
                          {level}
                        </span>
                      ) : null}
                      {entry['conference'] ? (
                        <span className="max-w-[170px] truncate rounded-md border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-steel uppercase">
                          {String(entry['conference'])}
                        </span>
                      ) : null}
                      {entry['state'] ? (
                        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-steel uppercase">
                          {String(entry['state'])}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>

                {entry['coachPick'] ? (
                  <div className="mt-3 rounded-lg border border-org-primary/30 bg-org-primary/10 px-3 py-2">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-org-accent uppercase">
                      Coach pick · {String(entry['coachPick'])}
                    </p>
                    {entry['coachMessage'] ? (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-graphite/85">{String(entry['coachMessage'])}</p>
                    ) : null}
                  </div>
                ) : null}

                {chips.length ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {chips.map((chip) => (
                      <span key={chip} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", chipTone(chip))}>
                        {activityChipLabel(chip)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto pt-4">
                  <div className="flex gap-1" aria-hidden>
                    {stages.map((st, i) => (
                      <span
                        key={String(st['id'])}
                        className={cn("h-1 flex-1 rounded-full", si >= 0 && i <= si ? "bg-org-primary" : "bg-muted")}
                      />
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <select
                      value={String(entry['stageId'] ?? "")}
                      aria-label={`Stage for ${String(entry['school'])}`}
                      onChange={(event) => move.mutate({ entryId: String(entry['id']), stageId: event.target.value })}
                      className="touch-target min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 text-sm font-medium text-graphite"
                    >
                      {stages.map((stage) => (
                        <option key={String(stage['id'])} value={String(stage['id'])}>
                          {String(stage['name'])}
                        </option>
                      ))}
                    </select>
                    <Button variant="outline" className="touch-target" onClick={() => openSheet(entry, "activity")}>
                      {entry['threadId'] ? <MessageSquare className="mr-1 size-4" /> : null}
                      Activity
                    </Button>
                  </div>
                  {when ? (
                    <p className="mt-2 text-[11px] text-steel">
                      Last activity {new Date(String(when)).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className={cn("mt-4 hidden max-h-[70vh] overflow-y-auto rounded-2xl border border-border", showingAll && "md:block")}>
          <div className="scroll-x"><table className="w-full text-sm">
            <caption className="sr-only">Saved schools</caption>
            <thead className="sticky top-0 bg-muted">
              <tr className="border-b border-border text-left">
                {columns.map((column) => (
                  <th key={column.key} className="meta px-3 py-2 text-steel">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="meta text-steel hover:text-graphite"
                    >
                      {column.header}
                      {sortKey === column.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
                <th className="meta px-3 py-2 text-steel" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={String(entry['id'])}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60"
                  onClick={() => {
                    setSheetTab("overview");
                    setOpenEntry({
                      id: String(entry['id']),
                      programId: String(entry['programId']),
                      school: String(entry['school']),
                      sport: (entry['sport'] ?? null) as string | null,
                      notes: (entry['notes'] ?? null) as string | null,
                      threadId: (entry['threadId'] ?? null) as string | null,
                      athleteId: (entry['athleteId'] ?? null) as string | null,
                    });
                  }}
                >
                  {showingAll ? (
                    <td className="px-3 text-graphite">{String(entry['athleteName'] ?? "—")}</td>
                  ) : null}
                  <td className="px-3 py-1.5 font-semibold text-graphite">
                    {String(entry['school'])}
                    {entry['coachPick'] ? (
                      <span
                        className="ml-2 rounded-md bg-org-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-org-primary uppercase"
                        title={entry['coachMessage'] ? String(entry['coachMessage']) : undefined}
                      >
                        Coach pick · {String(entry['coachPick'])}
                      </span>
                    ) : null}
                    {highlightChips((entry['activityChips'] ?? []) as string[]).length ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {highlightChips((entry['activityChips'] ?? []) as string[]).map((chip) => (
                          <span
                            key={chip}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              chipTone(chip),
                            )}
                          >
                            {activityChipLabel(chip)}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-steel">{String(entry['sport'] ?? "—")}</td>
                  <td className="px-3 text-steel">
                    {[entry['governingBody'], entry['division']].filter(Boolean).join(" ") ||
                      "Not reported"}
                  </td>
                  <td className="px-3 text-steel">{String(entry['conference'] ?? "Not reported")}</td>
                  <td className="px-3 tabular-nums text-steel">{String(entry['state'] ?? "—")}</td>
                  <td className="px-3" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={String(entry['stageId'] ?? "")}
                      aria-label={`Stage for ${String(entry['school'])}`}
                      onChange={(event) =>
                        move.mutate({
                          entryId: String(entry['id']),
                          stageId: event.target.value,
                        })
                      }
                      className="h-7 rounded border border-input bg-card px-1 text-xs"
                    >
                      {stages.map((stage) => (
                        <option key={String(stage['id'])} value={String(stage['id'])}>
                          {String(stage['name'])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 text-steel tabular-nums">
                    {entry['lastMessageAt'] || entry['updatedAt']
                      ? new Date(
                          String(entry['lastMessageAt'] ?? entry['updatedAt']),
                        ).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {entry['threadId'] ? (
                        <span
                          className={cn("flex items-center gap-1 text-xs text-org-primary")}
                          title="Conversation started"
                        >
                          <MessageSquare className="size-3" />
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold text-steel hover:border-org-primary hover:text-graphite"
                        onClick={() => {
                          setSheetTab("activity");
                          setOpenEntry({
                            id: String(entry['id']),
                            programId: String(entry['programId']),
                            school: String(entry['school']),
                            sport: (entry['sport'] ?? null) as string | null,
                            notes: (entry['notes'] ?? null) as string | null,
                            threadId: (entry['threadId'] ?? null) as string | null,
                            athleteId: (entry['athleteId'] ?? null) as string | null,
                          });
                        }}
                      >
                        Activity
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        </>
      )}

      <SchoolSheet
        entry={openEntry}
        athleteId={openEntry?.athleteId ?? (showingAll ? null : currentAthlete)}
        defaultTab={sheetTab}
        onClose={() => setOpenEntry(null)}
      />
    </AppShell>
  );
}

function StageTile({
  label,
  count,
  step,
  active,
  onClick,
}: {
  label: string;
  count: number;
  step?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-left transition-colors",
        active ? "border-org-primary bg-org-primary/15" : "border-border bg-card hover:border-org-primary/40",
      )}
    >
      <span className="block truncate text-xs font-medium text-steel" title={step ? `Step ${step}` : undefined}>
        {label}
      </span>
      <span className={cn("font-display tabular block text-2xl font-bold", active ? "text-org-primary" : "text-graphite")}>
        {count}
      </span>
    </button>
  );
}
