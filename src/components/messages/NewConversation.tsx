import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listAthletePicker } from "@/lib/shortlist.functions";
import { newThreadSchools, openThread } from "@/lib/messaging.functions";
import { cn } from "@/lib/utils";

type Athlete = { id: string; name: string; grad_year?: number | null; primary_position?: string | null; sport?: string | null };

export function NewConversation({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted: (threadId: string) => void;
}) {
  const pickerFn = useServerFn(listAthletePicker);
  const schoolsFn = useServerFn(newThreadSchools);
  const openFn = useServerFn(openThread);

  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [aq, setAq] = useState("");
  const [sq, setSq] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(sq.trim()), 250);
    return () => clearTimeout(t);
  }, [sq]);

  useEffect(() => {
    if (!open) {
      setAthleteId(null);
      setAq("");
      setSq("");
    }
  }, [open]);

  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    enabled: open,
  });
  const athletes = (picker.data?.athletes ?? []) as Athlete[];

  // Families with one athlete skip straight to schools.
  useEffect(() => {
    if (open && !athleteId && athletes.length === 1) setAthleteId(athletes[0]!.id);
  }, [open, athleteId, athletes]);

  const athlete = athletes.find((a) => a.id === athleteId) ?? null;
  const savedIds = useMemo(
    () => (picker.data?.saved ?? []).filter((s) => s.org_athlete_id === athleteId).map((s) => s.program_id),
    [picker.data, athleteId],
  );

  const schools = useQuery({
    queryKey: ["new-thread-schools", athleteId, savedIds.join(","), debounced],
    queryFn: () => schoolsFn({ data: { ids: savedIds, q: debounced, sport: athlete?.sport ?? null } }),
    enabled: open && !!athleteId,
  });

  const start = useMutation({
    mutationFn: (programId: string | null) => openFn({ data: { athleteId: athleteId!, programId } }),
    onSuccess: (r) => {
      onOpenChange(false);
      onStarted(r.threadId);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't start conversation"),
  });

  const filteredAthletes = athletes.filter((a) => a.name.toLowerCase().includes(aq.trim().toLowerCase()));
  const list = debounced.length >= 2 ? schools.data?.results ?? [] : schools.data?.saved ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-md">
        <div className="h-1 w-full bg-org-primary" />
        <DialogHeader className="px-5 pt-3">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-bold text-org-primary">
            {athlete && athletes.length > 1 ? (
              <button type="button" onClick={() => setAthleteId(null)} aria-label="Back" className="text-steel hover:text-foreground">
                <ArrowLeft className="size-4" />
              </button>
            ) : null}
            New message
          </DialogTitle>
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel uppercase">
            {athlete ? `${athlete.name} · School` : "Player"}
          </p>
        </DialogHeader>

        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
            {athlete ? (
              <Input autoFocus value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Search any school" className="pl-9" aria-label="Search schools" />
            ) : (
              <Input autoFocus value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search players" className="pl-9" aria-label="Search players" />
            )}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-4">
          {!athlete ? (
            picker.isPending ? (
              <Loading />
            ) : filteredAthletes.length === 0 ? (
              <Empty text="No players" />
            ) : (
              <ul>
                {filteredAthletes.map((a) => (
                  <li key={a.id}>
                    <Row onClick={() => setAthleteId(a.id)} title={a.name} meta={[a.primary_position, a.grad_year ? `’${String(a.grad_year).slice(2)}` : null, a.sport].filter(Boolean).join(" · ")} />
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {debounced.length < 2 ? (
                <Row
                  disabled={start.isPending}
                  onClick={() => start.mutate(null)}
                  title="Recruiting strategy"
                  meta="General · no school"
                />
              ) : null}
              <p className="px-3 pt-1 pb-2 font-mono text-[10px] tracking-[0.2em] text-steel uppercase">
                {debounced.length >= 2 ? "Results" : "My Colleges"}
              </p>
              {schools.isPending ? (
                <Loading />
              ) : list.length === 0 ? (
                <Empty text={debounced.length >= 2 ? "No schools found" : "No saved schools — search above"} />
              ) : (
                <ul>
                  {list.map((s) => (
                    <li key={s.id}>
                      <Row
                        disabled={start.isPending}
                        onClick={() => start.mutate(s.id)}
                        title={s.name}
                        meta={[s.division, s.state, s.sport].filter(Boolean).join(" · ")}
                        busy={start.isPending && start.variables === s.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ title, meta, onClick, disabled, busy }: { title: string; meta?: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-60")}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        {meta ? <span className="block truncate font-mono text-[10px] tracking-wide text-steel uppercase">{meta}</span> : null}
      </span>
      {busy ? <Loader2 className="size-4 animate-spin text-steel" /> : null}
    </button>
  );
}

function Loading() {
  return (
    <div className="space-y-2 p-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-6 text-center text-sm text-steel">{text}</p>;
}
