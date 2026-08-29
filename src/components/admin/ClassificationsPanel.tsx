import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { CLASSIFICATION_FIELDS, titleCase } from "@/lib/admin-schemas";
import { saveClassification } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/form-kit";
import { IntelBlock } from "@/components/brand/DataSignals";

type Classification = {
  id: string;
  classification_type: string;
  value: string | null;
  evidence_text: string | null;
  evidence_source_url: string | null;
  is_staff_overridden: boolean;
  ai_suggested_value: string | null;
};

export function ClassificationsPanel({
  universityId,
  programId,
  classifications,
  invalidateKey,
}: {
  universityId?: string;
  programId?: string;
  classifications: Classification[];
  invalidateKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveClassification);

  const initial: Record<string, { value: string; evidence: string; url: string }> = {};
  for (const field of CLASSIFICATION_FIELDS) {
    const existing = classifications.find((c) => c.classification_type === field.type);
    initial[field.type] = {
      value: existing?.value ?? "",
      evidence: existing?.evidence_text ?? "",
      url: existing?.evidence_source_url ?? "",
    };
  }
  const [draft, setDraft] = useState(initial);

  const mutation = useMutation({
    mutationFn: (input: { type: string; value: string; evidence: string; url: string }) =>
      save({
        data: {
          universityId: universityId ?? null,
          programId: programId ?? null,
          classificationType: input.type,
          value: input.value,
          evidenceText: input.evidence,
          evidenceSourceUrl: input.url,
        },
      }),
    onSuccess: () => {
      toast.success("Classification saved");
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SectionCard
      title="Classifications"
      blurb="Staff judgement, recorded as an override until the Phase 4 AI pipeline suggests values."
    >
      <IntelBlock className="mb-5">
        Everything set here is Power Recruit intelligence, not sourced fact. Each save is stamped as
        staff-overridden with you as the reviewer.
      </IntelBlock>

      <div className="grid gap-5">
        {CLASSIFICATION_FIELDS.map((field) => {
          const state = draft[field.type]!;
          return (
            <div key={field.type} className="rounded-lg border border-border p-4">
              <Label className="text-xs font-semibold tracking-wide text-steel uppercase">
                {field.label}
              </Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                {field.options ? (
                  <select
                    value={state.value}
                    aria-label={field.label}
                    onChange={(event) =>
                      setDraft({ ...draft, [field.type]: { ...state, value: event.target.value } })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={state.value}
                    aria-label={field.label}
                    placeholder="e.g. Tight-knit, faith-forward campus"
                    onChange={(event) =>
                      setDraft({ ...draft, [field.type]: { ...state, value: event.target.value } })
                    }
                  />
                )}
                <Button
                  type="button"
                  className="bg-seam-red text-white hover:bg-seam-red/90"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      type: field.type,
                      value: state.value,
                      evidence: state.evidence,
                      url: state.url,
                    })
                  }
                >
                  Save
                </Button>
              </div>

              <div className="mt-2 grid gap-2">
                <Textarea
                  rows={2}
                  value={state.evidence}
                  aria-label={`Evidence for ${field.label}`}
                  placeholder={
                    field.requiresEvidence
                      ? "Required — what evidence supports this classification?"
                      : "Optional evidence notes"
                  }
                  onChange={(event) =>
                    setDraft({ ...draft, [field.type]: { ...state, evidence: event.target.value } })
                  }
                />
                <Input
                  value={state.url}
                  aria-label={`Evidence source URL for ${field.label}`}
                  placeholder="Evidence source URL (optional)"
                  onChange={(event) =>
                    setDraft({ ...draft, [field.type]: { ...state, url: event.target.value } })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
