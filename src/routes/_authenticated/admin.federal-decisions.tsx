import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { SectionCard } from "@/components/admin/form-kit";
import { MatchResolver } from "@/components/admin/MatchResolver";
import { listFederalSuggestions } from "@/lib/pipeline.functions";

export const Route = createFileRoute("/_authenticated/admin/federal-decisions")({
  head: () => ({
    meta: [
      { title: "Decide the last schools — Power Recruit" },
      {
        name: "description",
        content:
          "Settle the remaining schools by confirming the suggested national record, choosing another, or parking the school.",
      },
      { property: "og:title", content: "Decide the last schools — Power Recruit" },
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
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ["federal-suggestions"],
    queryFn: () => suggestionsFn({ data: { limit: 300 } }) as Promise<any[]>,
    staleTime: 10 * 60 * 1000,
  });

  const rows = data ?? [];
  const withSuggestions = rows.filter((row) => row.suggestions?.length);
  const withoutSuggestions = rows.filter((row) => !row.suggestions?.length);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-blocked"] });
    await queryClient.invalidateQueries({ queryKey: ["federal-parked"] });
  }

  return (
    <div className="grid gap-5">
      <div>
        <Link to="/admin/pipeline" className="meta inline-flex items-center gap-1 hover:text-graphite">
          <ArrowLeft className="size-3" aria-hidden />
          Back to the collection pipeline
        </Link>
        <h1 className="mt-1 font-display text-3xl font-bold text-graphite">Decide the last schools</h1>
        <p className="mt-1 text-sm text-steel">
          Each school below sits beside the closest record in the national list. Confirm it, pick a
          different one, or park the school if it truly isn't listed. Parking can always be undone.
        </p>
      </div>

      {isPending ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : isError ? (
        <SectionCard title="Couldn't prepare the suggestions" blurb="Please try again in a moment.">
          <p className="mt-2 text-sm text-steel">
            The national list didn't load this time. Reload the page to have another go.
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
