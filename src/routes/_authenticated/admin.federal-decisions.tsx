import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Globe, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/form-kit";
import { MatchResolver } from "@/components/admin/MatchResolver";
import {
  listFederalSuggestions,
  refreshNationalDirectory,
  runSchoolWebFill,
} from "@/lib/pipeline.functions";


export const Route = createFileRoute("/_authenticated/admin/federal-decisions")({
  head: () => ({
    meta: [
      { title: "Decide the last schools — Curve Recruit" },
      {
        name: "description",
        content:
          "Settle the remaining schools by confirming the suggested national record, choosing another, or parking the school.",
      },
      { property: "og:title", content: "Decide the last schools — Curve Recruit" },
      {
        property: "og:description",
        content: "One-click confirmation of suggested national school records for the leftover schools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FederalDecisions,
});

function FederalDecisions() {
  const suggestionsFn = useServerFn(listFederalSuggestions);
  const refreshDirectoryFn = useServerFn(refreshNationalDirectory);
  const webFillFn = useServerFn(runSchoolWebFill);
  const queryClient = useQueryClient();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["federal-suggestions"],
    queryFn: () => suggestionsFn({ data: { limit: 300 } }) as Promise<any>,
    staleTime: 10 * 60 * 1000,
  });

  const rows: any[] = data?.schools ?? [];
  const directoryReady = data?.directoryReady !== false;
  const withSuggestions = rows.filter((row) => row.suggestions?.length);
  const withoutSuggestions = rows.filter((row) => !row.suggestions?.length);

  const directory = useMutation({
    mutationFn: () => refreshDirectoryFn({}) as Promise<{ stored: number }>,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["federal-suggestions"] });
    },
  });

  const webFill = useMutation({
    mutationFn: (limit: number) => webFillFn({ data: { limit } }) as Promise<any>,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["federal-suggestions"] });
      await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-blocked"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-parked"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-suggestions"] });
  }

  const plainError = (value: unknown) => {
    const message = value instanceof Error ? value.message : String(value ?? "");
    if (/rate limit/i.test(message)) return "The national service is busy right now — try again in a minute.";
    if (/credit/i.test(message)) return "The scraping account is out of credits — top it up and try again.";
    return message || "Something went wrong. Please try again.";
  };

  return (
    <div className="grid gap-5">
      <div>
        <Link to="/admin/pipeline" className="meta inline-flex items-center gap-1 hover:text-graphite">
          <ArrowLeft className="size-3" aria-hidden />
          Back to the collection pipeline
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-graphite">Decide the last schools</h1>
        <p className="mt-1 text-sm text-steel">
          Each school below sits beside the closest record in the national list. Confirm it, pick a
          different one, or park the school if it truly isn't listed. Parking can always be undone.
        </p>
      </div>

      <SectionCard
        title="Fill the gaps from the schools' own websites"
        blurb="For schools the national list doesn't contain, we read their own tuition and admissions pages. Everything found lands in the review queue first."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => webFill.mutate(10)}
            disabled={webFill.isPending}
          >
            <Globe className="mr-2 size-4" aria-hidden />
            {webFill.isPending ? "Reading school websites…" : "Try 10 schools"}
          </Button>
          <Button variant="ghost" onClick={() => webFill.mutate(40)} disabled={webFill.isPending}>
            Run 40 schools
          </Button>
          <Button
            variant="ghost"
            onClick={() => directory.mutate()}
            disabled={directory.isPending}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden />
            {directory.isPending ? "Refreshing the national list…" : "Refresh the national list"}
          </Button>
        </div>
        {webFill.data ? (
          <p className="mt-3 text-sm text-steel">
            Looked at {webFill.data.examined} school(s); {webFill.data.filled} now have data waiting in
            the review queue.
          </p>
        ) : null}
        {webFill.isError ? (
          <p className="mt-3 text-sm text-seam-red">{plainError(webFill.error)}</p>
        ) : null}
        {directory.data ? (
          <p className="mt-2 text-sm text-steel">
            National list stored — {directory.data.stored.toLocaleString()} schools.
          </p>
        ) : null}
        {directory.isError ? (
          <p className="mt-2 text-sm text-seam-red">{plainError(directory.error)}</p>
        ) : null}
      </SectionCard>

      {isPending ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : isError ? (
        <SectionCard title="Couldn't prepare the suggestions" blurb="Nothing was changed.">
          <p className="mt-2 text-sm text-steel">{plainError(error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </SectionCard>
      ) : !directoryReady ? (
        <SectionCard
          title="The national list isn't stored yet"
          blurb="Store it once and this page loads instantly from then on."
        >
          <p className="mt-2 text-sm text-steel">
            Use "Refresh the national list" above — it takes about a minute the first time.
          </p>
        </SectionCard>
      ) : !rows.length ? (
        <SectionCard title="All clear" blurb="Nothing is waiting on a decision.">
          <p className="mt-2 text-sm text-steel">Every school has either been matched or parked.</p>
        </SectionCard>
      ) : (

        <>
          <SectionCard
            title={`Quick wins — ${withSuggestions.length} school(s) with a suggestion`}
            blurb="A likely national record was found for each of these. Confirm to fill in cost and academic details."
          >
            <div className="mt-4 grid gap-2">
              {withSuggestions.map((row) => (
                <MatchResolver
                  key={row.universityId}
                  school={{
                    id: row.universityId,
                    name: row.schoolName,
                    city: row.city,
                    state: row.state,
                    federal_match_status: row.status,
                  }}
                  suggestions={row.suggestions}
                  hasFacts={row.hasFacts}
                  onResolved={refresh}
                />
              ))}
            </div>
          </SectionCard>

          {withoutSuggestions.length ? (
            <SectionCard
              title={`Nothing found — ${withoutSuggestions.length} school(s)`}
              blurb="No close record in the national list. Search by name, or park the school so it stops coming back."
            >
              <div className="mt-4 grid gap-2">
                {withoutSuggestions.map((row) => (
                  <MatchResolver
                    key={row.universityId}
                    school={{
                      id: row.universityId,
                      name: row.schoolName,
                      city: row.city,
                      state: row.state,
                      federal_match_status: row.status,
                    }}
                    suggestions={[]}
                    hasFacts={row.hasFacts}
                    onResolved={refresh}
                  />
                ))}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
