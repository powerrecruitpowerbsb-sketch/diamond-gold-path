import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, ExternalLink, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import {
  countPendingDiscoveries,
  listDiscoveredUrls,
  listUnfoundLinks,
  reviewDiscoveredUrl,
  reviewDiscoveredUrls,
  setLinkManually,
  sweepDiscoveredLinksFn,
} from "@/lib/discovery.functions";
import { classifyLink } from "@/lib/link-quality";
import { sweepReasonLabel } from "@/lib/link-sweep-labels";

export const Route = createFileRoute("/_authenticated/admin/discovery")({
  head: () => ({
    meta: [
      { title: "Discovered links — Power Recruit" },
      {
        name: "description",
        content:
          "Confirm or reject automatically discovered athletics, roster, and coaching staff links before they reach live data.",
      },
      { property: "og:title", content: "Discovered links — Power Recruit" },
      {
        property: "og:description",
        content: "Staff review for automatically discovered school and program links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiscoveryQueue,
});

type Kind = "athletic_website" | "roster_page" | "coaching_staff_page";

type Row = {
  id: string;
  university_id: string;
  program_id: string | null;
  discovery_type: Kind;
  discovered_url: string | null;
  confidence: "high" | "low" | "failed";
  notes: string | null;
  created_at: string;
  universities: { name: string; state: string | null; website_url: string | null } | null;
  programs: { sport: string | null; athletic_website: string | null } | null;
};

type UnfoundRow = {
  id: string;
  university_id: string;
  discovery_type: Kind;
  notes: string | null;
  universities: { name: string; state: string | null } | null;
  programs: { sport: string | null } | null;
};

type Page<T> = { rows: T[]; total: number; page: number; totalPages: number };

type Sweep = {
  scanned: number;
  approve: number;
  reject: number;
  ask: number;
  byReason: Record<string, number>;
  requeuedSchools: number;
  failures: number;
  skippedNoUrl: number;
  moreWaiting: boolean;
};

const TYPE_LABELS: Record<Kind, string> = {
  athletic_website: "Athletics website",
  roster_page: "Roster page",
  coaching_staff_page: "Coaching staff page",
};

function DiscoveryQueue() {
  const listFn = useServerFn(listDiscoveredUrls);
  const unfoundFn = useServerFn(listUnfoundLinks);
  const countFn = useServerFn(countPendingDiscoveries);
  const reviewFn = useServerFn(reviewDiscoveredUrl);
  const reviewManyFn = useServerFn(reviewDiscoveredUrls);
  const sweepFn = useServerFn(sweepDiscoveredLinksFn);
  const manualFn = useServerFn(setLinkManually);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [unfoundPage, setUnfoundPage] = useState(1);
  const [preview, setPreview] = useState<Sweep | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});

  const counts = useQuery({
    queryKey: ["pending-discoveries-count"],
    queryFn: () => countFn() as Promise<{ pending: number; unfound: number }>,
  });

  const list = useQuery({
    queryKey: ["discovered-urls", page],
    queryFn: () => listFn({ data: { page, pageSize: 50 } }) as Promise<Page<Row>>,
  });

  const unfound = useQuery({
    queryKey: ["unfound-links", unfoundPage],
    queryFn: () => unfoundFn({ data: { page: unfoundPage, pageSize: 50 } }) as Promise<Page<UnfoundRow>>,
  });

  /** Decided links leave the list at once; the fresh read follows quietly. */
  const dropDecided = (ids: string[]) => {
    const gone = new Set(ids);
    queryClient.setQueriesData({ queryKey: ["discovered-urls"] }, (previous: any) =>
      previous?.rows
        ? {
            ...previous,
            rows: previous.rows.filter((row: Row) => !gone.has(row.id)),
            total: Math.max(0, (previous.total ?? 0) - ids.length),
          }
        : previous,
    );
    queryClient.setQueryData(["pending-discoveries-count"], (previous: any) =>
      previous ? { ...previous, pending: Math.max(0, (previous.pending ?? 0) - ids.length) } : previous,
    );
  };

  const refreshAll = async (decidedIds?: string[]) => {
    if (decidedIds?.length) dropDecided(decidedIds);
    void queryClient.invalidateQueries({ queryKey: ["discovered-urls"] });
    void queryClient.invalidateQueries({ queryKey: ["unfound-links"] });
    void queryClient.invalidateQueries({ queryKey: ["pending-discoveries-count"] });
  };

  const review = useMutation({
    mutationFn: (input: { id: string; decision: "confirm" | "reject" }) => reviewFn({ data: input }),
    onSuccess: async (_result, input) => {
      toast.success(
        input.decision === "confirm" ? "Link saved to the record" : "Marked wrong — searching again",
      );
      await refreshAll([input.id]);
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "Could not save that decision"),
  });

  const reviewMany = useMutation({
    mutationFn: (input: { ids: string[]; decision: "confirm" | "reject" }) =>
      reviewManyFn({ data: input }) as Promise<{ done: number; failed: number }>,
    onSuccess: async (result, input) => {
      toast.success(`${result.done} decided${result.failed ? `, ${result.failed} couldn't be saved` : ""}`);
      await refreshAll(input.ids);
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "Could not save those decisions"),
  });

  const sweep = useMutation({
    mutationFn: (apply: boolean) => sweepFn({ data: { apply } }) as Promise<Sweep>,
    onSuccess: async (result, apply) => {
      if (apply) {
        setPreview(null);
        toast.success(
          `Cleared ${result.reject} wrong links and approved ${result.approve}. ${result.ask} left for you.`,
        );
        await refreshAll();
      } else {
        setPreview(result);
      }
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "The tidy-up couldn't run"),
  });

  const retry = useMutation({
    mutationFn: (input: { id: string; decision: "reject" }) => reviewFn({ data: input }),
    onSuccess: async () => {
      toast.success("Sent back for a fresh search");
      await refreshAll();
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "Could not queue that search"),
  });

  const saveManual = useMutation({
    mutationFn: (input: { id: string; url: string }) => manualFn({ data: input }),
    onSuccess: async () => {
      toast.success("Link saved to live data");
      await refreshAll();
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "Could not save that link"),
  });

  const busy =
    review.isPending || reviewMany.isPending || sweep.isPending || saveManual.isPending || retry.isPending;

  const rows = list.data?.rows ?? [];
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.university_id, [...(groups.get(row.university_id) ?? []), row]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-graphite">Links to check</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel">
            Nothing here is live until you approve it. Start with the tidy-up — it clears the links
            that are plainly wrong so you only look at real decisions.
          </p>
        </div>
        <p className="meta tabular-nums text-right">
          {counts.data?.pending ?? "—"} TO CHECK · {counts.data?.unfound ?? "—"} NOT FOUND
        </p>
      </div>

      <SectionCard
        title="Tidy these links"
        blurb="Declines links for the wrong sport, old seasons, news stories, junk sites and homepage guesses — and sends those schools back for a fresh search. Approves team pages that name the right sport on a school's confirmed athletics site."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="touch-target" disabled={busy} onClick={() => sweep.mutate(false)}>
            <Sparkles className="size-4" aria-hidden /> See what it would do
          </Button>
          {preview ? (
            <Button
              className="touch-target bg-diamond-green text-white hover:bg-diamond-green/90"
              disabled={busy}
              onClick={() => sweep.mutate(true)}
            >
              <Check className="size-4" aria-hidden /> Do it
            </Button>
          ) : null}
        </div>

        {preview ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-graphite">
            <p className="font-semibold">
              Looked at {preview.scanned} links: {preview.reject} clearly wrong, {preview.approve} clearly
              right, {preview.ask} need you.
            </p>
            {preview.skippedNoUrl ? (
              <p className="mt-1 text-steel">
                {preview.skippedNoUrl} more rows had no address at all — nothing to judge, so they sit in
                "Couldn't find these pages" below instead of your decision count.
              </p>
            ) : null}
            {!preview.scanned ? (
              <p className="mt-1 text-steel">
                Nothing was left that the rules could decide — everything waiting needs a person or a
                fresh search.
              </p>
            ) : null}
            <ul className="mt-2 grid gap-1 text-steel">
              {Object.entries(preview.byReason).map(([code, total]) => (
                <li key={code} className="tabular-nums">
                  {total} · {sweepReasonLabel(code)}
                </li>
              ))}
            </ul>
            {preview.moreWaiting ? (
              <p className="meta mt-2">More links are waiting — run it again after this pass.</p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Your decisions"
        blurb={
          list.isPending
            ? "Loading…"
            : `${list.data?.total ?? 0} link${(list.data?.total ?? 0) === 1 ? "" : "s"} waiting · page ${list.data?.page ?? 1} of ${list.data?.totalPages ?? 1}`
        }
      >
        {(list.data as any)?.hiddenUnsponsored ? (
          <p className="meta mb-3">
            {(list.data as any).hiddenUnsponsored} link
            {(list.data as any).hiddenUnsponsored === 1 ? "" : "s"} held back — we haven't confirmed those
            schools play that sport yet.
          </p>
        ) : null}
        {list.isPending ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : !rows.length ? (
          <p className="text-sm text-steel">Nothing left to decide here.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="touch-target"
                disabled={busy}
                onClick={() => reviewMany.mutate({ ids: rows.map((row) => row.id), decision: "confirm" })}
              >
                <Check className="size-4" aria-hidden /> Approve everything on this page
              </Button>
            </div>

            <div className="grid gap-5">
              {[...groups.entries()].map(([universityId, items]) => (
                <div key={universityId} className="rounded-lg border border-border">
                  <header className="border-b border-border bg-muted/40 px-4 py-2.5">
                    <h3 className="font-display text-base font-bold text-graphite">
                      {items[0]?.universities?.name ?? "School"}
                      {items[0]?.universities?.state ? (
                        <span className="ml-2 text-sm font-normal text-steel">
                          {items[0]?.universities?.state}
                        </span>
                      ) : null}
                    </h3>
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((row) => {
                      const verdict = classifyLink({
                        kind: row.discovery_type,
                        url: row.discovered_url,
                        sport: row.programs?.sport ?? null,
                        schoolWebsite: row.universities?.website_url ?? null,
                        athleticWebsite: row.programs?.athletic_website ?? null,
                      });
                      return (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-graphite">
                                {TYPE_LABELS[row.discovery_type]}
                                {row.programs?.sport ? ` · ${row.programs.sport}` : ""}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  verdict.action === "approve"
                                    ? "bg-diamond-green/15 text-diamond-green"
                                    : verdict.action === "reject"
                                      ? "bg-seam-red/10 text-seam-red"
                                      : "bg-warm-gold/20 text-graphite"
                                }`}
                              >
                                {verdict.reason}
                              </span>
                            </div>
                            <a
                              href={row.discovered_url ?? "#"}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-org-primary underline"
                            >
                              <span className="truncate">{row.discovered_url}</span>
                              <ExternalLink className="size-3 shrink-0" aria-hidden />
                            </a>
                            {row.notes ? <p className="meta mt-1">{row.notes}</p> : null}
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => review.mutate({ id: row.id, decision: "confirm" })}
                              disabled={busy}
                              className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-diamond-green px-3 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              <Check className="size-4" aria-hidden /> Right
                            </button>
                            <button
                              type="button"
                              onClick={() => review.mutate({ id: row.id, decision: "reject" })}
                              disabled={busy}
                              className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
                            >
                              <X className="size-4" aria-hidden /> Wrong
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <Pager
              page={list.data?.page ?? 1}
              totalPages={list.data?.totalPages ?? 1}
              onChange={setPage}
              disabled={busy}
            />
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Couldn't find these pages"
        blurb="The search came back empty for these. Try again, or paste the right address in yourself."
      >
        {unfound.isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : !(unfound.data?.rows ?? []).length ? (
          <p className="text-sm text-steel">Nothing outstanding.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(unfound.data?.rows ?? []).map((row) => (
                <li key={row.id} className="grid gap-2 py-3">
                  <div>
                    <p className="text-sm font-semibold text-graphite">
                      {row.universities?.name ?? "School"} · {TYPE_LABELS[row.discovery_type]}
                      {row.programs?.sport ? ` · ${row.programs.sport}` : ""}
                    </p>
                    {row.notes ? <p className="meta mt-0.5">{row.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={manual[row.id] ?? ""}
                      onChange={(event) =>
                        setManual((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                      placeholder="https://…"
                      className="h-11 min-w-64 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-org-primary"
                    />
                    <Button
                      variant="outline"
                      className="touch-target"
                      disabled={busy || !(manual[row.id] ?? "").trim()}
                      onClick={() => saveManual.mutate({ id: row.id, url: (manual[row.id] ?? "").trim() })}
                    >
                      Save this link
                    </Button>
                    <Button
                      variant="ghost"
                      className="touch-target"
                      disabled={busy}
                      onClick={() => retry.mutate({ id: row.id, decision: "reject" })}
                    >
                      Search again
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager
              page={unfound.data?.page ?? 1}
              totalPages={unfound.data?.totalPages ?? 1}
              onChange={setUnfoundPage}
              disabled={busy}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button
        variant="outline"
        className="touch-target"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Back
      </Button>
      <p className="meta tabular-nums">
        PAGE {page} OF {totalPages}
      </p>
      <Button
        variant="outline"
        className="touch-target"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
