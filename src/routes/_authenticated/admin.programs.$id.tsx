import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getProgram } from "@/lib/admin.functions";
import { titleCase } from "@/lib/admin-schemas";
import { INTEL_FIELD_LABELS } from "@/lib/search-schema";
import {
  addProgramInteraction,
  deleteProgramInteraction,
  deleteProgramIntel,
  getProgramRelationship,
  listProgramIntel,
  listSuperadminStaff,
  saveProgramIntel,
  saveProgramRelationship,
} from "@/lib/intel.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/programs/$id")({
  component: AdminProgramDetail,
});

const FIELD_TYPES = Object.keys(INTEL_FIELD_LABELS);

function AdminProgramDetail() {
  const { id } = Route.useParams();
  const fetchProgram = useServerFn(getProgram);
  const { data } = useQuery({
    queryKey: ["admin-program", id],
    queryFn: () => fetchProgram({ data: { id } }),
  });

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const program = data.program as any;
  const university = (data as any).university ?? program.universities ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/admin/programs"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-org-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All programs
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
          <div>
            <p className="meta">{titleCase(program.sport)} PROGRAM</p>
            <h1 className="font-display text-2xl font-bold text-org-primary">
              {university?.name ?? "Program"}
            </h1>
            <p className="mt-1 text-sm text-steel">
              {[program.governing_body, program.division, program.conference]
                .filter(Boolean)
                .join(" · ") || "No division on file"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/programs/$id" params={{ id }}>
                <ExternalLink className="size-4" aria-hidden />
                Public profile
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/programs/$id/edit" params={{ id }}>
                <Pencil className="size-4" aria-hidden />
                Edit fields
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <IntelSection programId={id} />
      <RelationshipSection programId={id} />
    </div>
  );
}

/* ---------------------------- Intelligence ---------------------------- */

function IntelSection({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listProgramIntel);
  const saveFn = useServerFn(saveProgramIntel);
  const deleteFn = useServerFn(deleteProgramIntel);

  const queryKey = ["admin-intel", programId];
  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { programId } }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldType, setFieldType] = useState(FIELD_TYPES[0]!);
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  const reset = () => {
    setEditingId(null);
    setAdding(false);
    setContent("");
    setFieldType(FIELD_TYPES[0]!);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    // The public profile reads the same rows — refresh it too.
    await queryClient.invalidateQueries({ queryKey: ["program-profile", programId] });
    await queryClient.invalidateQueries({ queryKey: ["program-profile"] });
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: { id: editingId, programId, fieldType, content } }),
    onSuccess: async () => {
      toast.success("Recruiting intelligence saved — live on the public profile");
      reset();
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (rowId: string) => deleteFn({ data: { id: rowId } }),
    onSuccess: async () => {
      toast.success("Entry removed");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const showForm = adding || editingId !== null;

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-seam-red-tint px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-bold text-seam-red">Recruiting Intelligence</h2>
          <p className="text-sm text-graphite/80">
            Staff-written insight. Publishes to the program profile for every signed-in account.
          </p>
        </div>
        {!showForm ? (
          <Button
            onClick={() => {
              reset();
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add insight
          </Button>
        ) : null}
      </header>

      {showForm ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          className="space-y-3 border-b border-border px-5 py-4"
        >
          <label className="block">
            <span className="meta mb-1.5 block">FIELD TYPE</span>
            <select
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value)}
              className="h-11 w-full max-w-sm rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INTEL_FIELD_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="meta mb-1.5 block">CONTENT</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              placeholder="What we know about how this staff recruits…"
              className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:border-org-primary"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Save changes" : "Publish insight"}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="divide-y divide-border">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-steel">
            No intelligence entered yet — the public profile shows an empty state.
          </li>
        ) : null}
        {(rows as any[]).map((row) => (
          <li key={row.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-graphite">
                  {INTEL_FIELD_LABELS[row.field_type] ?? titleCase(row.field_type)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-graphite">{row.content}</p>
                <p className="meta mt-2">
                  Updated {new Date(row.updated_at).toLocaleString()} ·{" "}
                  {row.updated?.name ?? row.updated?.email ?? "unknown editor"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(row.id);
                    setFieldType(row.field_type);
                    setContent(row.content ?? "");
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => remove.mutate(row.id)}
                  className="text-seam-red"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- Relationship CRM -------------------------- */

function RelationshipSection({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const relationshipFn = useServerFn(getProgramRelationship);
  const staffFn = useServerFn(listSuperadminStaff);
  const saveFn = useServerFn(saveProgramRelationship);
  const addFn = useServerFn(addProgramInteraction);
  const deleteFn = useServerFn(deleteProgramInteraction);

  const queryKey = ["admin-relationship", programId];
  const { data } = useQuery({ queryKey, queryFn: () => relationshipFn({ data: { programId } }) });
  const { data: staff = [] } = useQuery({ queryKey: ["superadmin-staff"], queryFn: () => staffFn() });

  const relationship = (data?.relationship ?? null) as any;
  const interactions = (data?.interactions ?? []) as any[];

  const [strength, setStrength] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [lastInteraction, setLastInteraction] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [eventContext, setEventContext] = useState("");
  const [interactionDate, setInteractionDate] = useState("");

  const strengthValue = strength ?? (relationship?.relationship_strength?.toString() ?? "");
  const contactValue = contact ?? (relationship?.primary_contact_staff_id ?? "");
  const lastValue =
    lastInteraction ??
    (relationship?.last_meaningful_interaction_at
      ? String(relationship.last_meaningful_interaction_at).slice(0, 10)
      : "");

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          programId,
          relationshipStrength: strengthValue ? Number(strengthValue) : null,
          primaryContactStaffId: contactValue || null,
          lastMeaningfulInteractionAt: lastValue || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Relationship updated");
      setStrength(null);
      setContact(null);
      setLastInteraction(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logInteraction = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          programId,
          notes,
          eventContext: eventContext || null,
          interactionDate: interactionDate || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Interaction logged");
      setNotes("");
      setEventContext("");
      setInteractionDate("");
      setLastInteraction(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeInteraction = useMutation({
    mutationFn: (rowId: string) => deleteFn({ data: { id: rowId } }),
    onSuccess: async () => {
      toast.success("Interaction removed");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border-2 border-dashed border-org-primary/40 bg-card shadow-card">
      <header className="border-b border-border bg-org-primary/5 px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-org-primary">
          <Lock className="size-4" aria-hidden />
          Internal Relationship — Power Recruit staff only
        </h2>
        <p className="text-sm text-steel">
          Never shown to organizations, parents, or players. Enforced server-side, not just hidden.
        </p>
      </header>

      <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-3">
        <label className="block">
          <span className="meta mb-1.5 block">RELATIONSHIP STRENGTH (1-5)</span>
          <select
            value={strengthValue}
            onChange={(event) => setStrength(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">PRIMARY CONTACT</span>
          <select
            value={contactValue}
            onChange={(event) => setContact(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          >
            <option value="">Unassigned</option>
            {(staff as any[]).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name ?? person.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="meta mb-1.5 block">LAST MEANINGFUL INTERACTION</span>
          <input
            type="date"
            value={lastValue}
            onChange={(event) => setLastInteraction(event.target.value)}
            className="tabular h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
          />
        </label>
        <div className="sm:col-span-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save relationship"}
          </Button>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          logInteraction.mutate();
        }}
        className="space-y-3 border-b border-border px-5 py-4"
      >
        <p className="font-display text-base font-bold text-graphite">Log an interaction</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="meta mb-1.5 block">DATE</span>
            <input
              type="date"
              value={interactionDate}
              onChange={(event) => setInteractionDate(event.target.value)}
              className="tabular h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
            />
          </label>
          <label className="block">
            <span className="meta mb-1.5 block">EVENT CONTEXT</span>
            <input
              value={eventContext}
              onChange={(event) => setEventContext(event.target.value)}
              placeholder="Perfect Game showcase, campus visit…"
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
            />
          </label>
        </div>
        <label className="block">
          <span className="meta mb-1.5 block">NOTES</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:border-org-primary"
          />
        </label>
        <Button type="submit" disabled={logInteraction.isPending}>
          {logInteraction.isPending ? "Saving…" : "Log interaction"}
        </Button>
      </form>

      <ul className="divide-y divide-border">
        {interactions.length === 0 ? (
          <li className="px-5 py-6 text-center text-sm text-steel">No interactions logged yet.</li>
        ) : null}
        {interactions.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="meta">
                <span className="tabular">
                  {new Date(row.interaction_date).toLocaleDateString()}
                </span>
                {row.event_context ? ` · ${row.event_context}` : ""} ·{" "}
                {row.users?.name ?? row.users?.email ?? "staff"}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-graphite">{row.notes}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn("text-seam-red")}
              onClick={() => removeInteraction.mutate(row.id)}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
