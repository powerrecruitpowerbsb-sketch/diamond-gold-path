import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Settings2 } from "lucide-react";
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
      { title: "College list — Power Recruit" },
      {
        name: "description",
        content:
          "Every school on an athlete's college list, with the stage each one is at and the conversation about it.",
      },
      { property: "og:title", content: "College list — Power Recruit" },
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

  const countFor = (stageId: string) => entries.filter((e) => e['stageId'] === stageId).length;
  const columns = COLUMNS.filter((column) => showingAll || !column.athleteOnly);

  return (
    <AppShell right={<AuthButton />}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">College list</h1>
          <p className="mt-1 text-sm text-steel">
            Every school on the list and the stage it's at. Staff, parents and the player can all
            move a school along; every move is recorded.
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

      <div className="mt-5 flex flex-wrap gap-3">
        {data?.viewer.isStaff || (data?.athletes ?? []).length > 1 ? (
          <label className="text-sm">
            <span className="meta block text-steel">Athlete</span>
            <select
              value={currentAthlete ?? ""}
              onChange={(event) => setAthleteId(event.target.value)}
              className="mt-1 h-9 rounded border border-input bg-card px-2 text-sm"
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
          <span className="meta block text-steel">Stage</span>
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
            className="mt-1 h-9 rounded border border-input bg-card px-2 text-sm"
          >
            <option value="all">All stages ({entries.length})</option>
            {stages.map((stage) => (
              <option key={String(stage['id'])} value={String(stage['id'])}>
                {String(stage['name'])} ({countFor(String(stage['id']))})
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="meta block text-steel">Sport</span>
          <select
            value={sportFilter}
            onChange={(event) => setSportFilter(event.target.value)}
            className="mt-1 h-9 rounded border border-input bg-card px-2 text-sm"
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
            className="mt-1 h-9 rounded border border-input bg-card px-2 text-sm"
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
        <div className="mt-4 max-h-[70vh] overflow-y-auto rounded border border-border">
          <table className="w-full text-sm">
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
                  <td className="px-3">
                    {entry['threadId'] ? (
                      <span
                        className={cn("flex items-center gap-1 text-xs text-org-primary")}
                        title="Conversation started"
                      >
                        <MessageSquare className="size-3" />
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SchoolSheet
        entry={openEntry}
        athleteId={openEntry?.athleteId ?? (showingAll ? null : currentAthlete)}
        onClose={() => setOpenEntry(null)}
      />
    </AppShell>
  );
}
