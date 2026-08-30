import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  approvePendingChanges,
  listPendingChanges,
  rejectPendingChanges,
} from "@/lib/review.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/review")({
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
  proposed_value: unknown;
  source_url: string | null;
  source_type: string;
  ai_confidence: number | null;
  created_at: string;
  recordLabel: string | null;
  currentValue: unknown;
  currentRecord: Record<string, unknown> | null;
};

const TABLE_LABEL: Record<string, string> = { universities: "School", programs: "Program" };

function band(confidence: number | null) {
  if (confidence == null) return "none";
  if (confidence < 0.7) return "low";
  if (confidence < 0.9) return "medium";
  return "high";
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function fieldLabel(name: string) {
  return name.replace(/_/g, " ").replace(/\burl\b/i, "URL");
}

function ReviewQueue() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPendingChanges);
  const approveFn = useServerFn(approvePendingChanges);
  const rejectFn = useServerFn(rejectPendingChanges);

  const [tableFilter, setTableFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data = [], isPending } = useQuery({
    queryKey: ["pending-changes"],
    queryFn: () => listFn({ data: { status: "pending" } }),
  });
  const items = data as unknown as PendingItem[];

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (tableFilter !== "all" && item.table_name !== tableFilter) return false;
        if (confidenceFilter !== "all" && band(item.ai_confidence) !== confidenceFilter) return false;
        if (scopeFilter === "new" && item.record_id) return false;
        if (scopeFilter === "field" && !item.field_name) return false;
        return true;
      }),
    [items, tableFilter, confidenceFilter, scopeFilter],
  );

  const invalidate = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["pending-changes"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-changes-count"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-universities"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-programs"] });
  };

  const approve = useMutation({
    mutationFn: (ids: string[]) => approveFn({ data: { ids } }),
    onSuccess: async (result: { applied: number; failures: { message: string }[] }) => {
      if (result.applied) toast.success(`Applied ${result.applied} change${result.applied === 1 ? "" : "s"} to live data`);
      for (const failure of result.failures) toast.error(failure.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: (ids: string[]) => rejectFn({ data: { ids } }),
    onSuccess: async (result: { rejected: number }) => {
      toast.success(`Rejected ${result.rejected} item${result.rejected === 1 ? "" : "s"} — live data untouched`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = approve.isPending || reject.isPending;
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Review queue</h1>
          <p className="mt-1 text-sm text-steel">
            Proposed changes from the ingestion pipeline land here first. Nothing touches live school
            or program records until you approve it.
          </p>
        </div>
        <p className="meta tabular-nums">{items.length} PENDING</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <label className="block">
          <span className="meta mb-1.5 block">RECORD TYPE</span>
          <select
            value={tableFilter}
            onChange={(event) => setTableFilter(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="all">All</option>
            <option value="universities">Schools</option>
            <option value="programs">Programs</option>
          </select>
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">CONFIDENCE</span>
          <select
            value={confidenceFilter}
            onChange={(event) => setConfidenceFilter(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="all">Any</option>
            <option value="low">Low (&lt; 70%)</option>
            <option value="medium">Medium (70–89%)</option>
            <option value="high">High (90%+)</option>
            <option value="none">No score</option>
          </select>
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">SCOPE</span>
          <select
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="all">Everything</option>
            <option value="field">Field changes</option>
            <option value="new">New records</option>
          </select>
        </label>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="touch-target"
            disabled={busy || !filtered.length}
            onClick={() =>
              setSelected(
                new Set(filtered.filter((i) => band(i.ai_confidence) === "high").map((i) => i.id)),
              )
            }
          >
            Select high confidence
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
            onClick={() => reject.mutate([...selected])}
          >
            <X className="size-4" aria-hidden />
            Reject selected
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-card">
          <p className="font-display text-lg font-bold text-graphite">Nothing to review</p>
          <p className="mt-1 text-sm text-steel">
            Proposed changes appear here once the data-ingestion pipeline runs.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const isLow = band(item.ai_confidence) === "low" || item.ai_confidence == null;
            const open = expanded.has(item.id);
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card shadow-card",
                  isLow ? "border-seam-red/50" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => setSelected((prev) => toggle(prev, item.id))}
                    aria-label="Select proposal"
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="meta">{TABLE_LABEL[item.table_name] ?? item.table_name}</span>
                      {item.record_id ? null : (
                        <span className="rounded-md bg-org-primary/10 px-2 py-0.5 text-xs font-semibold text-org-primary">
                          New record
                        </span>
                      )}
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-seam-red-tint px-2 py-0.5 text-xs font-semibold text-seam-red">
                          <AlertTriangle className="size-3" aria-hidden />
                          Needs scrutiny
                        </span>
                      ) : null}
                      <span className="meta tabular-nums">
                        {item.ai_confidence == null
                          ? "NO SCORE"
                          : `${Math.round(item.ai_confidence * 100)}% CONFIDENCE`}
                      </span>
                    </div>

                    <p className="mt-1 font-semibold text-graphite">
                      {item.recordLabel ?? "New submission"}
                      {item.field_name ? (
                        <span className="font-normal text-steel"> · {fieldLabel(item.field_name)}</span>
                      ) : null}
                    </p>

                    {item.field_name ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border bg-muted/40 p-3">
                          <p className="meta">CURRENT</p>
                          <p className="mt-1 break-words text-sm tabular-nums text-graphite">
                            {display(item.currentValue)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-diamond-green/40 bg-diamond-green-tint p-3">
                          <p className="meta">PROPOSED</p>
                          <p className="mt-1 break-words text-sm font-semibold tabular-nums text-graphite">
                            {display(
                              typeof item.proposed_value === "object" &&
                                item.proposed_value !== null &&
                                item.field_name in (item.proposed_value as Record<string, unknown>)
                                ? (item.proposed_value as Record<string, unknown>)[item.field_name]
                                : item.proposed_value,
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="meta hover:text-graphite"
                          onClick={() => setExpanded((prev) => toggle(prev, item.id))}
                        >
                          {open ? "HIDE PROPOSED RECORD" : "SHOW PROPOSED RECORD"}
                        </button>
                        {open ? (
                          <table className="mt-2 w-full text-sm">
                            <tbody>
                              {Object.entries(
                                (item.proposed_value ?? {}) as Record<string, unknown>,
                              ).map(([key, value]) => (
                                <tr key={key} className="border-b border-border/60">
                                  <td className="py-1.5 pr-3 text-steel">{fieldLabel(key)}</td>
                                  <td className="py-1.5 pr-3 tabular-nums text-graphite">
                                    {display(value)}
                                  </td>
                                  <td className="py-1.5 tabular-nums text-steel">
                                    {item.currentRecord ? display(item.currentRecord[key]) : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                      </div>
                    )}

                    <p className="meta mt-3 flex flex-wrap items-center gap-2">
                      <span>{item.source_type.toUpperCase()}</span>
                      {item.source_url ? (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline hover:text-graphite"
                        >
                          Source
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span>NO SOURCE URL</span>
                      )}
                      <span>· PROPOSED {new Date(item.created_at).toLocaleString()}</span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
                      disabled={busy}
                      onClick={() => approve.mutate([item.id])}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="touch-target"
                      disabled={busy}
                      onClick={() => reject.mutate([item.id])}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
