import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, MapPin, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { ShortlistSaveButton } from "@/components/brand/ShortlistSaveButton";
import { ReportMistake } from "@/components/brand/ReportMistake";
import {
  ClassificationTable,
  IntelligencePanel,
  InternalIntelPanel,
  LayerTag,
  type VerifiedField,
} from "@/components/profile/DataLayers";
import {
  FactList,
  LinkRow,
  Panel,
  ProfileTabs,
  StatCard,
} from "@/components/profile/ProfileUI";
import { RosterComposition, type RosterRow } from "@/components/profile/Composition";
import { RosterTable } from "@/components/profile/RosterTable";
import { TrueFitPanel } from "@/components/profile/TrueFitPanel";
import { useMyAccount } from "@/hooks/use-my-account";
import { getProgramProfile } from "@/lib/search.functions";
import { listAthletePicker } from "@/lib/shortlist.functions";
import { INTEL_FIELD_LABELS } from "@/lib/search-schema";
import {
  fieldLabel,
  INTEL_FIELD_MAP,
  POSITION_LABELS,
  STRENGTH_CHOICES,
  structuredLabel,
} from "@/lib/intel-fields";
import { titleCase } from "@/lib/admin-schemas";

import {
  admissionState,
  count,
  dateLabel,
  gpaState,
  hostOf,
  isBlocked,
  money,
  pct,
  published,
  reported,
  testScoreState,
  type LinkHealthRow,
} from "@/lib/profile-fields";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/programs/$id")({
  validateSearch: (search: Record<string, unknown>): { athleteId?: string } =>
    typeof search['athleteId'] === "string" && search['athleteId']
      ? { athleteId: search['athleteId'] }
      : {},
  head: () => ({
    meta: [
      { title: "Program profile — Power Recruit" },
      {
        name: "description",
        content:
          "Verified academics, cost, roster composition, and Power Recruit's own recruiting intelligence for this college program.",
      },
      { property: "og:title", content: "Program profile — Power Recruit" },
      {
        property: "og:description",
        content:
          "Verified data and recruiting intelligence for a college baseball or softball program.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramProfile,
});

const CLASSIFICATION_LABELS: Record<string, string> = {
  academic_bucket: "Academic profile",
  campus_culture: "Campus culture",
  school_size: "School size",
  geographic_region: "Region",
  campus_setting: "Campus setting",
};

function ProgramProfile() {
  const { id } = Route.useParams();
  const { athleteId } = Route.useSearch();
  const [tab, setTab] = useState("overview");
  const { account } = useMyAccount();
  const viewerRole = account?.primaryRole ?? null;
  const isOrgStaff =
    viewerRole === "org_owner" ||
    viewerRole === "org_admin" ||
    viewerRole === "org_staff" ||
    viewerRole === "superadmin";
  const profileFn = useServerFn(getProgramProfile);

  const pickerFn = useServerFn(listAthletePicker);
  const picker = useQuery({
    queryKey: ["athlete-picker"],
    queryFn: () => pickerFn(),
    staleTime: 30_000,
    retry: false,
  });
  const contextAthlete = athleteId
    ? ((picker.data?.athletes ?? []) as Record<string, any>[]).find(
        (row) => row['id'] === athleteId,
      ) ?? null
    : null;
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["program-profile", id],
    queryFn: () => profileFn({ data: { programId: id } }),
  });

  if (isPending) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell right={<AuthButton />}>
        <div className="rounded border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-graphite">Program not found</h1>
          <p className="mt-2 text-sm text-steel">
            {isError ? (error as Error).message : "This program is not available to your account."}
          </p>
          <Link
            to="/search"
            className="mt-5 inline-flex touch-target items-center rounded bg-seam-red px-4 text-sm font-semibold text-white"
          >
            Back to search
          </Link>
        </div>
      </AppShell>
    );
  }

  const {
    program,
    university,
    intelligence,
    classifications,
    roster,
    latestSeason,
    sources,
    siblingPrograms,
    majors,
    linkHealth,
    relationshipSummary,
  } = data as any;


  const rosterRows = (roster ?? []) as RosterRow[];
  const links = (linkHealth ?? []) as LinkHealthRow[];
  const sourceRows = (sources ?? []) as any[];

  /** Source row for a field, preferring an official source. */
  const sourceFor = (table: string, field: string) => {
    const matches = sourceRows.filter(
      (row) => row.table_name === table && row.field_name === field,
    );
    return (
      matches.find((row) => row.source_url && row.source_type === "official") ??
      matches.find((row) => row.source_url) ??
      matches[0] ??
      null
    );
  };
  const vf = (
    label: string,
    table: string,
    field: string,
    state: VerifiedField["state"],
    fallbackUrl?: string | null,
  ): VerifiedField => {
    const source = sourceFor(table, field);
    return {
      label,
      state,
      sourceUrl: source?.source_url ?? fallbackUrl ?? null,
      verifiedAt: source?.last_verified_at ?? null,
    };
  };

  const federalUrl = university?.website_url ?? null;

  const overviewFields: VerifiedField[] = [
    vf("Location", "universities", "city", published(
      [university?.city, university?.state].filter(Boolean).join(", "),
    ), federalUrl),
    vf("Public or private", "universities", "public_private",
      published(university?.public_private, (v) => titleCase(String(v))), federalUrl),
    vf("Undergraduate enrollment", "universities", "undergrad_enrollment",
      reported(university?.undergrad_enrollment, count), federalUrl),
    vf("Campus setting", "universities", "campus_setting",
      published(university?.campus_setting, (v) => titleCase(String(v))), federalUrl),
    vf("Religious tradition", "universities", "religious_tradition",
      university?.religious_affiliation
        ? published(university?.religious_tradition)
        : published("None"), federalUrl),
    vf("Region", "universities", "region", published(university?.region), federalUrl),
  ];

  const academicFields: VerifiedField[] = [
    {
      label: "Average GPA",
      state: gpaState(),
      note: "No institution-wide source exists for this figure.",
      sourceUrl: null,
      verifiedAt: null,
    },
    vf("Acceptance rate", "universities", "acceptance_rate",
      admissionState(university?.acceptance_rate), university?.admissions_url ?? federalUrl),
    vf("Average SAT", "universities", "avg_sat", testScoreState(university?.avg_sat),
      university?.admissions_url ?? federalUrl),
    vf("SAT middle 50% (total)", "universities", "sat_total_25",
      university?.sat_total_25 && university?.sat_total_75
        ? { kind: "value", text: `${university.sat_total_25}–${university.sat_total_75}` }
        : { kind: "not-reported" }, university?.admissions_url ?? federalUrl),
    vf("Average ACT", "universities", "avg_act", testScoreState(university?.avg_act),
      university?.admissions_url ?? federalUrl),
    vf("ACT middle 50%", "universities", "act_25",
      university?.act_25 && university?.act_75
        ? { kind: "value", text: `${university.act_25}–${university.act_75}` }
        : { kind: "not-reported" }, university?.admissions_url ?? federalUrl),
    vf("Test optional", "universities", "test_optional",
      university?.test_optional === null || university?.test_optional === undefined
        ? { kind: "not-reported" }
        : { kind: "value", text: university.test_optional ? "Yes" : "No" },
      university?.admissions_url ?? federalUrl),
    vf("Graduation rate", "universities", "graduation_rate",
      reported(university?.graduation_rate, pct), federalUrl),
    vf("Student–faculty ratio", "universities", "student_faculty_ratio",
      reported(university?.student_faculty_ratio), federalUrl),
  ];

  const costFields: VerifiedField[] = [
    vf("In-state tuition", "universities", "tuition_in_state",
      reported(university?.tuition_in_state, money), university?.tuition_source_url ?? federalUrl),
    vf("Out-of-state tuition", "universities", "tuition_out_state",
      reported(university?.tuition_out_state, money), university?.tuition_source_url ?? federalUrl),
    vf("Room & board", "universities", "room_board",
      reported(university?.room_board, money), university?.tuition_source_url ?? federalUrl),
    vf("Estimated cost of attendance", "universities", "est_cost_of_attendance",
      reported(university?.est_cost_of_attendance, money),
      university?.tuition_source_url ?? federalUrl),
    vf("Estimated net price", "universities", "est_net_price",
      reported(university?.est_net_price, money), university?.tuition_source_url ?? federalUrl),
    vf("Athletic scholarships", "programs", "scholarships_available",
      program.scholarships_available === null || program.scholarships_available === undefined
        ? { kind: "not-published" }
        : { kind: "value", text: program.scholarships_available ? "Available" : "None" },
      program.athletic_website),
  ];

  const levelFields: VerifiedField[] = [
    vf("Governing body", "programs", "governing_body", published(program.governing_body),
      program.athletic_website),
    {
      label: "Division",
      state: program.division
        ? { kind: "value", text: String(program.division) }
        : { kind: "not-published" },
      sourceUrl: program.division_source ?? null,
      verifiedAt: program.division_verified_at ?? null,
    },
    {
      label: "Conference",
      state: program.conference
        ? { kind: "value", text: String(program.conference) }
        : { kind: "not-published" },
      sourceUrl: program.conference_source ?? null,
      verifiedAt: program.conference_verified_at ?? null,
    },

  ];

  const coachBlocked = isBlocked(links, "coaching_staff_url");
  const coachFields: VerifiedField[] = [
    {
      label: "Head coach",
      state: program.head_coach_name
        ? { kind: "value", text: String(program.head_coach_name) }
        : coachBlocked
          ? { kind: "blocked" }
          : { kind: "not-published" },
      sourceUrl: program.coach_source_url ?? program.coaching_staff_url ?? null,
      verifiedAt: program.coach_extracted_at ?? null,
    },
    {
      label: "Recruiting coordinator",
      state: program.recruiting_coordinator_name
        ? { kind: "value", text: String(program.recruiting_coordinator_name) }
        : coachBlocked
          ? { kind: "blocked" }
          : { kind: "not-published" },
      sourceUrl: program.coach_source_url ?? program.coaching_staff_url ?? null,
      verifiedAt: program.coach_extracted_at ?? null,
    },
  ];

  const classificationRows = ((classifications ?? []) as any[]).map((row) => ({
    label: CLASSIFICATION_LABELS[row.classification_type] ?? titleCase(row.classification_type),
    value: row.value ?? row.ai_suggested_value ?? null,
    evidence: row.evidence_text ?? null,
    staffSet: Boolean(row.is_staff_overridden),
  }));

  /** One record rendered as a sentence: structured answer, positions, then the note. */
  const intelBody = (row: any): string => {
    const parts: string[] = [];
    const choice = structuredLabel(String(row.field_type), row.structured_value);
    if (choice) parts.push(choice);
    if ((row.positions ?? []).length) {
      parts.push(
        (row.positions as string[]).map((p) => POSITION_LABELS[p] ?? p).join(", "),
      );
    }
    const detail = row.structured_detail as { positions?: string[]; year?: string } | null;
    if (detail?.positions?.length) {
      parts.push(
        `${detail.positions.map((p) => POSITION_LABELS[p] ?? p).join(", ")}${
          detail.year ? ` (${detail.year})` : ""
        }`,
      );
    }
    if ((row.content ?? "").trim()) parts.push(String(row.content).trim());
    return parts.join(" — ");
  };

  const allIntel = ((intelligence ?? []) as any[]).map((row) => ({
    id: String(row.id),
    label: fieldLabel(String(row.field_type)) || INTEL_FIELD_LABELS[row.field_type] || String(row.field_type),
    body: intelBody(row),
    visibility: (row.visibility ?? "org_only") as "org_only" | "shared_with_families",
    orgOnlyField: INTEL_FIELD_MAP[String(row.field_type)]?.audience === "org",
  }));
  // Conclusions (and anything shared on purpose) sit in the family-facing block;
  // the evidence sits in the internal block, staff only.
  const intelRows = allIntel.filter((r) => !r.orgOnlyField || r.visibility === "shared_with_families");
  const internalRows = allIntel.filter((r) => r.orgOnlyField && r.visibility === "org_only");
  const strength = relationshipSummary?.strength_label ?? null;
  const placed = relationshipSummary?.placed_players_before ?? null;


  const majorRows = (majors ?? []) as {
    id: string;
    name: string;
    category: string | null;
    completions: number | null;
  }[];

  const sibling = ((siblingPrograms ?? []) as any[]).find(
    (row) => row.sport !== program.sport && row.offering_status !== "not_offered",
  );
  const otherSport = program.sport === "baseball" ? "softball" : "baseball";

  const rosterBlocked = isBlocked(links, "roster_url");
  const officialLinks = [
    { label: "Athletics site", url: program.athletic_website },
    { label: "Roster page", url: program.roster_url },
    { label: "Coaching staff page", url: program.coaching_staff_url },
    { label: "Facilities", url: program.facility_url },
    { label: "School site", url: university?.website_url },
    { label: "Admissions", url: university?.admissions_url },
    { label: "Financial aid", url: university?.financial_aid_url },
  ].filter((row) => Boolean(row.url));

  const levelLine =
    [program.governing_body, program.division].filter(Boolean).join(" ") || "Level not published";

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "academics", label: "Academics" },
    { id: "cost", label: "Cost" },
    { id: "roster", label: "Roster", count: rosterRows.length || null },
    { id: "fit", label: "True fit" },
    { id: "intel", label: "Intelligence", count: intelRows.length || null },
    { id: "links", label: "Links & sources", count: officialLinks.length || null },
  ];

  return (
    <AppShell right={<AuthButton />}>
      <Link
        to="/search"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-org-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to search
      </Link>

      {/* ---------------- HERO ---------------- */}
      <header className="stadium-gradient relative overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="meta text-org-accent">{levelLine.toUpperCase()}</p>
            <h1 className="mt-1.5 font-display text-[1.75rem] leading-[1.08] font-bold text-white sm:text-[2.5rem]">
              {university?.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden />
                {[university?.city, university?.state].filter(Boolean).join(", ") ||
                  "Location not published"}
              </span>
              <span>{program.conference ?? "Conference not published"}</span>
              {program.head_coach_name ? <span>{program.head_coach_name}</span> : null}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex items-center overflow-hidden rounded-full border border-white/25 bg-white/10">
              <span className="bg-card px-3.5 py-1.5 text-sm font-semibold text-graphite">
                {titleCase(program.sport)}
              </span>
              {sibling ? (
                <Link
                  to="/programs/$id"
                  params={{ id: String(sibling.id) }}
                  search={athleteId ? { athleteId } : {}}
                  className="px-3.5 py-1.5 text-sm font-semibold text-white/80 hover:text-white"
                >
                  {titleCase(String(sibling.sport))}
                </Link>
              ) : (
                <span className="px-3.5 py-1.5 text-sm text-white/50 italic">
                  No {otherSport}
                </span>
              )}
            </div>
            <ShortlistSaveButton
              programId={id}
              athleteId={athleteId || undefined}
              athleteName={(contextAthlete?.['name'] as string | undefined) ?? undefined}
            />
          </div>
        </div>

        <dl className="relative mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-5 sm:grid-cols-4">
          {[
            [
              "Undergrads",
              university?.undergrad_enrollment
                ? count(university.undergrad_enrollment)
                : "Not reported",
            ],
            [
              "Net price",
              university?.est_net_price ? money(university.est_net_price) : "Not reported",
            ],
            ["Acceptance", stateText(admissionState(university?.acceptance_rate))],
            [
              "Roster",
              rosterRows.length ? `${rosterRows.length} players` : "Not on file",
            ],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="meta text-white/55">{String(label).toUpperCase()}</dt>
              <dd className="tabular mt-1 font-display text-xl font-bold text-white sm:text-2xl">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-6">
        <ProfileTabs tabs={tabs} active={tab} onSelect={setTab} />
      </div>

      {/* ---------------- OVERVIEW ---------------- */}
      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="The school" meta={<LayerTag layer="verified" />}>
            <FactList fields={overviewFields} columns={1} />
          </Panel>

          <div className="grid gap-4">
            <Panel title="The program" meta={<LayerTag layer="verified" />}>
              <FactList fields={levelFields} columns={1} />
            </Panel>

            <Panel title="Coaches" meta={<LayerTag layer="verified" />}>
              {coachBlocked ? (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs text-steel">
                  <ShieldAlert className="size-3.5" aria-hidden />
                  This school’s site blocks automated reading, so coach details can’t be collected.
                </p>
              ) : null}
              <FactList fields={coachFields} columns={1} />
            </Panel>
          </div>

          <Panel title="Campus & culture" meta={<LayerTag layer="classification" />}>
            <ClassificationTable rows={classificationRows} />
          </Panel>

          <Panel title="Facilities">
            {program.facility_url ? (
              <LinkRow label="Facilities page" url={String(program.facility_url)} />
            ) : (
              <p className="text-sm text-steel">No facilities page is published for this program.</p>
            )}
          </Panel>
        </div>
      ) : null}

      {/* ---------------- ACADEMICS ---------------- */}
      {tab === "academics" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Acceptance rate"
              value={stateText(admissionState(university?.acceptance_rate))}
              verified
            />
            <StatCard
              label="SAT middle 50%"
              value={
                university?.sat_total_25 && university?.sat_total_75
                  ? `${university.sat_total_25}–${university.sat_total_75}`
                  : "Not reported"
              }
              verified
            />
            <StatCard
              label="ACT middle 50%"
              value={
                university?.act_25 && university?.act_75
                  ? `${university.act_25}–${university.act_75}`
                  : "Not reported"
              }
              verified
            />
            <StatCard
              label="Graduation rate"
              value={university?.graduation_rate ? pct(university.graduation_rate) : "Not reported"}
              verified
            />
          </div>

          <Panel title="Academics & admissions" meta={<LayerTag layer="verified" />}>
            <FactList fields={academicFields} />
          </Panel>

          <Panel title="Majors" meta={`${majorRows.length} on file`}>
            {majorRows.length === 0 ? (
              <p className="text-sm text-steel">No majors are on file for this school yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {majorRows.map((major) => (
                  <div
                    key={major.id}
                    className="flex items-center justify-between gap-3 border-b border-border/70 py-2 last:border-0"
                  >
                    <span className="text-sm text-graphite">{major.name}</span>
                    <span className="meta shrink-0">
                      {major.category ?? ""}
                      {major.completions === null ? "" : ` · ${major.completions} graduates`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {/* ---------------- COST ---------------- */}
      {tab === "cost" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="In-state tuition"
              value={university?.tuition_in_state ? money(university.tuition_in_state) : "Not reported"}
              verified
            />
            <StatCard
              label="Out-of-state"
              value={
                university?.tuition_out_state ? money(university.tuition_out_state) : "Not reported"
              }
              verified
            />
            <StatCard
              label="Cost of attendance"
              value={
                university?.est_cost_of_attendance
                  ? money(university.est_cost_of_attendance)
                  : "Not reported"
              }
              verified
            />
            <StatCard
              label="Estimated net price"
              value={university?.est_net_price ? money(university.est_net_price) : "Not reported"}
              hint="What families typically pay after aid"
              verified
            />
          </div>

          <Panel title="Tuition & cost" meta={<LayerTag layer="verified" />}>
            <FactList fields={costFields} />
          </Panel>
        </div>
      ) : null}

      {/* ---------------- ROSTER ---------------- */}
      {tab === "roster" ? (
        <div className="grid gap-4">
          {rosterRows.length === 0 ? (
            <Panel title="Roster" meta={latestSeason ? `${latestSeason} season` : "None on file"}>
              <p className="text-sm font-semibold text-graphite">
                {rosterBlocked
                  ? "This school’s site blocks automated reading, so no roster has been collected."
                  : "No roster is on file for this program yet."}
              </p>
              <p className="mt-1 text-sm text-steel">
                {program.roster_url || program.athletic_website
                  ? "The addresses we hold are below — you can read the roster directly on the school’s site."
                  : "We don’t hold a roster or athletics address for this program yet."}
              </p>
              <div className="mt-3">
                {[
                  { label: "Roster page", url: program.roster_url },
                  { label: "Athletics site", url: program.athletic_website },
                ]
                  .filter((row) => Boolean(row.url))
                  .map((row) => (
                    <LinkRow key={row.label} label={row.label} url={String(row.url)} />
                  ))}
              </div>
              {program.last_roster_pull_at ? (
                <p className="meta mt-3">
                  Last attempted: {dateLabel(program.last_roster_pull_at)}
                </p>
              ) : null}
            </Panel>
          ) : (
            <>
              <Panel
                title="Roster composition"
                meta={latestSeason ? `${latestSeason} season` : "No season recorded"}
              >
                <RosterComposition rows={rosterRows} season={latestSeason} />
              </Panel>

              <Panel title="Roster" meta={`${rosterRows.length} players · sortable`}>
                <RosterTable rows={rosterRows} />
                <p className="meta mt-3">
                  Collected from{" "}
                  {program.roster_url ? (
                    <a
                      href={String(program.roster_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2 hover:text-org-primary"
                    >
                      {hostOf(program.roster_url)}
                    </a>
                  ) : (
                    "the school’s athletics site"
                  )}
                  {program.last_roster_pull_at ? (
                    <> · {dateLabel(program.last_roster_pull_at)}</>
                  ) : null}
                </p>
              </Panel>
            </>
          )}
        </div>
      ) : null}

      {/* ---------------- TRUE FIT ---------------- */}
      {tab === "fit" ? (
        <Panel
          title="True fit"
          meta={athleteId ? "For the selected athlete" : "Pick an athlete"}
        >
          <TrueFitPanel programId={id} athleteId={athleteId ?? null} />
        </Panel>
      ) : null}

      {/* ---------------- INTELLIGENCE ---------------- */}
      {tab === "intel" ? (
        <Panel title="Recruiting intelligence" meta={<LayerTag layer="intelligence" />}>
          {strength || placed !== null ? (
            <dl className="mb-4 flex flex-wrap gap-8 border-b border-border pb-4 text-sm">
              <div>
                <dt className="meta">RELATIONSHIP</dt>
                <dd className="mt-1 font-semibold text-graphite">
                  {STRENGTH_CHOICES.find((c) => c.value === strength)?.label ?? "Not rated"}
                </dd>
              </div>
              <div>
                <dt className="meta">PLACED PLAYERS HERE BEFORE</dt>
                <dd className="mt-1 font-semibold text-graphite">
                  {placed === null ? "Not recorded" : placed ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          ) : null}
          <IntelligencePanel rows={intelRows} showVisibility={isOrgStaff} />
          {isOrgStaff ? <InternalIntelPanel rows={internalRows} /> : null}
          {isOrgStaff ? (
            <p className="meta mt-3">
              <Link
                to="/intelligence"
                search={{ programId: id }}
                className="underline decoration-dotted underline-offset-2 hover:text-org-primary"
              >
                Write or update intelligence for this program
              </Link>
            </p>
          ) : null}
        </Panel>
      ) : null}

      {/* ---------------- LINKS ---------------- */}
      {tab === "links" ? (
        <Panel title="Official links">
          {officialLinks.length === 0 ? (
            <p className="text-sm text-steel">No addresses are on file for this school.</p>
          ) : (
            officialLinks.map((row) => (
              <LinkRow key={row.label} label={row.label} url={String(row.url)} />
            ))
          )}
          <p className="meta mt-3 inline-flex items-center gap-1">
            <ExternalLink className="size-3" aria-hidden />
            Every figure on this page links back to the source it came from.
          </p>
        </Panel>
      ) : null}

      <div className="mt-8 border-t border-border pt-4">
        <ReportMistake programId={id} />
      </div>
    </AppShell>
  );
}

/** Field state rendered as plain text for a headline figure. */
function stateText(state: ReturnType<typeof admissionState>): string {
  return state.kind === "value" ? state.text : state.kind === "open-admission"
    ? "Open admission"
    : "Not reported";
}
