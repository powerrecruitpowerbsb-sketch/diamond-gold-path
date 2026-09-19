import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getTrueFit } from "@/lib/true-fit.functions";
import { CONFIDENCE_LABELS, TIER_LABELS, type Confidence, type Tier } from "@/lib/true-fit";
import { cn } from "@/lib/utils";

function tierClass(tier: Tier) {
  if (tier === "safety") return "border-border bg-muted text-graphite";
  if (tier === "target") return "border-org-primary bg-org-primary/10 text-graphite";
  if (tier === "reach") return "border-border bg-background text-graphite";
  return "border-dashed border-border bg-background text-steel";
}

function Card({
  title,
  headline,
  detail,
  confidence,
  className,
  children,
}: {
  title: string;
  headline: string;
  detail: string;
  confidence: Confidence;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border p-4", className ?? "border-border bg-background")}>
      <p className="meta uppercase tracking-wide text-steel">{title}</p>
      <p className="font-display text-lg text-graphite">{headline}</p>
      <p className="mt-1 text-sm text-steel">{detail}</p>
      {children}
      <p className="mt-2 meta text-steel">{CONFIDENCE_LABELS[confidence]}</p>
    </div>
  );
}

/**
 * True fit: academics, the depth in front of this athlete at their own
 * position, and whether the program already recruits from their state. A school
 * we hold no roster for is never marked down for it — the card says the data is
 * pending and stops there.
 */
export function TrueFitPanel({
  programId,
  athleteId,
}: {
  programId: string;
  athleteId: string | null;
}) {
  const fitFn = useServerFn(getTrueFit);
  const fit = useQuery({
    queryKey: ["true-fit", programId, athleteId],
    queryFn: () => fitFn({ data: { programId, athleteId: athleteId! } }),
    enabled: Boolean(athleteId),
    retry: false,
  });

  if (!athleteId) {
    return (
      <p className="text-sm text-steel">
        Pick an athlete to see how they line up with this program.
      </p>
    );
  }
  if (fit.isLoading) return <p className="text-sm text-steel">Working it out…</p>;
  if (fit.error) return <p className="text-sm text-steel">{(fit.error as Error).message}</p>;
  if (!fit.data) return null;

  const { academic, depth, footprint, athlete, school } = fit.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={cn("rounded-lg border p-4", tierClass(academic.tier))}>
          <p className="meta uppercase tracking-wide text-steel">Academic fit</p>
          <p className="font-display text-lg">{TIER_LABELS[academic.tier]}</p>
          {academic.reasons.length ? (
            <ul className="mt-1 space-y-1 text-sm text-steel">
              {academic.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {academic.missing.length ? (
            <p className="mt-2 text-sm text-steel">
              To say more: {academic.missing.join("; ")}.
            </p>
          ) : null}
          {school.testOptional ? (
            <p className="mt-2 meta text-steel">This school is test optional.</p>
          ) : null}
          <p className="mt-2 meta text-steel">{CONFIDENCE_LABELS[academic.confidence]}</p>
        </div>

        <Card
          title={depth.groupLabel ? `Depth at ${depth.groupLabel.toLowerCase()}` : "Roster depth"}
          headline={depth.headline}
          detail={depth.detail}
          confidence={depth.confidence}
        >
          {depth.seasonYear ? (
            <p className="mt-2 meta text-steel">
              {depth.seasonYear} roster · {depth.rosterSize} players
            </p>
          ) : null}
        </Card>

        <Card
          title="Recruiting footprint"
          headline={footprint.headline}
          detail={footprint.detail}
          confidence={footprint.confidence}
        >
          {footprint.topStates.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {footprint.topStates.map((row) => (
                <span
                  key={row.state}
                  className={cn(
                    "rounded border px-2 py-0.5 meta",
                    row.state === footprint.homeState
                      ? "border-org-primary bg-org-primary/10 text-graphite"
                      : "border-border text-steel",
                  )}
                >
                  {row.state} {row.count}
                </span>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <p className="meta text-steel">
        {athlete.name}
        {athlete.gradYear ? ` · ${athlete.gradYear}` : ""}
        {athlete.primaryPosition ? ` · ${athlete.primaryPosition}` : ""}
        {athlete.homeState ? ` · ${athlete.homeState}` : ""}
        {school.division ? ` vs ${school.governingBody ?? ""} ${school.division}`.trimEnd() : ""}
      </p>
    </div>
  );
}
