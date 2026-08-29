import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { getUniversity, saveUniversity } from "@/lib/admin.functions";
import { UNIVERSITY_SECTIONS } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import {
  SectionedFields,
  normalizeSources,
  normalizeValues,
  type Sources,
  type Values,
} from "@/components/admin/form-kit";

export const Route = createFileRoute("/_authenticated/admin/universities/$id_/edit")({
  component: EditUniversity,
});

function EditUniversity() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUniversity = useServerFn(getUniversity);
  const save = useServerFn(saveUniversity);

  const { data } = useQuery({
    queryKey: ["admin-university", id],
    queryFn: () => fetchUniversity({ data: { id } }),
  });

  const [values, setValues] = useState<Values | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id,
          values: normalizeValues(UNIVERSITY_SECTIONS, values ?? {}),
          sources: normalizeSources(sources ?? {}),
        },
      }),
    onSuccess: async () => {
      toast.success("School saved");
      await queryClient.invalidateQueries({ queryKey: ["admin-university", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-universities"] });
      navigate({ to: "/admin/universities/$id", params: { id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  const currentValues =
    values ??
    (() => {
      const seed: Values = {};
      for (const section of UNIVERSITY_SECTIONS) {
        for (const field of section.fields) seed[field.name] = (data.university as any)[field.name];
      }
      return seed;
    })();

  const currentSources =
    sources ??
    (() => {
      const seed: Sources = {};
      for (const row of data.sources as any[]) {
        seed[row.field_name] = {
          source_url: row.source_url ?? "",
          source_type: row.source_type ?? "official",
          last_verified_at: row.last_verified_at ?? "",
        };
      }
      return seed;
    })();

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/admin/universities/$id"
            params={{ id }}
            className="meta inline-flex items-center gap-1 hover:text-graphite"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Back to school
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold text-graphite">
            Edit {(data.university as any).name}
          </h1>
        </div>
        <Button
          className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <SectionedFields
        sections={UNIVERSITY_SECTIONS}
        values={currentValues}
        setValues={setValues}
        sources={currentSources}
        setSources={setSources}
      />

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="touch-target">
          <Link to="/admin/universities/$id" params={{ id }}>
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
    </div>
  );
}
