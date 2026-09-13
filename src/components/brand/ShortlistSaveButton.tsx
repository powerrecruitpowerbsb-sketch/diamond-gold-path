import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookmarkCheck, BookmarkPlus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SHORTLIST_STATUS_LABEL,
  listAthletePicker,
  saveSchoolToShortlist,
  type ShortlistStatus,
} from "@/lib/shortlist.functions";
import { cn } from "@/lib/utils";

type Props = {
  programId: string;
  /** When set, saves straight to this athlete (athlete-context flow). */
  athleteId?: string | undefined;
  athleteName?: string | undefined;
  size?: "sm" | "md";
  /** Compact square icon button — used inside dense tables where the label would shout. */
  iconOnly?: boolean;
  className?: string;
};

export function ShortlistSaveButton({
  programId,
  athleteId,
  athleteName,
  size = "sm",
  iconOnly = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const pickerFn = useServerFn(listAthletePicker);
  const saveFn = useServerFn(saveSchoolToShortlist);

  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    staleTime: 30_000,
    retry: false,
  });

  const savedStatus = useMemo<ShortlistStatus | null>(() => {
    if (!athleteId) return null;
    const match = (picker.data?.saved ?? []).find(
      (row) => row.org_athlete_id === athleteId && row.program_id === programId,
    );
    return (match?.status as ShortlistStatus) ?? null;
  }, [athleteId, picker.data, programId]);

  const athletes = useMemo(() => {
    const rows = (picker.data?.athletes ?? []) as Record<string, any>[];
    const needle = term.trim().toLowerCase();
    return needle
      ? rows.filter((row) => String(row['name'] ?? "").toLowerCase().includes(needle))
      : rows;
  }, [picker.data, term]);

  const savedProgramIdsByAthlete = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of picker.data?.saved ?? []) {
      if (row.program_id === programId) map.set(row.org_athlete_id, row.status);
    }
    return map;
  }, [picker.data, programId]);

  async function save(targetId: string, targetName?: string) {
    setBusy(true);
    try {
      const result = await saveFn({ data: { athleteId: targetId, programId } });
      await queryClient.invalidateQueries({ queryKey: ["athlete-picker"] });
      await queryClient.invalidateQueries({ queryKey: ["org-athlete", targetId] });
      await queryClient.invalidateQueries({ queryKey: ["org-dashboard"] });
      toast.success(
        result.created
          ? `Saved to ${targetName ?? "shortlist"} — Researching`
          : `Already on ${targetName ?? "that"} shortlist (${SHORTLIST_STATUS_LABEL[result.status as ShortlistStatus] ?? result.status})`,
      );
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const firstName = (athleteName ?? "").split(" ")[0];
  const label = savedStatus
    ? `Saved · ${SHORTLIST_STATUS_LABEL[savedStatus]}`
    : athleteId
      ? `Save to ${firstName || "athlete"}`
      : "Save to shortlist";

  return (
    <>
      <button
        type="button"
        disabled={busy || Boolean(savedStatus)}
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (athleteId) void save(athleteId, athleteName);
          else setOpen(true);
        }}
        className={cn(
          "inline-flex items-center justify-center transition-colors",
          iconOnly
            ? cn(
                "size-8 rounded border",
                savedStatus
                  ? "border-diamond-green/30 bg-diamond-green-tint text-diamond-green"
                  : "border-border text-org-primary hover:bg-muted",
              )
            : cn(
                "touch-target gap-2 rounded-xl border px-3 text-sm font-semibold",
                savedStatus
                  ? "border-diamond-green/30 bg-diamond-green-tint text-diamond-green"
                  : "border-seam-red bg-seam-red text-white hover:bg-seam-red/90",
                size === "sm" && "h-11",
              ),
          className,
        )}
      >
        {savedStatus ? (
          <BookmarkCheck className="size-4" aria-hidden />
        ) : (
          <BookmarkPlus className="size-4" aria-hidden />
        )}
        {iconOnly ? null : label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-graphite">
              Save to which athlete?
            </DialogTitle>
            <DialogDescription className="text-sm text-steel">
              The school is added to that athlete&apos;s shortlist as{" "}
              <span className="font-semibold text-graphite">Researching</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search athletes…"
              className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus:border-org-primary"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {picker.isPending ? (
              <p className="p-4 text-sm text-steel">Loading athletes…</p>
            ) : athletes.length === 0 ? (
              <p className="p-4 text-sm text-steel">No athletes match.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {athletes.map((athlete) => {
                  const already = savedProgramIdsByAthlete.get(athlete['id'] as string);
                  return (
                    <li key={athlete['id']}>
                      <button
                        type="button"
                        disabled={busy || Boolean(already)}
                        onClick={() => void save(athlete['id'] as string, String(athlete['name']))}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-chalk disabled:opacity-60"
                      >
                        <span className="font-semibold text-graphite">{athlete['name']}</span>
                        <span className="font-mono text-[11px] text-steel tabular-nums">
                          {athlete['grad_year'] ?? "—"}
                          {athlete['primary_position'] ? ` · ${athlete['primary_position']}` : ""}
                        </span>
                        <span className="ml-auto text-[11px] font-semibold text-diamond-green">
                          {already ? SHORTLIST_STATUS_LABEL[already as ShortlistStatus] : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
