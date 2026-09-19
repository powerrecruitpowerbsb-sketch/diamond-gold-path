import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteStage, listStages, saveStage } from "@/lib/continuum.functions";
import { SHORTLIST_STATUSES, SHORTLIST_STATUS_LABEL } from "@/lib/shortlist.functions";

/**
 * Stage names belong to the organization: the five defaults can be renamed and
 * reordered, and an organization may add its own wording.
 */
export function StageSettings() {
  const listFn = useServerFn(listStages);
  const saveFn = useServerFn(saveStage);
  const removeFn = useServerFn(deleteStage);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [mapsTo, setMapsTo] = useState<string>("researching");

  const stages = useQuery({ queryKey: ["stages"], queryFn: () => listFn(), retry: false });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["stages"] });
    queryClient.invalidateQueries({ queryKey: ["college-list"] });
  };

  const save = useMutation({
    mutationFn: (input: { id?: string | null; name: string; sortOrder?: number; mapsTo?: string }) =>
      saveFn({ data: input as any }),
    onSuccess: () => {
      toast.success("Saved");
      setName("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Stage removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (stages.data?.stages ?? []) as Record<string, any>[];

  return (
    <section className="mt-4 rounded border border-border bg-card p-4">
      <h2 className="meta text-steel">Stage names for this organization</h2>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Continuum stages</caption>
        <tbody>
          {rows.map((stage) => (
            <tr key={String(stage['id'])} className="h-[38px] border-b border-border last:border-0">
              <td className="pr-3">
                <Input
                  defaultValue={String(stage['name'])}
                  aria-label={`Name for ${String(stage['name'])}`}
                  className="h-7 text-sm"
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== stage['name']) {
                      save.mutate({
                        id: String(stage['id']),
                        name: next,
                        sortOrder: Number(stage['sort_order'] ?? 0),
                      });
                    }
                  }}
                />
              </td>
              <td className="w-20 pr-3">
                <Input
                  type="number"
                  defaultValue={Number(stage['sort_order'] ?? 0)}
                  aria-label={`Order for ${String(stage['name'])}`}
                  className="h-7 text-right text-sm tabular-nums"
                  onBlur={(event) =>
                    save.mutate({
                      id: String(stage['id']),
                      name: String(stage['name']),
                      sortOrder: Number(event.target.value),
                    })
                  }
                />
              </td>
              <td className="meta w-32 text-steel">
                {stage['is_default'] ? "Default stage" : "Added by you"}
              </td>
              <td className="w-24 text-right">
                {stage['is_default'] ? null : (
                  <Button variant="outline" size="sm" onClick={() => remove.mutate(String(stage['id']))}>
                    Remove
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ name, mapsTo, sortOrder: rows.length + 1 });
        }}
      >
        <label className="text-sm">
          <span className="meta block text-steel">New stage</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Campus visit booked"
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="meta block text-steel">Counts as</span>
          <select
            value={mapsTo}
            onChange={(event) => setMapsTo(event.target.value)}
            className="mt-1 h-9 rounded border border-input bg-card px-2 text-sm"
          >
            {SHORTLIST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SHORTLIST_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="touch-target" disabled={!name.trim() || save.isPending}>
          Add stage
        </Button>
      </form>
      <p className="mt-2 text-xs text-steel">
        "Counts as" keeps the dashboard totals honest — a stage you add still reports under one of
        the five standard steps.
      </p>
    </section>
  );
}
