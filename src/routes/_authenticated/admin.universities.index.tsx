import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusCircle, Search } from "lucide-react";

import { listUniversities } from "@/lib/admin.functions";
import { CAMPUS_SETTINGS, PUBLIC_PRIVATE, SCHOOL_SIZE_BUCKETS, titleCase } from "@/lib/admin-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/console/PageHeader";
import { RecordTable } from "@/components/console/RecordTable";

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
    <>
      <PageHeader
        title="Schools"
        description="Academics, cost and identity. A team's division and conference live on the team, not here."
        counts={[
          `${rows.length.toLocaleString("en-US")} shown`,
          `${((data ?? []) as any[]).length.toLocaleString("en-US")} on file`,
        ]}
        actions={
          <Button asChild className="touch-target bg-seam-red text-white hover:bg-seam-red/90">
            <Link to="/admin/schools/new">
              <PlusCircle className="size-4" aria-hidden />
              Add a new school
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
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
        <div className="h-64 animate-pulse rounded border border-border bg-card" />
      ) : (
        <RecordTable
          rows={rows}
          rowKey={(row) => row.id}
          empty="No schools match those filters."
          caption="Schools"
          columns={[
            {
              header: "School",
              cell: (row) => (
                <Link
                  to="/admin/universities/$id"
                  params={{ id: row.id }}
                  className="font-semibold text-org-primary underline-offset-2 hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            { header: "City", cell: (row) => row.city ?? "—" },
            { header: "State", cell: (row) => row.state ?? "—" },
            { header: "Type", cell: (row) => (row.public_private ? titleCase(row.public_private) : "—") },
            {
              header: "Teams",
              cell: (row) =>
                (row.programs ?? []).length
                  ? (row.programs ?? [])
                      .map((p: any) => `${titleCase(p.sport)}${p.division ? ` ${p.division}` : ""}`)
                      .join(", ")
                  : "—",
            },
            { header: "Enrollment", numeric: true, cell: (row) => fmt(row.undergrad_enrollment) },
            { header: "Avg GPA", numeric: true, cell: (row) => row.avg_gpa ?? "—" },
            { header: "Accept", numeric: true, cell: (row) => pct(row.acceptance_rate) },
            { header: "Net price", numeric: true, cell: (row) => money(row.est_net_price) },
          ]}
        />
      )}
    </>
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
      className="h-10 rounded border border-input bg-background px-2.5 text-sm"
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
  return value == null ? "—" : value.toLocaleString("en-US");
}

function money(value: number | null) {
  return value == null ? "—" : `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Acceptance rates are stored as fractions (0.29) or whole percents (29). */
function pct(value: number | null) {
  if (value == null) return "—";
  const asPercent = value <= 1 ? value * 100 : value;
  return `${Math.round(asPercent)}%`;
}
