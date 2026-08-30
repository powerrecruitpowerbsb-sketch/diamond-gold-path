import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, DownloadCloud, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listIngestRuns, runProgramIngest } from "@/lib/ingest.functions";
import { cn } from "@/lib/utils";

type UrlResult = { url: string; purpose: string; status: string; detail?: string };

type Outcome = {
  runId: string | null;
  programLabel: string;
  status: "success" | "partial" | "failed";
  urlResults: UrlResult[];
  proposalsCreated: number;
  snapshotWritten: boolean;
  rosterPlayers: number;
  errorMessage: string | null;
};

type Run = {
  id: string;
  status: string;
  url_results: UrlResult[] | null;
  proposals_created: number | null;
  snapshot_written: boolean | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  scraped: "Scraped",
  scrape_failed: "Scrape failed",
  extract_failed: "Extraction failed",
  empty: "Nothing usable found",
};

export function IngestPanel({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const runFn = useServerFn(runProgramIngest);
  const historyFn = useServerFn(listIngestRuns);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const { data: runs = [] } = useQuery({
    queryKey: ["ingest-runs", programId],
    queryFn: () => historyFn({ data: { programId } }),
  });
  const history = runs as unknown as Run[];
  const running = history.some((run) => run.status === "running");

  const pull = useMutation({
    mutationFn: () => runFn({ data: { programId } }),
    onSuccess: async (result) => {
      const next = result as unknown as Outcome;
      setOutcome(next);
      if (next.status === "failed") toast.error(next.errorMessage ?? "The data pull failed");
      else if (next.status === "partial") toast.warning("Data pull finished with some errors");
      else toast.success(`Proposed ${next.proposalsCreated} field change(s)`);
      await queryClient.invalidateQueries({ queryKey: ["ingest-runs", programId] });
      await queryClient.invalidateQueries({ queryKey: ["pending-changes"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-changes-count"] });
      await queryClient.invalidateQueries({ queryKey: ["roster-snapshots", programId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = pull.isPending || running;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-graphite">Data pull</h2>
          <p className="mt-1 max-w-xl text-sm text-steel">
            Scrapes the school and athletics URLs on file, extracts fields with AI, and files
            everything into the review queue. Nothing reaches live records until you approve it.
          </p>
        </div>
        <Button
          className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
          disabled={busy}
          onClick={() => pull.mutate()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <DownloadCloud className="size-4" aria-hidden />
          )}
          {busy ? "Pulling data…" : "Pull latest data"}
        </Button>
      </div>

      {busy ? (
        <p className="meta mt-4">
          SCRAPING PAGES AND EXTRACTING FIELDS — THIS USUALLY TAKES 30–90 SECONDS
        </p>
      ) : null}

      {outcome ? (
        <div
          className={cn(
            "mt-4 rounded-lg border p-4",
            outcome.status === "failed"
              ? "border-seam-red/40 bg-seam-red-tint"
              : outcome.status === "partial"
                ? "border-org-accent/50 bg-org-accent/10"
                : "border-diamond-green/40 bg-diamond-green-tint",
          )}
        >
          <p className="flex items-center gap-2 font-semibold text-graphite">
            {outcome.status === "success" ? (
              <CheckCircle2 className="size-4 text-diamond-green" aria-hidden />
            ) : (
              <AlertTriangle className="size-4 text-seam-red" aria-hidden />
            )}
            {outcome.status === "failed"
              ? "Pull failed"
              : `Proposed ${outcome.proposalsCreated} change${outcome.proposalsCreated === 1 ? "" : "s"}`}
          </p>
          {outcome.errorMessage ? (
            <p className="mt-1 text-sm text-graphite">{outcome.errorMessage}</p>
          ) : null}
          {outcome.snapshotWritten ? (
            <p className="mt-1 text-sm text-graphite tabular-nums">
              Roster snapshot saved — {outcome.rosterPlayers} players recorded.
            </p>
          ) : null}

          <ul className="mt-3 space-y-1.5">
            {outcome.urlResults.map((result) => (
              <li key={`${result.purpose}-${result.url}`} className="text-sm">
                <span className="meta">{result.purpose.replace(/_/g, " ").toUpperCase()}</span>{" "}
                <span
                  className={cn(
                    "font-semibold",
                    result.status === "scraped" ? "text-diamond-green" : "text-seam-red",
                  )}
                >
                  {STATUS_LABEL[result.status] ?? result.status}
                </span>
                {result.detail ? <span className="text-steel"> — {result.detail}</span> : null}
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-steel underline hover:text-graphite"
                >
                  {result.url}
                </a>
              </li>
            ))}
          </ul>

          {outcome.proposalsCreated > 0 ? (
            <Button asChild className="mt-4 touch-target">
              <Link to="/admin/review" search={{ program: programId }}>
                Review {outcome.proposalsCreated} proposed item
                {outcome.proposalsCreated === 1 ? "" : "s"}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {history.length ? (
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left text-steel">Run</th>
              <th className="py-2 pr-3 text-left text-steel">Result</th>
              <th className="py-2 text-left text-steel">Proposals</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.id} className="border-b border-border/60">
                <td className="py-2 pr-3 tabular-nums text-graphite">
                  {new Date(run.started_at).toLocaleString()}
                </td>
                <td className="py-2 pr-3 text-graphite">
                  {run.status}
                  {run.error_message ? (
                    <span className="text-steel"> — {run.error_message}</span>
                  ) : null}
                </td>
                <td className="py-2 tabular-nums text-graphite">{run.proposals_created ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
