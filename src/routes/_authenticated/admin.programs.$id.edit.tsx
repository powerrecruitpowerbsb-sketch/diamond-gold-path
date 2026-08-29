import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getProgram, saveProgram } from "@/lib/admin.functions";
import { PROGRAM_SECTIONS, titleCase } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { SectionedFields, normalizeValues, type Values } from "@/components/admin/form-kit";
import { ClassificationsPanel } from "@/components/admin/ClassificationsPanel";

export const Route = createFileRoute("/_authenticated/admin/programs/$id/edit")({
  component: EditProgram,
});

function EditProgram() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProgram = useServerFn(getProgram);
  const save = useServerFn(saveProgram);

  const queryKey = ["admin-program", id];
  const { data } = useQuery({ queryKey, queryFn: () => fetchProgram({ data: { id } }) });

  const [values, setValues] = useState<Values | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id,
          values: {
            ...normalizeValues(PROGRAM_SECTIONS, values ?? {}),
            university_id: (data!.program as any).university_id,
            sport: (data!.program as any).sport,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Program saved");
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["admin-programs"] });
      navigate({
        to: "/admin/universities/$id",
        params: { id: (data!.program as any).university_id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  const program = data.program as any;
  const currentValues =
    values ??
    Object.fromEntries(
      PROGRAM_SECTIONS.flatMap((section) =>
        section.fields.map((field) => [field.name, program[field.name]]),
      ),
    );

  return (
    <div className="grid gap-5">
      <div>
        <Link
          to="/admin/universities/$id"
          params={{ id: program.university_id }}
          className="meta hover:text-graphite"
        >
          ← {program.universities?.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-bold text-graphite">
          {titleCase(program.sport)} program
        </h1>
      </div>

      <SectionedFields sections={PROGRAM_SECTIONS} values={currentValues} setValues={setValues} />

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="touch-target">
          <Link to="/admin/universities/$id" params={{ id: program.university_id }}>
            Cancel
          </Link>
        </Button>
        <Button
          className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <ClassificationsPanel
        programId={id}
        classifications={data.classifications as any}
        invalidateKey={queryKey}
      />
    </div>
  );
}
