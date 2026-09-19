import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getSchoolActivity,
  setActivityNote,
  toggleActivityChip,
} from "@/lib/activity.functions";
import { ACTIVITY_GROUPS, chipTone } from "@/lib/athlete-activity";
import { cn } from "@/lib/utils";

/**
 * Tap to record what happened with this school. No forms: a chip is on or off,
 * and a note only appears if there's a date or a piece of coach feedback worth
 * keeping.
 */
export function ActivityChips({
  entryId,
  onChanged,
}: {
  entryId: string | null;
  onChanged?: () => void;
}) {
  const activityFn = useServerFn(getSchoolActivity);
  const toggleFn = useServerFn(toggleActivityChip);
  const noteFn = useServerFn(setActivityNote);
  const queryClient = useQueryClient();
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const activity = useQuery({
    queryKey: ["school-activity", entryId],
    queryFn: () => activityFn({ data: { entryId: entryId! } }),
    enabled: Boolean(entryId),
    retry: false,
  });

  const chips = new Set(activity.data?.chips ?? []);
  const notes = (activity.data?.notes ?? {}) as Record<string, string>;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["school-activity", entryId] });
    queryClient.invalidateQueries({ queryKey: ["college-list"] });
    queryClient.invalidateQueries({ queryKey: ["family-portal"] });
    onChanged?.();
  };

  const toggle = useMutation({
    mutationFn: (input: { chipId: string; on: boolean }) =>
      toggleFn({ data: { entryId: entryId!, ...input } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const saveNote = useMutation({
    mutationFn: (input: { chipId: string; note: string }) =>
      noteFn({ data: { entryId: entryId!, chipId: input.chipId, note: input.note || null } }),
    onSuccess: () => {
      toast.success("Saved");
      setOpenNote(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!entryId) {
    return (
      <p className="rounded border border-border p-4 text-sm text-steel">
        Add this school to an athlete's list to start tracking activity.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-steel">
        Tap anything that's happened. Coaches and family see the same picture, so there's no need
        to ask where things stand.
      </p>

      {ACTIVITY_GROUPS.map((group) => (
        <section key={group.id}>
          <h4 className="meta text-steel">{group.title}</h4>
          <p className="mt-0.5 text-xs text-steel">{group.hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.chips.map((chip) => {
              const on = chips.has(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  disabled={activity.isPending || toggle.isPending}
                  onClick={() => toggle.mutate({ chipId: chip.id, on: !on })}
                  className={cn(
                    "touch-target rounded-full border px-3 text-[13px] font-semibold transition",
                    on
                      ? chipTone(chip.id)
                      : "border-dashed border-border text-steel hover:border-org-primary hover:text-graphite",
                  )}
                  aria-pressed={on}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {group.chips
              .filter((chip) => chips.has(chip.id))
              .map((chip) => (
                <button
                  key={`note-${chip.id}`}
                  type="button"
                  onClick={() => {
                    setOpenNote(openNote === chip.id ? null : chip.id);
                    setDraft(notes[chip.id] ?? "");
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] font-semibold text-steel hover:border-org-primary hover:text-graphite"
                >
                  <StickyNote className="size-3" aria-hidden />
                  {notes[chip.id] ? `${chip.label}: ${notes[chip.id]}` : `Add a note · ${chip.label}`}
                </button>
              ))}
          </div>

          {openNote && group.chips.some((chip) => chip.id === openNote) ? (
            <div className="mt-2 rounded border border-border p-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Dates, who you spoke to, what they said."
              />
              <div className="mt-2 flex gap-2">
                <Button
                  className="touch-target"
                  disabled={saveNote.isPending}
                  onClick={() => saveNote.mutate({ chipId: openNote, note: draft.trim() })}
                >
                  Save note
                </Button>
                <Button variant="outline" className="touch-target" onClick={() => setOpenNote(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
