import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { getCollegeDataSnapshot, getMyProfile } from "@/lib/college-data.functions";
import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { SourceLine, VerifiedChip } from "@/components/brand/DataSignals";
import { Card } from "@/components/ui/card";

const profileQuery = queryOptions({
  queryKey: ["my-profile"],
  queryFn: () => getMyProfile(),
});

const snapshotQuery = queryOptions({
  queryKey: ["college-data-snapshot"],
  queryFn: () => getCollegeDataSnapshot(),
});

export const Route = createFileRoute("/_authenticated/admin/data")({
  head: () => ({
    meta: [
      { title: "Internal data check — Power Recruit" },
      {
        name: "description",
        content:
          "Internal Power Recruit screen listing universities and athletic programs to confirm the college database.",
      },
      { property: "og:title", content: "Internal data check — Power Recruit" },
      {
        property: "og:description",
        content: "Universities and programs in the Power Recruit shared college database.",
      },
    ],
  }),
  component: AdminDataPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <Card className="rounded-xl border-0 p-6 shadow-card">
        <h1 className="text-lg font-semibold">Couldn't load the database</h1>
        <p className="mt-2 text-sm text-steel">{error.message}</p>
      </Card>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-sm text-steel">Nothing here.</p>
    </AppShell>
  ),
});

const num = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `$${Math.round(value).toLocaleString("en-US")}`;

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;

function AdminDataPage() {
  const profile = useQuery(profileQuery);
  const isSuperadmin = profile.data?.isSuperadmin ?? false;
  const snapshot = useQuery({ ...snapshotQuery, enabled: isSuperadmin });

  if (profile.isLoading) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="text-sm text-steel">Loading…</p>
      </AppShell>
    );
  }

  if (!isSuperadmin) {
    return (
      <AppShell right={<AuthButton />}>
        <Card className="mx-auto max-w-lg rounded-xl border-0 p-6 shadow-card">
          <h1 className="font-display text-2xl font-bold">Not authorized</h1>
          <p className="mt-2 text-sm text-steel">
            This internal screen is limited to platform superadmins. Your account
            {profile.data?.profile?.user_type ? ` (${profile.data.profile.user_type})` : ""} has
            read access to the shared college database, but not to this page.
          </p>
        </Card>
      </AppShell>
    );
  }

  const universities = snapshot.data?.universities ?? [];
  const programs = snapshot.data?.programs ?? [];

  return (
    <AppShell right={<AuthButton />}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta">Internal · superadmin only</p>
          <h1 className="font-display text-4xl font-bold">College database check</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel">
            Plain tables confirming schema and data entry end to end. Search and filtering come in
            the next phase.
          </p>
        </div>
        <div className="flex gap-3">
          <Stat label="Universities" value={String(universities.length)} />
          <Stat label="Programs" value={String(programs.length)} />
        </div>
      </div>

      {snapshot.isLoading ? <p className="mt-8 text-sm text-steel">Loading rows…</p> : null}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Universities</h2>
          <VerifiedChip>Verified Data</VerifiedChip>
        </div>
        <DataTable
          head={[
            "Name",
            "City",
            "State",
            "Region",
            "Setting",
            "Size",
            "Type",
            "Enrollment",
            "Avg GPA",
            "Avg SAT",
            "Accept",
            "Out-of-state tuition",
            "Cost of attendance",
            "Net price",
          ]}
          rows={universities.map((u) => ({
            key: u.id,
            cells: [
              u.name,
              u.city ?? "—",
              u.state ?? "—",
              u.region ?? "—",
              u.campus_setting ?? "—",
              u.school_size_bucket ?? "—",
              u.public_private ?? "—",
              num(u.undergrad_enrollment),
              u.avg_gpa === null ? "—" : num(u.avg_gpa, 2),
              num(u.avg_sat),
              pct(u.acceptance_rate),
              money(u.tuition_out_state),
              money(u.est_cost_of_attendance),
              money(u.est_net_price),
            ],
            footer: (
              <SourceLine
                sourceLabel="Institution tuition page"
                sourceUrl={u.tuition_source_url}
                lastVerifiedAt={u.updated_at}
              />
            ),
          }))}
        />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Programs</h2>
          <VerifiedChip>Verified Data</VerifiedChip>
        </div>
        <DataTable
          head={[
            "University",
            "State",
            "Sport",
            "Body",
            "Division",
            "Conference",
            "Head coach",
            "Recruiting coordinator",
            "Scholarships",
          ]}
          rows={programs.map((p) => ({
            key: p.id,
            cells: [
              p.universities?.name ?? "—",
              p.universities?.state ?? "—",
              p.sport,
              p.governing_body ?? "—",
              p.division ?? "—",
              p.conference ?? "—",
              p.head_coach_name ?? "—",
              p.recruiting_coordinator_name ?? "—",
              p.scholarships_available ? (p.scholarship_details ?? "Yes") : "No",
            ],
            footer: (
              <SourceLine
                sourceLabel="Athletics staff directory"
                sourceUrl={p.coaching_staff_url}
                lastVerifiedAt={p.last_verified_at}
              />
            ),
          }))}
        />
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-card">
      <p className="meta">{label}</p>
      <p className="tabular font-display text-2xl font-bold text-org-primary">{value}</p>
    </div>
  );
}

function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: { key: string; cells: (string | number)[]; footer?: React.ReactNode }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-steel">No rows yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="tabular w-full min-w-[900px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {head.map((label) => (
              <th
                key={label}
                className="px-3 py-2 font-mono text-[11px] font-medium tracking-wide text-steel uppercase whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/70 last:border-0">
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={
                    index === 0
                      ? "px-3 py-2 font-semibold text-graphite"
                      : "px-3 py-2 text-graphite/85"
                  }
                >
                  {index === 0 ? (
                    <span className="block">
                      {cell}
                      {row.footer ? <span className="mt-0.5 block">{row.footer}</span> : null}
                    </span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
