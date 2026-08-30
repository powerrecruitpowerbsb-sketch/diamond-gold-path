import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/admin/form-kit";
import { listDiscoveredUrls, reviewDiscoveredUrl } from "@/lib/discovery.functions";

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

type Row = {
  id: string;
  university_id: string;
  program_id: string | null;
  discovery_type: "athletic_website" | "roster_page" | "coaching_staff_page";
  discovered_url: string | null;
  confidence: "high" | "low" | "failed";
  notes: string | null;
  created_at: string;
  universities: { name: string; state: string | null } | null;
  programs: { sport: string } | null;
};

const TYPE_LABELS: Record<Row["discovery_type"], string> = {
  athletic_website: "Athletics website",
  roster_page: "Roster page",
  coaching_staff_page: "Coaching staff page",
};

const CONFIDENCE_STYLES: Record<Row["confidence"], string> = {
  low: "bg-warm-gold/20 text-graphite",
  high: "bg-diamond-green/15 text-diamond-green",
  failed: "bg-seam-red/10 text-seam-red",
};

const CONFIDENCE_LABELS: Record<Row["confidence"], string> = {
  low: "Needs a look",
  high: "Looks right",
  failed: "Nothing found",
};

function DiscoveryQueue() {
  const listFn = useServerFn(listDiscoveredUrls);
  const reviewFn = useServerFn(reviewDiscoveredUrl);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["discovered-urls"],
    queryFn: () => listFn() as Promise<Row[]>,
  });

  const review = useMutation({
    mutationFn: (input: { id: string; decision: "confirm" | "reject" }) => reviewFn({ data: input }),
    onSuccess: async (_result, input) => {
      toast.success(input.decision === "confirm" ? "Link saved to the record" : "Link rejected");
      await queryClient.invalidateQueries({ queryKey: ["discovered-urls"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-discoveries-count"] });
    },
    onError: (failure: unknown) =>
      toast.error(failure instanceof Error ? failure.message : "Could not save that decision"),
  });

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  const rows = data ?? [];

  if (!rows.length) {
    return (
      <SectionCard title="Discovered links" blurb="Nothing waiting for review.">
        <p className="text-sm text-steel">
          Run link discovery from a school's page, or right after a bulk import, and results show up
          here for confirmation.
        </p>
      </SectionCard>
    );
  }

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.university_id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="grid gap-5">
      <SectionCard
        title="Discovered links"
        blurb={`${rows.length} link${rows.length === 1 ? "" : "s"} waiting. Items needing a look are listed first. Nothing is live until you confirm it.`}
      >
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
                {items.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-graphite">
                          {TYPE_LABELS[row.discovery_type]}
                          {row.programs?.sport ? ` · ${row.programs.sport}` : ""}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLES[row.confidence]}`}
                        >
                          {CONFIDENCE_LABELS[row.confidence]}
                        </span>
                      </div>
                      {row.discovered_url ? (
                        <a
                          href={row.discovered_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-org-primary underline"
                        >
                          <span className="truncate">{row.discovered_url}</span>
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                      ) : (
                        <p className="mt-1 text-sm text-steel">No link found.</p>
                      )}
                      {row.notes ? <p className="meta mt-1">{row.notes}</p> : null}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {row.discovered_url ? (
                        <button
                          type="button"
                          onClick={() => review.mutate({ id: row.id, decision: "confirm" })}
                          disabled={review.isPending}
                          className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-diamond-green px-3 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          <Check className="size-4" aria-hidden /> Confirm
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => review.mutate({ id: row.id, decision: "reject" })}
                        disabled={review.isPending}
                        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-steel disabled:opacity-60"
                      >
                        <X className="size-4" aria-hidden /> Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
