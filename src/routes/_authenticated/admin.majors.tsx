import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { deleteMajor, listMajors, saveMajor } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/admin/form-kit";

export const Route = createFileRoute("/_authenticated/admin/majors")({
  component: MajorsScreen,
});

function MajorsScreen() {
  const queryClient = useQueryClient();
  const fetchMajors = useServerFn(listMajors);
  const save = useServerFn(saveMajor);
  const remove = useServerFn(deleteMajor);

  const queryKey = ["admin-majors"];
  const { data } = useQuery({ queryKey, queryFn: () => fetchMajors() });

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: { id?: string | null; name: string }) => save({ data: input }),
    onSuccess: async () => {
      toast.success("Major saved");
      setNewName("");
      setEditing(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Major removed");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold text-graphite">Majors catalog</h1>
        <p className="mt-1 text-sm text-steel">
          One shared list. Assign majors to schools from each school's page.
        </p>
      </div>

      <SectionCard title="Add a major">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({ name: newName });
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g. Kinesiology"
            aria-label="New major name"
            className="max-w-xs"
          />
          <Button
            type="submit"
            className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
            disabled={!newName.trim() || saveMutation.isPending}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Catalog" blurb={`${(data ?? []).length} majors`}>
        {(data ?? []).length === 0 ? (
          <p className="text-sm text-steel">No majors yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {((data ?? []) as any[]).map((major) => (
              <li key={major.id} className="flex flex-wrap items-center gap-3 py-2.5">
                {editing?.id === major.id ? (
                  <>
                    <Input
                      value={editing?.name ?? ""}
                      onChange={(event) => setEditing({ id: major.id, name: event.target.value })}
                      aria-label={`Rename ${major.name}`}
                      className="max-w-xs"
                    />
                    <Button
                      className="touch-target bg-org-primary text-white hover:bg-org-primary/90"
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate({ id: major.id, name: editing?.name ?? "" })}
                    >
                      Save
                    </Button>
                    <Button variant="outline" className="touch-target" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-graphite">{major.name}</span>
                    <span className="meta">
                      {major.universityCount} school{major.universityCount === 1 ? "" : "s"}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button
                        variant="outline"
                        className="touch-target"
                        onClick={() => setEditing({ id: major.id, name: major.name })}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="outline"
                        className="touch-target text-seam-red hover:text-seam-red"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(major.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
