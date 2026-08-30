import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Pencil, PlusCircle, Radar } from "lucide-react";

import { getUniversity, setUniversityMajors } from "@/lib/admin.functions";
import { runUrlDiscovery } from "@/lib/discovery.functions";
import { UNIVERSITY_SECTIONS, titleCase } from "@/lib/admin-schemas";
import { OFFERING_STATUS_LABEL } from "@/lib/program-label";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/form-kit";
import { ClassificationsPanel } from "@/components/admin/ClassificationsPanel";
import { SourceLine, VerifiedChip } from "@/components/brand/DataSignals";

export const Route = createFileRoute("/_authenticated/admin/universities/$id")({
  component: UniversityDetail,
});

function UniversityDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchUniversity = useServerFn(getUniversity);
  const saveMajors = useServerFn(setUniversityMajors);

  const queryKey = ["admin-university", id];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => fetchUniversity({ data: { id } }),
  });

  const [majorDraft, setMajorDraft] = useState<string[] | null>(null);

  const majorsMutation = useMutation({
    mutationFn: (majorIds: string[]) => saveMajors({ data: { universityId: id, majorIds } }),
    onSuccess: () => {
      toast.success("Majors updated");
      setMajorDraft(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discoveryFn = useServerFn(runUrlDiscovery);
  const discover = useMutation({
    mutationFn: () => discoveryFn({ data: { universityId: id } }) as Promise<any>,
    onSuccess: (outcome: any) => {
      if (outcome?.errorMessage) {
        toast.error(outcome.errorMessage);
        return;
      }
      const found = (outcome?.results ?? []).filter((r: any) => r.url).length;
      toast.success(
        found
          ? `${found} link${found === 1 ? "" : "s"} queued for your review`
          : "No links found for this school",
      );
      queryClient.invalidateQueries({ queryKey: ["pending-discoveries-count"] });
      queryClient.invalidateQueries({ queryKey: ["discovered-urls"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });



  if (isPending || !data) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }

  const u = data.university as any;
  const sourceFor = (field: string) => (data.sources as any[]).find((s) => s.field_name === field);
  const assigned = majorDraft ?? data.assignedMajorIds;

  return (
    <div className="grid gap-5">
      <div className="stadium-gradient rounded-xl p-6 sm:p-8">
        <p className="meta text-white/60">{[u.city, u.state].filter(Boolean).join(", ")}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">{u.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {u.public_private ? <Tag>{titleCase(u.public_private)}</Tag> : null}
          {u.school_size_bucket ? <Tag>{titleCase(u.school_size_bucket)}</Tag> : null}
          {u.campus_setting ? <Tag>{titleCase(u.campus_setting)}</Tag> : null}
          {u.undergrad_enrollment ? <Tag>{u.undergrad_enrollment.toLocaleString()} undergrads</Tag> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="touch-target bg-org-accent text-navy-deep hover:bg-org-accent/90">
            <Link to="/admin/universities/$id/edit" params={{ id }}>
              <Pencil className="size-4" aria-hidden />
              Edit school
            </Link>
          </Button>
          {u.website_url ? (
            <Button
              asChild
              variant="outline"
              className="touch-target border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <a href={u.website_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Website
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="touch-target border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            disabled={discover.isPending}
            onClick={() => discover.mutate()}
          >
            <Radar className="size-4" aria-hidden />
            {discover.isPending ? "Finding links…" : "Find links"}
          </Button>
        </div>
      </div>

      {UNIVERSITY_SECTIONS.map((section) => (
        <SectionCard key={section.title} title={section.title} blurb={section.blurb}>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((field) => {
              const source = field.sourced ? sourceFor(field.name) : null;
              const value = u[field.name];
              return (
                <div key={field.name}>
                  <dt className="text-[10px] font-semibold tracking-wide text-steel uppercase">
                    {field.label}
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-2 text-sm tabular text-graphite">
                    {renderValue(value)}
                    {source?.source_url ? <VerifiedChip>Sourced</VerifiedChip> : null}
                  </dd>
                  {source ? (
                    <SourceLine
                      sourceUrl={source.source_url}
                      sourceLabel={source.source_type}
                      lastVerifiedAt={source.last_verified_at}
                    />
                  ) : null}
                </div>
              );
            })}
          </dl>
        </SectionCard>
      ))}

      <SectionCard
        title="Programs (Baseball / Softball)"
        blurb="Every school carries both sport slots. A slot stays unverified until staff confirm the school sponsors that sport."
        aside={
          <Button asChild variant="outline" className="touch-target">
            <Link to="/admin/programs/new" search={{ universityId: id }}>
              <PlusCircle className="size-4" aria-hidden />
              Add program
            </Link>
          </Button>
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {(["baseball", "softball"] as const).map((sport) => {
            const p = (data.programs as any[]).find((row) => row.sport === sport);
            if (!p) {
              return (
                <li
                  key={sport}
                  className="rounded-lg border border-dashed border-border p-4 text-sm text-steel"
                >
                  <h3 className="font-display text-base font-bold text-graphite">
                    {titleCase(sport)}
                  </h3>
                  <p className="mt-1">No slot yet for this sport.</p>
                  <Link
                    to="/admin/programs/new"
                    search={{ universityId: id }}
                    className="mt-2 inline-block text-xs font-semibold text-org-primary hover:underline"
                  >
                    Create {sport} program
                  </Link>
                </li>
              );
            }
            return (
              <li key={p.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-graphite">
                    {titleCase(p.sport)}
                    <span
                      className={`ml-2 rounded-md px-1.5 py-0.5 align-middle text-[11px] font-semibold ${
                        (p.offering_status ?? "unverified") === "verified"
                          ? "bg-diamond-green-tint text-diamond-green"
                          : (p.offering_status ?? "unverified") === "not_offered"
                            ? "bg-seam-red-tint text-seam-red"
                            : "bg-muted text-steel"
                      }`}
                    >
                      {OFFERING_STATUS_LABEL[p.offering_status ?? "unverified"]}
                    </span>
                  </h3>
                  <Link
                    to="/admin/programs/$id"
                    params={{ id: p.id }}
                    className="text-xs font-semibold text-org-primary hover:underline"
                  >
                    Edit
                  </Link>
                </div>
                <p className="mt-1 text-sm text-steel">
                  {[p.governing_body, p.division, p.conference].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-2 text-sm text-graphite">
                  {p.head_coach_name ? `HC ${p.head_coach_name}` : "Head coach TBD"}
                </p>
                <SourceLine sourceUrl={p.coaching_staff_url} lastVerifiedAt={p.last_verified_at} />
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Majors offered" blurb="Assign majors from the shared catalog.">
        {data.allMajors.length === 0 ? (
          <p className="text-sm text-steel">
            No majors in the catalog yet —{" "}
            <Link to="/admin/majors" className="font-semibold text-org-primary hover:underline">
              add some first
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(data.allMajors as any[]).map((major) => {
                const checked = assigned.includes(major.id);
                return (
                  <label
                    key={major.id}
                    className="flex touch-target items-center gap-2.5 rounded-md border border-border px-3 text-sm text-graphite"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setMajorDraft(
                          event.target.checked
                            ? [...assigned, major.id]
                            : assigned.filter((mid) => mid !== major.id),
                        )
                      }
                      className="size-4 accent-[var(--org-primary)]"
                    />
                    {major.name}
                  </label>
                );
              })}
            </div>
            {majorDraft ? (
              <div className="mt-4 flex gap-2">
                <Button
                  className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
                  disabled={majorsMutation.isPending}
                  onClick={() => majorsMutation.mutate(majorDraft)}
                >
                  Save majors
                </Button>
                <Button variant="outline" className="touch-target" onClick={() => setMajorDraft(null)}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <ClassificationsPanel
        universityId={id}
        classifications={data.classifications as any}
        invalidateKey={queryKey}
      />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-white/12 px-2.5 py-1 text-xs font-semibold text-white">
      {children}
    </span>
  );
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  const text = String(value);
  if (text.startsWith("http")) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer"
        className="truncate text-org-primary underline decoration-dotted underline-offset-2"
      >
        {text.replace(/^https?:\/\/(www\.)?/, "").slice(0, 36)}
      </a>
    );
  }
  return text;
}
