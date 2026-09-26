import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getTrueFit } from "@/lib/true-fit.functions";
import { CONFIDENCE_LABELS, TIER_LABELS, type Confidence, type Tier } from "@/lib/true-fit";
import { cn } from "@/lib/utils";

function tierClass(tier: Tier) {
  if (tier === "target") return "text-org-primary";
  if (tier === "safety") return "text-diamond-green";
  if (tier === "reach") return "text-seam-red";
  return "text-steel";
}

function Card({
  title,
  headline,
  headlineClass,
  detail,
  confidence,
  children,
}: {
  title: string;
  headline: string;
  headlineClass?: string;
  detail?: string | null;
  confidence: Confidence;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-org-primary" aria-hidden />
      <p className="font-mono text-[10px] tracking-wide text-steel uppercase">{title}</p>
      <p className={cn("font-display mt-1.5 text-2xl leading-none font-bold text-graphite", headlineClass)}>
        {headline}
      </p>
      {detail ? <p className="mt-2 text-sm text-steel">{detail}</p> : null}
      {children}
      <p className="mt-auto pt-3 font-mono text-[10px] tracking-wide text-steel/80 uppercase">
        {CONFIDENCE_LABELS[confidence]}
      </p>
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
    return <p className="text-sm text-steel">Pick a player first.</p>;
  }
  if (fit.isLoading) return <p className="text-sm text-steel">Loading…</p>;
  if (fit.error) return <p className="text-sm text-steel">{(fit.error as Error).message}</p>;
  if (!fit.data) return null;

  const { academic, depth, footprint, athlete, school } = fit.data;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] tracking-wide text-steel uppercase">
        {[athlete.name, athlete.gradYear, athlete.primaryPosition, athlete.homeState]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card
          title="Academics"
          headline={TIER_LABELS[academic.tier]}
          headlineClass={tierClass(academic.tier)}
          confidence={academic.confidence}
        >
          {academic.reasons.length ? (
            <ul className="mt-2 space-y-1 text-sm text-graphite">
              {academic.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {academic.missing.length ? (
            <p className="mt-2 text-xs text-steel">Missing: {academic.missing.join(", ")}</p>
          ) : null}
          {school.testOptional ? (
            <span className="mt-2 inline-flex w-fit rounded border border-border px-2 py-0.5 font-mono text-[10px] text-steel uppercase">
              Test optional
            </span>
          ) : null}
        </Card>

        <Card
          title={depth.groupLabel ? `Depth · ${depth.groupLabel}` : "Roster depth"}
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
          title="Footprint"
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
