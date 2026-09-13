import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";

import { createSchool } from "@/lib/admin.functions";
import {
  PROGRAM_SECTIONS,
  SPORTS,
  UNIVERSITY_SECTIONS,
  titleCase,
} from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  FieldControl,
  SectionCard,
  SectionedFields,
  normalizeSources,
  normalizeValues,
  type Sources,
  type Values,
} from "@/components/admin/form-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/schools/new")({
  component: NewSchool,
});

const STEPS = ["School basics", "Academics & cost", "Programs"] as const;

type ProgramDraft = { sport: string; values: Values };

function NewSchool() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createSchool);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [sources, setSources] = useState<Sources>({});
  const [programs, setPrograms] = useState<ProgramDraft[]>([{ sport: "baseball", values: {} }]);

  const identitySections = UNIVERSITY_SECTIONS.slice(0, 2);
  const detailSections = UNIVERSITY_SECTIONS.slice(2);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          university: normalizeValues(UNIVERSITY_SECTIONS, values),
          sources: normalizeSources(sources),
          programs: programs
            .filter((p) => p.sport)
            .map((p) => ({ ...normalizeValues(PROGRAM_SECTIONS, p.values), sport: p.sport })),
        },
      }),
    onSuccess: async (result: { id: string }) => {
      toast.success("School added");
      await queryClient.invalidateQueries({ queryKey: ["admin-universities"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/universities/$id", params: { id: result.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canAdvance = step > 0 || Boolean(String(values["name"] ?? "").trim());

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-graphite">Add a new school</h1>
        <p className="mt-1 text-sm text-steel">
          Three quick steps. Sourced fields carry a citation so the data stays defensible.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (index < step ? setStep(index) : undefined)}
              className={cn(
                "touch-target flex items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold",
                index === step
                  ? "border-org-primary bg-org-primary text-white"
                  : index < step
                    ? "border-diamond-green bg-diamond-green-tint text-diamond-green"
                    : "border-border bg-card text-steel",
              )}
            >
              {index < step ? <Check className="size-4" aria-hidden /> : <span>{index + 1}</span>}
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <SectionedFields
          sections={identitySections}
          values={values}
          setValues={setValues}
          sources={sources}
          setSources={setSources}
        />
      ) : step === 1 ? (
        <SectionedFields
          sections={detailSections}
          values={values}
          setValues={setValues}
          sources={sources}
          setSources={setSources}
        />
      ) : (
        <div className="grid gap-5">
          {programs.map((program, index) => (
            <SectionCard
              key={index}
              title={`Program ${index + 1}`}
              blurb="Baseball or softball program for this school."
              aside={
                programs.length > 1 ? (
                  <Button
                    variant="outline"
                    className="touch-target"
                    onClick={() => setPrograms(programs.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remove
                  </Button>
                ) : null
              }
            >
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor={`sport-${index}`}
                    className="text-xs font-semibold tracking-wide text-steel uppercase"
                  >
                    Sport
                  </Label>
                  <select
                    id={`sport-${index}`}
                    value={program.sport}
                    onChange={(event) =>
                      setPrograms(
                        programs.map((p, i) =>
                          i === index ? { ...p, sport: event.target.value } : p,
                        ),
                      )
                    }
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {SPORTS.map((sport) => (
                      <option key={sport} value={sport}>
                        {titleCase(sport)}
                      </option>
                    ))}
                  </select>
                </div>
                {PROGRAM_SECTIONS.flatMap((section) => section.fields).map((field) => (
                  <FieldControl
                    key={field.name}
                    field={field}
                    value={program.values[field.name]}
                    onChange={(next) =>
                      setPrograms(
                        programs.map((p, i) =>
                          i === index ? { ...p, values: { ...p.values, [field.name]: next } } : p,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SectionCard>
          ))}

          <Button
            variant="outline"
            className="touch-target justify-self-start"
            onClick={() => setPrograms([...programs, { sport: "softball", values: {} }])}
          >
            <Plus className="size-4" aria-hidden />
            Add another program
          </Button>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        {step === 0 ? (
          <Button asChild variant="outline" className="touch-target">
            <Link to="/admin/universities">Cancel</Link>
          </Button>
        ) : (
          <Button variant="outline" className="touch-target" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}

        {step < STEPS.length - 1 ? (
          <Button
            className="touch-target bg-org-primary text-white hover:bg-org-primary/90"
            disabled={!canAdvance}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button
            className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Create school"}
          </Button>
        )}
      </div>
    </div>
  );
}
