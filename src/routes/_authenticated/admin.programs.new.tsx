import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";

import { listUniversityOptions, saveProgram } from "@/lib/admin.functions";
import { PROGRAM_SECTIONS, SPORTS, titleCase } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionedFields, normalizeValues, type Values } from "@/components/admin/form-kit";

export const Route = createFileRoute("/_authenticated/admin/programs/new")({
  validateSearch: z.object({ universityId: z.string().optional() }),
  component: NewProgram,
});

function NewProgram() {
  const { universityId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(listUniversityOptions);
  const save = useServerFn(saveProgram);

  const { data: options } = useQuery({
    queryKey: ["admin-university-options"],
    queryFn: () => fetchOptions(),
  });

  const [values, setValues] = useState<Values>({});
  const [uniId, setUniId] = useState(universityId ?? "");
  const [sport, setSport] = useState<string>("baseball");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          values: {
            ...normalizeValues(PROGRAM_SECTIONS, values),
            university_id: uniId,
            sport,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Program added");
      await queryClient.invalidateQueries({ queryKey: ["admin-programs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-university", uniId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/universities/$id", params: { id: uniId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-5">
      <h1 className="font-display text-2xl font-bold text-graphite">Add a program</h1>

      <SectionCard title="Program placement" blurb="Attach this program to an existing school.">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="university" className="text-xs font-semibold tracking-wide text-steel uppercase">
              School
            </Label>
            <select
              id="university"
              value={uniId}
              onChange={(event) => setUniId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a school…</option>
              {((options ?? []) as any[]).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.state ? ` (${option.state})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="sport" className="text-xs font-semibold tracking-wide text-steel uppercase">
              Sport
            </Label>
            <select
              id="sport"
              value={sport}
              onChange={(event) => setSport(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionedFields sections={PROGRAM_SECTIONS} values={values} setValues={setValues} />

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="touch-target">
          <Link to="/admin/programs">Cancel</Link>
        </Button>
        <Button
          className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
          disabled={!uniId || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Create program"}
        </Button>
      </div>
    </div>
  );
}
