import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setCoachManually } from "@/lib/pipeline.functions";

/**
 * When we know the coach and the pipeline doesn't, type it in. A name entered by
 * a person is marked as coming from a person, and a page that disagrees later
 * comes back as something to confirm rather than overwriting it silently.
 */
export function ManualCoach({
  programId,
  currentName,
}: {
  programId: string;
  currentName?: string | null;
}) {
  const saveFn = useServerFn(setCoachManually);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const save = useMutation({
    mutationFn: () => saveFn({ data: { programId, name, sourceUrl: sourceUrl || null } }),
    onSuccess: (result: any) => {
      toast.success(`Head coach set to ${result.name}.`);
      setName("");
      setSourceUrl("");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-graphite">Head coach</h2>
      <p className="mt-1 text-sm text-steel">
        On file: <span className="font-semibold text-graphite">{currentName || "nobody yet"}</span>. Type
        in the coach you know and it stays put — automatic collection won't replace it.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-semibold text-graphite">Coach's name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Rich Wallace"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-graphite">Where it came from (optional)</span>
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <Button
        className="mt-3"
        disabled={!name.trim() || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save coach"}
      </Button>
    </section>
  );
}
