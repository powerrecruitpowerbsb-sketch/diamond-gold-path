import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Ban, Download, Save, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  clearResolvedDiscoveries,
  countMissingData,
  listMissingData,
  markProgramsNotOffered,
  markSchoolNoSports,
} from "@/lib/gaps.functions";
import { fixProgramLink } from "@/lib/operations.functions";
import { setCoachManually } from "@/lib/pipeline.functions";
import { runProgramIngest } from "@/lib/ingest.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader, num } from "@/components/console/PageHeader";
import { titleCase } from "@/lib/admin-schemas";

export const Route = createFileRoute("/_authenticated/admin/missing")({
  head: () => ({
    meta: [
      { title: "Missing roster & coach pages — Curve Recruit" },
      {
        name: "description",
        content:
          "Every college team missing a roster page, coaching staff page, or head coach, with one-click fixes.",
      },
      { property: "og:title", content: "Missing roster & coach pages — Curve Recruit" },
      {
        property: "og:description",
        content: "Staff alert list for teams with a missing roster page, staff page, or head coach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MissingData,
});

const GAPS = [
  { key: "any", label: "Anything missing" },
  { key: "quickwin", label: "Quick wins: coach only" },
  { key: "roster", label: "No roster page" },
  { key: "staff", label: "No coaching staff page" },
  { key: "coach", label: "No head coach" },
  { key: "site", label: "No athletics site" },
  { key: "zero", label: "Nothing on file at all" },
] as const;

const LEVELS = [
  { key: "", label: "Level: any" },
  { key: "NCAA 1", label: "NCAA D1" },
  { key: "NCAA 2", label: "NCAA D2" },
  { key: "NCAA 3", label: "NCAA D3" },
  { key: "NAIA", label: "NAIA" },
  { key: "NJCAA", label: "NJCAA" },
  { key: "CCCAA", label: "CCCAA" },
  { key: "NWAC", label: "NWAC" },
] as const;

const PAGE_SIZES = [25, 50, 100] as const;

type GapRow = {
  id: string;
  sport: string;
  universityId: string;
  school: string;
  state: string;
  level: string;
  conference: string | null;
  athleticWebsite: string | null;
  rosterUrl: string | null;
  coachingStaffUrl: string | null;
  headCoachName: string | null;
};

function gapsFor(row: GapRow) {
  const list: string[] = [];
  if (!row.athleticWebsite) list.push("Athletics site");
  if (!row.rosterUrl) list.push("Roster page");
  if (!row.coachingStaffUrl) list.push("Coaching staff page");
  if (!row.headCoachName) list.push("Head coach");
  return list;
}

function MissingData() {
  const countFn = useServerFn(countMissingData);
  const listFn = useServerFn(listMissingData);
  const clearFn = useServerFn(clearResolvedDiscoveries);
  const notOfferedFn = useServerFn(markProgramsNotOffered);

  const [gap, setGap] = useState<string>("any");
  const [sport, setSport] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [clearing, setClearing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openRow, setOpenRow] = useState<GapRow | null>(null);

  const counts = useQuery({
    queryKey: ["missing-counts"],
    queryFn: () => countFn(),
    staleTime: 60_000,
  });

  const list = useQuery({
    queryKey: ["missing-rows", gap, sport, level, search],
    queryFn: () => listFn({ data: { gap, sport, level, search } }),
    staleTime: 30_000,
  });

  const c = (counts.data ?? { roster: 0, staff: 0, coach: 0, site: 0 }) as {
    roster: number;
    staff: number;
    coach: number;
    site: number;
  };
  const waiting = c.roster + c.staff + c.coach + c.site;
  const rows = ((list.data as any)?.rows ?? []) as GapRow[];
  const total = ((list.data as any)?.total ?? 0) as number;

  const pageRows = useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [rows, page, pageSize],
  );
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const pageAllChecked = pageRows.length > 0 && pageRows.every((row) => selected[row.id]);

  async function refreshAll() {
    await Promise.all([counts.refetch(), list.refetch()]);
  }

  function resetFilters(apply: () => void) {
    apply();
    setPage(0);
    setSelected({});
  }

  async function clearStale() {
    setClearing(true);
    try {
      const result = (await clearFn({ data: { apply: true } })) as any;
      toast.success(
        result.resolved
          ? `Cleared ${result.resolved} old alerts whose address is already saved.`
          : "Nothing left to clear — every old alert is genuine.",
      );
      await refreshAll();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not clear those alerts");
    } finally {
      setClearing(false);
    }
  }

  async function bulkNotOffered() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Mark ${selectedIds.length} team${selectedIds.length === 1 ? "" : "s"} as not offered? They stop showing to families and drop off this list.`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      await notOfferedFn({ data: { programIds: selectedIds } });
      toast.success(
        `${selectedIds.length} team${selectedIds.length === 1 ? "" : "s"} marked as not offered.`,
      );
      setSelected({});
      await refreshAll();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not update those teams");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Missing roster & coach pages"
        description="Teams we cannot read because an address or a coach name is missing. Fix one here and it drops off the list straight away."
        counts={[
          `${num(waiting)} gaps in total`,
          `${num(c.roster)} without a roster page`,
          `${num(c.coach)} without a head coach`,
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => void clearStale()}
            disabled={clearing}
            className="touch-target"
          >
            <Sparkles className="size-4" aria-hidden />
            {clearing ? "Clearing…" : "Clear already-fixed alerts"}
          </Button>
        }
      />

      {waiting > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded border border-seam-red/40 bg-seam-red-tint p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-seam-red" aria-hidden />
          <p className="text-sm text-graphite">
            <span className="font-semibold">{num(waiting)} things are missing across your teams.</span>{" "}
            Start with <span className="font-semibold">Quick wins</span> — those already have a staff
            page, so one read usually fills the coach in. Tick the teams that don't play the sport and
            mark them not offered.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => resetFilters(() => setSearch(event.target.value))}
            placeholder="Narrow by school, state or conference"
            aria-label="Narrow by school, state or conference"
            className="pl-9"
          />
        </div>
        <select
          aria-label="What's missing"
          value={gap}
          onChange={(event) => resetFilters(() => setGap(event.target.value))}
          className="h-10 rounded border border-input bg-background px-2.5 text-sm"
        >
          {GAPS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => resetFilters(() => setLevel(event.target.value))}
          className="h-10 rounded border border-input bg-background px-2.5 text-sm"
        >
          {LEVELS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sport"
          value={sport}
          onChange={(event) => resetFilters(() => setSport(event.target.value))}
          className="h-10 rounded border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Sport: any</option>
          <option value="baseball">Baseball</option>
          <option value="softball">Softball</option>
        </select>
      </div>

      {list.isPending ? (
        <p className="py-8 text-sm text-steel">Loading the teams with something missing…</p>
      ) : list.isError ? (
        <div className="rounded border border-border bg-card p-5">
          <p className="text-sm font-semibold text-graphite">We couldn't load the list.</p>
          <p className="mt-1 text-sm text-steel">
            {list.error instanceof Error ? list.error.message : "Unknown problem"}
          </p>
          <Button className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-sm text-steel">
          Nothing missing here — every team matching these filters has its addresses and coach on
          file.
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="meta tabular">
              Showing {num(page * pageSize + 1)}–{num(page * pageSize + pageRows.length)} of{" "}
              {num(rows.length)}
              {total > rows.length ? ` (${num(total)} matched)` : ""}
            </p>
            <div className="flex items-center gap-2">
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
                className="h-9 rounded border border-input bg-background px-2 text-sm"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * pageSize >= rows.length}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={pageAllChecked}
                      aria-label="Select every team on this page"
                      onCheckedChange={(checked) =>
                        setSelected((current) => {
                          const next = { ...current };
                          for (const row of pageRows) {
                            if (checked) next[row.id] = true;
                            else delete next[row.id];
                          }
                          return next;
                        })
                      }
                    />
                  </th>
                  <th className="p-3 font-semibold text-graphite">School</th>
                  <th className="p-3 font-semibold text-graphite">Sport &amp; level</th>
                  <th className="p-3 font-semibold text-graphite">What's missing</th>
                  <th className="p-3 text-right font-semibold text-graphite">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3 align-top">
                      <Checkbox
                        checked={Boolean(selected[row.id])}
                        aria-label={`Select ${row.school} ${row.sport}`}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = { ...current };
                            if (checked) next[row.id] = true;
                            else delete next[row.id];
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-3 align-top">
                      <Link
                        to="/admin/programs/$id"
                        params={{ id: row.id }}
                        className="font-semibold text-org-primary underline-offset-2 hover:underline"
                      >
                        {row.school}
                      </Link>
                      <span className="meta block">{row.state}</span>
                    </td>
                    <td className="p-3 align-top">
                      <span className="text-graphite">{titleCase(row.sport)}</span>
                      <span className="meta block">
                        {row.level || "—"}
                        {row.conference ? ` · ${row.conference}` : ""}
                      </span>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {gapsFor(row).map((label) => (
                          <span
                            key={label}
                            className="rounded-md bg-seam-red-tint px-1.5 py-0.5 text-[11px] font-semibold text-seam-red"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setOpenRow(row)}>
                          Fix
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedIds.length > 0 ? (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-semibold text-graphite">
            {num(selectedIds.length)} team{selectedIds.length === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected({})}>
              <X className="size-4" aria-hidden />
              Clear selection
            </Button>
            <Button size="sm" disabled={bulkBusy} onClick={() => void bulkNotOffered()}>
              <Ban className="size-4" aria-hidden />
              {bulkBusy ? "Updating…" : "Mark selected as not offered"}
            </Button>
          </div>
        </div>
      ) : null}

      <FixDrawer
        key={openRow?.id ?? "closed"}
        row={openRow}
        onClose={() => setOpenRow(null)}
        onChanged={async () => {
          await refreshAll();
        }}
      />
    </>
  );
}

function FixDrawer({
  row,
  onClose,
  onChanged,
}: {
  row: GapRow | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const saveLink = useServerFn(fixProgramLink);
  const saveCoach = useServerFn(setCoachManually);
  const readNow = useServerFn(runProgramIngest);
  const notOfferedFn = useServerFn(markProgramsNotOffered);
  const noSportsFn = useServerFn(markSchoolNoSports);

  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [coach, setCoach] = useState("");

  if (!row) return null;

  const fields = [
    { field: "athletic_website", label: "Athletics site", value: row.athleticWebsite },
    { field: "roster_url", label: "Roster page", value: row.rosterUrl },
    { field: "coaching_staff_url", label: "Coaching staff page", value: row.coachingStaffUrl },
  ];

  async function submitLink(field: string, label: string) {
    const url = (drafts[field] ?? "").trim();
    if (!url) {
      toast.error(`Paste the ${label.toLowerCase()} address first.`);
      return;
    }
    setBusy(field);
    try {
      const result = (await saveLink({ data: { programId: row!.id, field, url } })) as any;
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${label} saved for ${row!.school}.`);
      setDrafts((current) => ({ ...current, [field]: "" }));
      await onChanged();
      onClose();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that address");
    } finally {
      setBusy(null);
    }
  }

  async function submitCoach() {
    if (!coach.trim()) {
      toast.error("Type the coach's name first.");
      return;
    }
    setBusy("coach");
    try {
      const result = (await saveCoach({ data: { programId: row!.id, name: coach.trim() } })) as any;
      toast.success(`Head coach set to ${result?.name ?? coach.trim()}.`);
      setCoach("");
      await onChanged();
      onClose();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that coach");
    } finally {
      setBusy(null);
    }
  }

  async function scrapeNow() {
    setBusy("read");
    try {
      await readNow({ data: { programId: row!.id } });
      toast.success(`Read ${row!.school} — anything new is in the review queue.`);
      await onChanged();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not read that team");
    } finally {
      setBusy(null);
    }
  }

  async function retireSport() {
    if (!window.confirm(`Mark ${row!.school} ${row!.sport} as not offered?`)) return;
    setBusy("retire");
    try {
      await notOfferedFn({ data: { programIds: [row!.id] } });
      toast.success(`${row!.school} ${row!.sport} marked as not offered.`);
      await onChanged();
      onClose();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not update that team");
    } finally {
      setBusy(null);
    }
  }

  async function retireSchool() {
    if (!window.confirm(`${row!.school} offers neither baseball nor softball — mark both?`)) return;
    setBusy("school");
    try {
      const result = (await noSportsFn({ data: { universityId: row!.universityId } })) as any;
      toast.success(`${row!.school}: ${result?.retired ?? 0} team(s) marked as not offered.`);
      await onChanged();
      onClose();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not update that school");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.school}</SheetTitle>
          <SheetDescription>
            {titleCase(row.sport)}
            {row.level ? ` · ${row.level}` : ""}
            {row.conference ? ` · ${row.conference}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 p-4">
          {fields.map((item) =>
            item.value ? (
              <div key={item.field}>
                <p className="text-xs font-semibold text-steel uppercase">{item.label}</p>
                <p className="truncate text-sm text-graphite">{item.value}</p>
              </div>
            ) : (
              <div key={item.field} className="grid gap-2">
                <label className="text-xs font-semibold text-steel uppercase">
                  {item.label} — missing
                </label>
                <Input
                  type="url"
                  inputMode="url"
                  value={drafts[item.field] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [item.field]: event.target.value }))
                  }
                  placeholder="https://…"
                />
                <Button
                  size="sm"
                  disabled={busy === item.field}
                  onClick={() => void submitLink(item.field, item.label)}
                >
                  <Save className="size-4" aria-hidden />
                  {busy === item.field ? "Checking…" : "Check & save"}
                </Button>
              </div>
            ),
          )}

          {row.headCoachName ? (
            <div>
              <p className="text-xs font-semibold text-steel uppercase">Head coach</p>
              <p className="text-sm text-graphite">{row.headCoachName}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-steel uppercase">
                Head coach — missing
              </label>
              <Input
                value={coach}
                onChange={(event) => setCoach(event.target.value)}
                placeholder="Head coach's name"
              />
              <Button size="sm" disabled={busy === "coach"} onClick={() => void submitCoach()}>
                <Save className="size-4" aria-hidden />
                {busy === "coach" ? "Saving…" : "Save coach"}
              </Button>
            </div>
          )}

          <div className="grid gap-2 border-t border-border pt-4">
            <Button variant="outline" disabled={busy === "read"} onClick={() => void scrapeNow()}>
              <Download className="size-4" aria-hidden />
              {busy === "read" ? "Reading…" : "Read this team now"}
            </Button>
            <Button variant="outline" disabled={busy === "retire"} onClick={() => void retireSport()}>
              <Ban className="size-4" aria-hidden />
              {busy === "retire" ? "Updating…" : `This school has no ${row.sport}`}
            </Button>
            <Button variant="outline" disabled={busy === "school"} onClick={() => void retireSchool()}>
              <Ban className="size-4" aria-hidden />
              {busy === "school" ? "Updating…" : "Neither sport offered here"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
