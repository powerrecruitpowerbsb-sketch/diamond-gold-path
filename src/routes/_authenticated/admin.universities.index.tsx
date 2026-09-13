import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, PlusCircle, Search } from "lucide-react";

import { listUniversities } from "@/lib/admin.functions";
import { CAMPUS_SETTINGS, PUBLIC_PRIVATE, SCHOOL_SIZE_BUCKETS, titleCase } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedChip } from "@/components/brand/DataSignals";

export const Route = createFileRoute("/_authenticated/admin/universities/")({
  component: UniversitiesList,
});

function UniversitiesList() {
  const fetchUniversities = useServerFn(listUniversities);
  const { data, isPending } = useQuery({
    queryKey: ["admin-universities"],
    queryFn: () => fetchUniversities(),
  });

  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [size, setSize] = useState("");
  const [setting, setSetting] = useState("");
  const [type, setType] = useState("");

  const states = useMemo(
    () => [...new Set(((data ?? []) as any[]).map((u) => u.state).filter(Boolean))].sort(),
    [data],
  );

  const rows = ((data ?? []) as any[]).filter((u) => {
    if (search && !u.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (state && u.state !== state) return false;
    if (size && u.school_size_bucket !== size) return false;
    if (setting && u.campus_setting !== setting) return false;
    if (type && u.public_private !== type) return false;
    return true;
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Schools</h1>
          <p className="mt-1 text-sm text-steel">
            {rows.length} of {(data ?? []).length} schools
          </p>
        </div>
        <Button asChild className="touch-target bg-seam-red text-white hover:bg-seam-red/90">
          <Link to="/admin/schools/new">
            <PlusCircle className="size-4" aria-hidden />
            Add a new school
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 rounded border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search school name"
            aria-label="Search school name"
            className="pl-9"
          />
        </div>
        <FilterSelect label="State" value={state} onChange={setState} options={states} />
        <FilterSelect label="Size" value={size} onChange={setSize} options={[...SCHOOL_SIZE_BUCKETS]} />
        <FilterSelect label="Setting" value={setting} onChange={setSetting} options={[...CAMPUS_SETTINGS]} />
        <FilterSelect label="Type" value={type} onChange={setType} options={[...PUBLIC_PRIVATE]} />
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded border border-border bg-card p-8 text-center text-sm text-steel">
          No schools match those filters.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((u) => (
            <Link
              key={u.id}
              to="/admin/universities/$id"
              params={{ id: u.id }}
              className="group rounded border border-border bg-card p-5 "
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-graphite group-hover:text-org-primary">
                  {u.name}
                </h2>
                {u.public_private ? (
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-steel uppercase">
                    {u.public_private}
                  </span>
                ) : null}
              </div>

              <p className="mt-1 flex items-center gap-1 text-sm text-steel">
                <MapPin className="size-3.5" aria-hidden />
                {[u.city, u.state].filter(Boolean).join(", ") || "Location TBD"}
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <Stat label="Enrollment" value={fmt(u.undergrad_enrollment)} />
                <Stat label="Avg GPA" value={u.avg_gpa ?? "—"} />
                <Stat label="Accept %" value={pct(u.acceptance_rate)} />
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(u.programs ?? []).map((p: any) => (
                  <span
                    key={p.id}
                    className="rounded-md bg-org-accent/18 px-2 py-1 text-[11px] font-semibold text-navy-deep"
                  >
                    {titleCase(p.sport)}
                    {p.division ? ` · ${p.division}` : ""}
                  </span>
                ))}
                {u.est_net_price ? <VerifiedChip>Net price on file</VerifiedChip> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-wide text-steel uppercase">{label}</dt>
      <dd className="font-display text-base font-bold tabular text-graphite">{value}</dd>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
    >
      <option value="">{label}: any</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {titleCase(option)}
        </option>
      ))}
    </select>
  );
}

function fmt(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

/** Acceptance rates are stored as fractions (0.29) or whole percents (29). */
function pct(value: number | null) {
  if (value == null) return "—";
  const asPercent = value <= 1 ? value * 100 : value;
  return `${Math.round(asPercent)}%`;
}
