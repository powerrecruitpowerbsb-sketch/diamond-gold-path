import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  approveCorrectedChange,
  approveMatchingChanges,
  approvePendingChanges,
  countPendingChanges,
  listPendingChanges,
  rejectPendingChanges,
  sweepReviewQueue,
} from "@/lib/review.functions";


import { dataFieldLabel, dataValueLabel, recordKindLabel, sourceTypeLabel } from "@/lib/data-labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/review")({
  validateSearch: (search: Record<string, unknown>) => ({
    program: typeof search["program"] === "string" ? (search["program"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Data review queue — Power Recruit" },
      {
        name: "description",
        content:
          "Superadmin queue for approving or rejecting proposed school and program data changes before they reach live records.",
      },
      { property: "og:title", content: "Data review queue — Power Recruit" },
      {
        property: "og:description",
        content: "Approve or reject proposed changes to the Power Recruit college database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewQueue,
});

type PendingItem = {
  id: string;
  table_name: string;
  record_id: string | null;
  field_name: string | null;
  proposed_value: any;
  source_url: string | null;
  source_type: string;
  ai_confidence: number | null;
  created_at: string;
  recordLabel: string | null;
  currentValue: unknown;
  currentRecord: Record<string, unknown> | null;
  reviewReason?: string | null;
};

type Group = {
  key: string;
  schoolId: string | null;
  schoolName: string;
  programs: string[];
  items: PendingItem[];
  conflicts: number;
  lowConfidence: number;
  hasRoster: boolean;
  hasNewRecord: boolean;
};

type QueuePage = {
  groups: Group[];
  totalGroups: number;
  totalItems: number;
  totalPages: number;
  filteredItems: number;
  conflicts: number;
  page: number;
  pageSize: number;
};

type SweepResult = {
  examined: number;
  noChange: number;
  gapFills: number;
  remaining: number;
  failures: number;
  moreWaiting?: boolean;
  reasons?: { reason: string; count: number }[];
  samples: { label: string; field: string; reason: string }[];
};

function isLowTrust(item: PendingItem) {
  return item.ai_confidence == null || item.ai_confidence < 0.7;
}

function alternates(item: PendingItem): { value: unknown; source_url?: string }[] {
  const list = item.proposed_value?.["_alternates"];
  return Array.isArray(list) ? list : [];
}

function rosterPlayers(value: any): Record<string, unknown>[] {
  const players = value?.players;
  return Array.isArray(players) ? (players as Record<string, unknown>[]) : [];
}

function proposedScalar(item: PendingItem) {
  const value = item.proposed_value;
  if (item.field_name && value && typeof value === "object" && item.field_name in value) {
    return value[item.field_name];
  }
  return value;
}

function sportLabel(sport: string) {
  return sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : sport;
}

function ReviewQueue() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPendingChanges);
  const countFn = useServerFn(countPendingChanges);
  const approveFn = useServerFn(approvePendingChanges);
  const rejectFn = useServerFn(rejectPendingChanges);
  const sweepFn = useServerFn(sweepReviewQueue);
  const approveMatchingFn = useServerFn(approveMatchingChanges);
  const correctFn = useServerFn(approveCorrectedChange);

  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState("all");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [sweepPreview, setSweepPreview] = useState<SweepResult | null>(null);
  const [correcting, setCorrecting] = useState<{
    id: string;
    value: string;
    season: string;
    players: Record<string, unknown>[];
    note: string;
  } | null>(null);
  const [rejecting, setRejecting] = useState<{
    ids: string[];
    label: string;
    reason: string;
  } | null>(null);




  const { program: programFilter } = Route.useSearch();

  useEffect(() => setPage(1), [search, confidence, kind, programFilter]);

  const { data, isPending } = useQuery({
    queryKey: ["pending-changes", programFilter ?? "all", search, confidence, kind, page],
    queryFn: () =>
      listFn({
        data: {
          status: "pending",
          programId: programFilter ?? null,
          search,
          confidence,
          kind,
          page,
          pageSize: 25,
        },
      }),
  });
  const queue = data as unknown as QueuePage | undefined;
  const groups = queue?.groups ?? [];

  const { data: counts } = useQuery({
    queryKey: ["pending-changes-count"],
    queryFn: () => countFn({}),
  });
  const autoApplied = (counts as any)?.autoAppliedLast7Days ?? 0;

  /**
   * Decided items disappear from the screen straight away, and the fresh read
   * happens in the background. Waiting for the whole queue to be rebuilt after
   * every single decision is what made this feel broken.
   */
  const dropDecided = (ids: string[]) => {
    const gone = new Set(ids);
    queryClient.setQueriesData({ queryKey: ["pending-changes"] }, (previous: any) => {
      if (!previous?.groups) return previous;
      const groups = previous.groups
        .map((group: Group) => ({ ...group, items: group.items.filter((item) => !gone.has(item.id)) }))
        .filter((group: Group) => group.items.length > 0);
      return {
        ...previous,
        groups,
        totalGroups: groups.length,
        filteredItems: groups.reduce((sum: number, group: Group) => sum + group.items.length, 0),
        totalItems: Math.max(0, (previous.totalItems ?? 0) - ids.length),
      };
    });
    queryClient.setQueryData(["pending-changes-count"], (previous: any) =>
      previous ? { ...previous, pending: Math.max(0, (previous.pending ?? 0) - ids.length) } : previous,
    );
  };

  const invalidate = async (decidedIds?: string[]) => {
    setSelected(new Set());
    if (decidedIds?.length) dropDecided(decidedIds);
    void queryClient.invalidateQueries({ queryKey: ["pending-changes"] });
    void queryClient.invalidateQueries({ queryKey: ["pending-changes-count"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-universities"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-programs"] });
  };

  const approve = useMutation({
    mutationFn: (ids: string[]) => approveFn({ data: { ids } }),
    onSuccess: async (result: { applied: number; failures: { message: string }[] }, ids: string[]) => {
      if (result.applied)
        toast.success(`Applied ${result.applied} change${result.applied === 1 ? "" : "s"} to live data`);
      for (const failure of result.failures) toast.error(failure.message);
      await invalidate(ids);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: (input: { ids: string[]; reason?: string | null }) =>
      rejectFn({ data: input }),
    onSuccess: async (
      result: { rejected: number; requeued: number },
      input: { ids: string[]; reason?: string | null },
    ) => {
      toast.success(
        `Declined ${result.rejected} item${result.rejected === 1 ? "" : "s"} — live data untouched${
          result.requeued ? ` · ${result.requeued} program queued for a fresh pull` : ""
        }`,
      );
      setRejecting(null);
      await invalidate(input.ids);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const correct = useMutation({
    mutationFn: (input: { id: string; value: unknown; note: string | null }) =>
      correctFn({ data: input }),
    onSuccess: async (_result, input: { id: string }) => {
      toast.success("Saved your corrected value to live data");
      setCorrecting(null);
      await invalidate([input.id]);
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const sweep = useMutation({
    mutationFn: (apply: boolean) => sweepFn({ data: { apply } }) as Promise<SweepResult>,
    onSuccess: async (result: SweepResult, apply) => {
      if (!apply) {
        if (!result.noChange && !result.gapFills) {
          toast.success("Nothing to tidy — every open item is a real decision");
          setSweepPreview(null);
          return;
        }
        setSweepPreview(result);
        return;
      }
      setSweepPreview(null);
      toast.success(
        `Cleared ${result.noChange} duplicate or matching item${result.noChange === 1 ? "" : "s"} and applied ${result.gapFills} school-site fact${result.gapFills === 1 ? "" : "s"}${
          result.moreWaiting ? " — run it again to keep going" : ""
        }`,
      );

      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMatching = useMutation({
    mutationFn: () =>
      approveMatchingFn({ data: { search, minConfidence: 0.9, officialOnly: true } }) as Promise<{
        applied: number;
        failureCount: number;
        failures: { message: string }[];
      }>,
    onSuccess: async (result) => {
      toast.success(
        result.applied
          ? `Applied ${result.applied} confident fact${result.applied === 1 ? "" : "s"} from official sources`
          : "No confident official facts were waiting",
      );
      if (result.failureCount) toast.error(`${result.failureCount} could not be applied`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    approve.isPending ||
    reject.isPending ||
    sweep.isPending ||
    approveMatching.isPending ||
    correct.isPending;

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };


  const pendingTotal = (counts as any)?.pending ?? null;
  const totalPages = queue?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Review queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel">
            Only changes that need a human land here — anything that would overwrite existing data,
            where two sources disagree, or where the extraction looked shaky. Blank fields confirmed
            by an official source fill in on their own.
          </p>
        </div>
        <div className="text-right">
          <p className="meta tabular-nums">
            {isPending
              ? `${pendingTotal ?? "—"} ITEMS WAITING · LOADING…`
              : `${queue?.totalGroups ?? 0} SCHOOLS · ${queue?.filteredItems ?? 0} ON THIS PAGE · ${queue?.totalItems ?? 0} TOTAL`}
          </p>
          {autoApplied ? (
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-diamond-green tabular-nums">
              <ShieldCheck className="size-4" aria-hidden />
              {autoApplied} applied automatically this week
            </p>
          ) : null}
        </div>
      </div>

      {programFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-org-primary/30 bg-org-primary/5 p-4">
          <p className="text-sm text-graphite">
            Showing only items proposed for{" "}
            <span className="font-semibold">{groups[0]?.schoolName ?? "this program"}</span>.
          </p>
          <Link
            to="/admin/review"
            search={{ program: undefined }}
            className="meta underline hover:text-graphite"
          >
            SHOW EVERYTHING
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <label className="block">
          <span className="meta mb-1.5 block">SCHOOL</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by school name"
            className="h-11 w-56 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          />
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">NEEDS ATTENTION</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="all">Everything</option>
            <option value="conflict">Sources disagree</option>
            <option value="roster">Rosters</option>
            <option value="new">New records</option>
          </select>
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">CONFIDENCE</span>
          <select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="all">Any</option>
            <option value="low">Low (under 70%)</option>
            <option value="medium">Medium (70–89%)</option>
            <option value="high">High (90%+)</option>
          </select>
        </label>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="touch-target"
            disabled={busy}
            onClick={() => sweep.mutate(false)}
          >
            <Sparkles className="size-4" aria-hidden />
            Tidy the queue
          </Button>
          <Button
            variant="outline"
            className="touch-target"
            disabled={busy}
            onClick={() => approveMatching.mutate()}
          >
            <ShieldCheck className="size-4" aria-hidden />
            Approve all confident facts
          </Button>
          <Button
            className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
            disabled={busy || selected.size === 0}
            onClick={() => approve.mutate([...selected])}
          >
            <Check className="size-4" aria-hidden />
            Approve selected ({selected.size})
          </Button>
          <Button
            variant="outline"
            className="touch-target"
            disabled={busy || selected.size === 0}
            onClick={() =>
              setRejecting({
                ids: [...selected],
                label: `${selected.size} selected item${selected.size === 1 ? "" : "s"}`,
                reason: "",
              })
            }
          >
            <X className="size-4" aria-hidden />
            Decline selected
          </Button>
        </div>
      </div>

      {rejecting ? (
        <div className="space-y-3 rounded-xl border border-seam-red/40 bg-seam-red-tint p-4">
          <p className="text-sm font-semibold text-graphite">Declining {rejecting.label}</p>
          <label className="block">
            <span className="meta mb-1.5 block">WHAT WAS WRONG? (OPTIONAL)</span>
            <input
              value={rejecting.reason}
              onChange={(event) =>
                setRejecting((prev) => (prev ? { ...prev, reason: event.target.value } : prev))
              }
              placeholder="e.g. pulled the 2002 roster page, not the current one"
              className="h-11 w-full max-w-xl rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
            />
          </label>
          <p className="text-sm text-steel">
            This school automatically goes back in line for a fresh pull.
          </p>
          <div className="flex gap-2">
            <Button
              className="touch-target"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                reject.mutate({
                  ids: rejecting.ids,
                  reason: rejecting.reason || null,
                })
              }
            >
              Decline
            </Button>
            <Button
              variant="outline"
              className="touch-target"
              disabled={busy}
              onClick={() => setRejecting(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}



      {sweepPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-org-accent/40 bg-org-accent/10 p-4">
          <div className="min-w-0 text-sm text-graphite">
            <p className="font-semibold">
              {sweepPreview.noChange} item{sweepPreview.noChange === 1 ? "" : "s"} already match what
              we store, and {sweepPreview.gapFills} fill a blank field from an official source.
            </p>
            <p className="mt-1 text-steel">
              Clearing those leaves {sweepPreview.remaining} real decision
              {sweepPreview.remaining === 1 ? "" : "s"} for you
              {sweepPreview.moreWaiting ? ", and more items after this batch" : ""}.
            </p>
            {sweepPreview.reasons?.length ? (
              <ul className="mt-2 space-y-0.5 text-steel">
                {sweepPreview.reasons.slice(0, 5).map((entry) => (
                  <li key={entry.reason} className="tabular-nums">
                    {entry.count} · {entry.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
              disabled={busy}
              onClick={() => sweep.mutate(true)}
            >
              Clear them
            </Button>
            <Button
              variant="outline"
              className="touch-target"
              disabled={busy}
              onClick={() => setSweepPreview(null)}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : null}


      {isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-card">
          <p className="font-display text-lg font-bold text-graphite">Nothing to review</p>
          <p className="mt-1 text-sm text-steel">
            Either every recent pull was confident enough to apply on its own, or no pull has run yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const open = openGroups.has(group.key);
            const ids = group.items.map((item) => item.id);
            const allSelected = ids.every((id) => selected.has(id));
            return (
              <li key={group.key} className="rounded-xl border border-border bg-card shadow-card">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const id of ids) allSelected ? next.delete(id) : next.add(id);
                        return next;
                      })
                    }
                    aria-label={`Select all items for ${group.schoolName}`}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setOpenGroups((prev) => toggle(prev, group.key))}
                  >
                    {open ? (
                      <ChevronDown className="size-4 text-steel" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 text-steel" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-bold text-graphite">
                        {group.schoolName}
                      </span>
                      <span className="meta tabular-nums">
                        {group.items.length} ITEM{group.items.length === 1 ? "" : "S"}
                        {group.programs.length
                          ? ` · ${group.programs.map(sportLabel).join(" · ")}`
                          : ""}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {group.conflicts ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-seam-red-tint px-2 py-0.5 text-xs font-semibold text-seam-red tabular-nums">
                        <AlertTriangle className="size-3" aria-hidden />
                        {group.conflicts} source conflict{group.conflicts === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {group.lowConfidence ? (
                      <span className="rounded-md bg-org-accent/15 px-2 py-0.5 text-xs font-semibold text-graphite tabular-nums">
                        {group.lowConfidence} needs a look
                      </span>
                    ) : null}
                    {group.hasRoster ? (
                      <span className="rounded-md bg-org-primary/10 px-2 py-0.5 text-xs font-semibold text-org-primary">
                        Roster
                      </span>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
                      disabled={busy}
                      onClick={() => approve.mutate(ids)}
                    >
                      Approve all
                    </Button>
                    <Button
                      variant="outline"
                      className="touch-target"
                      disabled={busy}
                      onClick={() =>
                        setRejecting({
                          ids,
                          label: `all ${ids.length} item${ids.length === 1 ? "" : "s"} for ${group.schoolName}`,
                          reason: "",

                        })
                      }
                    >
                      Decline all
                    </Button>

                  </div>
                </div>

                {open ? (
                  <ul className="border-t border-border">
                    {group.items.map((item) => {
                      const low = isLowTrust(item);
                      const itemOpen = openItems.has(item.id);
                      const others = alternates(item);
                      return (
                        <li
                          key={item.id}
                          className={cn(
                            "flex flex-wrap items-start gap-3 border-b border-border/60 p-4 last:border-b-0",
                            low ? "bg-seam-red-tint/40" : null,
                          )}
                        >
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={() => setSelected((prev) => toggle(prev, item.id))}
                            aria-label="Select proposal"
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="meta">{recordKindLabel(item.table_name)}</span>
                              {item.record_id ? null : (
                                <span className="rounded-md bg-org-primary/10 px-2 py-0.5 text-xs font-semibold text-org-primary">
                                  New record
                                </span>
                              )}
                              {others.length ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-seam-red-tint px-2 py-0.5 text-xs font-semibold text-seam-red">
                                  <AlertTriangle className="size-3" aria-hidden />
                                  Sources disagree
                                </span>
                              ) : null}
                              {item.reviewReason ? (
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-steel">
                                  {item.reviewReason}
                                </span>
                              ) : null}
                              <span className="meta tabular-nums">
                                {item.ai_confidence == null
                                  ? "NO SCORE"
                                  : `${Math.round(item.ai_confidence * 100)}% CONFIDENCE`}
                              </span>
                            </div>

                            <p className="mt-1 font-semibold text-graphite">
                              {item.field_name
                                ? dataFieldLabel(item.field_name)
                                : item.table_name === "roster_players"
                                  ? "Roster replacement"
                                  : "Full record"}
                            </p>

                            {item.field_name ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-border bg-muted/40 p-3">
                                  <p className="meta">CURRENTLY</p>
                                  <p className="mt-1 break-words text-sm tabular-nums text-graphite">
                                    {dataValueLabel(item.currentValue)}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-diamond-green/40 bg-diamond-green-tint p-3">
                                  <p className="meta">PROPOSED</p>
                                  <p className="mt-1 break-words text-sm font-semibold tabular-nums text-graphite">
                                    {dataValueLabel(proposedScalar(item))}
                                  </p>
                                </div>
                              </div>
                            ) : item.table_name === "roster_players" ? (
                              <div className="mt-2">
                                <p className="text-sm text-steel">
                                  Replaces the stored{" "}
                                  <span className="tabular-nums">
                                    {String(item.proposed_value?.["season_year"] ?? "—")}
                                  </span>{" "}
                                  roster with{" "}
                                  <span className="font-semibold tabular-nums text-graphite">
                                    {rosterPlayers(item.proposed_value).length} players
                                  </span>
                                  .
                                  {item.proposed_value?.["incomplete_scrape"] ? (
                                    <span className="font-semibold text-seam-red">
                                      {" "}
                                      That is smaller than a real four-year roster, so this looks
                                      like a partial read — check the source page before approving.
                                    </span>
                                  ) : null}
                                </p>
                                <button
                                  type="button"
                                  className="meta mt-2 hover:text-graphite"
                                  onClick={() => setOpenItems((prev) => toggle(prev, item.id))}
                                >
                                  {itemOpen ? "HIDE PLAYERS" : "SHOW PLAYERS"}
                                </button>
                                {itemOpen ? (
                                  <table className="mt-2 w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="py-1.5 pr-3 text-left text-steel">Name</th>
                                        <th className="py-1.5 pr-3 text-left text-steel">Pos</th>
                                        <th className="py-1.5 pr-3 text-left text-steel">Class</th>
                                        <th className="py-1.5 text-left text-steel">Hometown</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rosterPlayers(item.proposed_value).map((player, index) => (
                                        <tr key={index} className="border-b border-border/60">
                                          <td className="py-1.5 pr-3 text-graphite">
                                            {dataValueLabel(player["name"])}
                                          </td>
                                          <td className="py-1.5 pr-3 text-graphite">
                                            {dataValueLabel(player["position"])}
                                          </td>
                                          <td className="py-1.5 pr-3 text-graphite">
                                            {dataValueLabel(player["class_year"])}
                                          </td>
                                          <td className="py-1.5 text-steel">
                                            {dataValueLabel(player["hometown"])}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  className="meta hover:text-graphite"
                                  onClick={() => setOpenItems((prev) => toggle(prev, item.id))}
                                >
                                  {itemOpen ? "HIDE DETAILS" : "SHOW DETAILS"}
                                </button>
                                {itemOpen ? (
                                  <table className="mt-2 w-full text-sm">
                                    <tbody>
                                      {Object.entries(
                                        (item.proposed_value ?? {}) as Record<string, unknown>,
                                      )
                                        .filter(([key]) => !key.startsWith("_"))
                                        .map(([key, value]) => (
                                          <tr key={key} className="border-b border-border/60">
                                            <td className="py-1.5 pr-3 text-steel">
                                              {dataFieldLabel(key)}
                                            </td>
                                            <td className="py-1.5 pr-3 tabular-nums text-graphite">
                                              {dataValueLabel(value)}
                                            </td>
                                            <td className="py-1.5 tabular-nums text-steel">
                                              {item.currentRecord
                                                ? dataValueLabel(item.currentRecord[key])
                                                : ""}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                ) : null}
                              </div>
                            )}

                            {others.length ? (
                              <p className="mt-2 text-sm text-graphite">
                                Another page said{" "}
                                {others
                                  .map((alternate) => dataValueLabel(alternate.value))
                                  .join(", ")}
                                .
                              </p>
                            ) : null}

                            <p className="meta mt-3 flex flex-wrap items-center gap-2">
                              <span>{sourceTypeLabel(item.source_type)}</span>
                              {item.source_url ? (
                                <a
                                  href={item.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 underline hover:text-graphite"
                                >
                                  Source page
                                  <ExternalLink className="size-3" aria-hidden />
                                </a>
                              ) : (
                                <span>NO SOURCE LINK</span>
                              )}
                              <span>· FOUND {new Date(item.created_at).toLocaleDateString()}</span>
                            </p>

                            {correcting?.id === item.id ? (
                              <div className="mt-3 space-y-3 rounded-lg border border-org-accent/50 bg-org-accent/10 p-3">
                                {item.table_name === "roster_players" && !item.field_name ? (
                                  <>
                                    <label className="block">
                                      <span className="meta mb-1.5 block">SEASON YEAR</span>
                                      <input
                                        value={correcting.season}
                                        onChange={(event) =>
                                          setCorrecting((prev) =>
                                            prev ? { ...prev, season: event.target.value } : prev,
                                          )
                                        }
                                        inputMode="numeric"
                                        className="h-11 w-32 rounded-lg border border-input bg-card px-3 text-sm tabular-nums outline-none focus:border-org-primary"
                                      />
                                    </label>
                                    <p className="text-sm text-steel">
                                      Keeping{" "}
                                      <span className="font-semibold tabular-nums text-graphite">
                                        {correcting.players.length}
                                      </span>{" "}
                                      players. Remove anyone who does not belong.
                                    </p>
                                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                                      {correcting.players.map((player, index) => (
                                        <li
                                          key={index}
                                          className="flex items-center justify-between gap-2 text-sm text-graphite"
                                        >
                                          <span className="truncate">
                                            {dataValueLabel(player["name"])} ·{" "}
                                            {dataValueLabel(player["position"])} ·{" "}
                                            {dataValueLabel(player["class_year"])}
                                          </span>
                                          <button
                                            type="button"
                                            className="meta hover:text-seam-red"
                                            onClick={() =>
                                              setCorrecting((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      players: prev.players.filter(
                                                        (_, spot) => spot !== index,
                                                      ),
                                                    }
                                                  : prev,
                                              )
                                            }
                                          >
                                            REMOVE
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                ) : (
                                  <label className="block">
                                    <span className="meta mb-1.5 block">CORRECTED VALUE</span>
                                    <input
                                      value={correcting.value}
                                      onChange={(event) =>
                                        setCorrecting((prev) =>
                                          prev ? { ...prev, value: event.target.value } : prev,
                                        )
                                      }
                                      className="h-11 w-full max-w-xl rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
                                    />
                                  </label>
                                )}
                                <label className="block">
                                  <span className="meta mb-1.5 block">NOTE (OPTIONAL)</span>
                                  <input
                                    value={correcting.note}
                                    onChange={(event) =>
                                      setCorrecting((prev) =>
                                        prev ? { ...prev, note: event.target.value } : prev,
                                      )
                                    }
                                    placeholder="Why you changed it"
                                    className="h-11 w-full max-w-xl rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
                                  />
                                </label>
                                <div className="flex gap-2">
                                  <Button
                                    className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
                                    disabled={busy}
                                    onClick={() =>
                                      correct.mutate({
                                        id: item.id,
                                        value:
                                          item.table_name === "roster_players" && !item.field_name
                                            ? {
                                                season_year:
                                                  Number(correcting.season) || undefined,
                                                players: correcting.players,
                                              }
                                            : correcting.value,
                                        note: correcting.note || null,
                                      })
                                    }
                                  >
                                    Save and approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="touch-target"
                                    disabled={busy}
                                    onClick={() => setCorrecting(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
                              disabled={busy}
                              onClick={() => approve.mutate([item.id])}
                            >
                              Approve
                            </Button>
                            {item.field_name ||
                            (item.table_name === "roster_players" && !item.field_name) ? (
                              <Button
                                variant="outline"
                                className="touch-target"
                                disabled={busy}
                                onClick={() =>
                                  setCorrecting({
                                    id: item.id,
                                    value:
                                      proposedScalar(item) == null
                                        ? ""
                                        : String(proposedScalar(item)),
                                    season: String(item.proposed_value?.["season_year"] ?? ""),
                                    players: rosterPlayers(item.proposed_value),
                                    note: "",
                                  })
                                }
                              >
                                Fix and approve
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              className="touch-target"
                              disabled={busy}
                              onClick={() =>
                                setRejecting({
                                  ids: [item.id],
                                  label: "this item",
                                  reason: "",
                                })
                              }
                            >
                              Decline
                            </Button>
                          </div>

                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            className="touch-target"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          >
            Previous
          </Button>
          <p className="meta tabular-nums">
            PAGE {page} OF {totalPages}
          </p>
          <Button
            variant="outline"
            className="touch-target"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
