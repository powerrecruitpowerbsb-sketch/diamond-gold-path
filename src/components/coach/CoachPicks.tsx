import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Star } from "lucide-react";
import { toast } from "sonner";

import {
  findProgramsForAthlete,
  listCoachPicks,
  recommendSchool,
  updateCoachPick,
} from "@/lib/coach-picks.functions";

type Pick = { id: string; name: string; state: string | null; level?: string };

export function CoachPicks({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCoachPicks);
  const findFn = useServerFn(findProgramsForAthlete);
  const recFn = useServerFn(recommendSchool);
  const updFn = useServerFn(updateCoachPick);

  const list = useQuery({ queryKey: ["coach-picks", athleteId], queryFn: () => listFn({ data: { athleteId } }) });
  const [q, setQ] = useState("");
  const found = useQuery({
    queryKey: ["coach-pick-find", athleteId, q],
    queryFn: () => findFn({ data: { athleteId, q } }),
    enabled: q.trim().length >= 2,
  });
  const [chosen, setChosen] = useState<Pick | null>(null);
  const [message, setMessage] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["coach-picks", athleteId] });
  const reset = () => { setChosen(null); setQ(""); setMessage(""); setStaffNote(""); setEditing(null); };

  async function save() {
    setBusy(true);
    try {
      if (editing) await updFn({ data: { id: editing, message, staffNote } });
      else if (chosen) await recFn({ data: { athleteId, programId: chosen.id, message, staffNote } });
      toast.success(editing ? "Pick updated" : "Added to the player's list as a coach pick");
      reset();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unpick(id: string) {
    try {
      await updFn({ data: { id, unpick: true } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const schools = list.data?.schools ?? [];
  const picks = schools.filter((s) => s.pickedBy);
  const others = schools.filter((s) => !s.pickedBy);
  const formOpen = !!chosen || !!editing;

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-graphite">Picks</h2>
      <p className="mt-1 text-sm text-steel">
        Put a college on this player's list. They see it marked "Coach pick" with your message.
      </p>

      {!formOpen ? (
        <div className="mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a college by name"
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          {found.data?.results.length ? (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {found.data.results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(r)}
                    className="touch-target flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="font-medium text-graphite">{r.name}</span>
                    <span className="font-mono text-[11px] text-steel">{[r.level, r.state].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : q.trim().length >= 2 && !found.isFetching ? (
            <p className="mt-2 text-sm text-steel">No match.</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3 rounded-lg border border-org-primary/40 p-4">
          <p className="font-semibold text-graphite">
            {editing ? schools.find((s) => s.id === editing)?.name : chosen?.name}
          </p>
          <label className="block text-sm">
            <span className="text-steel">Message to the player (they see this)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="inline-flex items-center gap-1 text-steel"><Lock className="size-3.5" /> Staff note (only staff see this)</span>
            <textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save}
              className="touch-target rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60">
              {editing ? "Save" : "Add as coach pick"}
            </button>
            <button type="button" onClick={reset} className="touch-target rounded-lg border border-border px-4 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {picks.length ? (
        <ul className="mt-5 divide-y divide-border">
          {picks.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-graphite">
                    <Star className="size-3.5 text-org-primary" /> {s.name}
                  </p>
                  <p className="text-xs text-steel">Picked by {s.pickedBy} · {s.status}</p>
                  {s.message ? <p className="mt-1 text-sm text-graphite">“{s.message}”</p> : null}
                  {s.staffNote ? (
                    <p className="mt-1 inline-flex items-start gap-1 text-sm text-steel"><Lock className="mt-0.5 size-3.5 shrink-0" /> {s.staffNote}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button type="button" className="text-org-primary" onClick={() => {
                    setEditing(s.id); setMessage(s.message ?? ""); setStaffNote(s.staffNote ?? "");
                  }}>Edit</button>
                  <button type="button" className="text-steel" onClick={() => unpick(s.id)}>Unpick</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-steel">No coach picks yet.</p>
      )}

      {others.length ? (
        <p className="mt-3 text-xs text-steel">
          Also on their list: {others.map((s) => s.name).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
