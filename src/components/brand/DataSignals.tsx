import type { ReactNode } from "react";
import { BadgeCheck, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Verified Data indicator — sourced, factual information.
 * Fixed diamond green. Never themeable.
 */
export function VerifiedChip({
  children = "Verified",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-diamond-green-tint px-2 py-1 text-xs font-semibold text-diamond-green",
        className,
      )}
    >
      <BadgeCheck className="size-3.5" strokeWidth={2.25} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Our Intelligence block — proprietary staff insight (opinion, not fact).
 * Fixed seam red. Never themeable.
 */
export function IntelBlock({
  title = "Our Intelligence",
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-l-4 border-seam-red bg-seam-red-tint p-4 text-sm text-graphite",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-seam-red uppercase">
        <Lightbulb className="size-3.5" strokeWidth={2.25} aria-hidden />
        {title}
      </div>
      {children}
    </div>
  );
}

/** Mono metadata line for provenance. */
export function SourceLine({
  sourceLabel,
  sourceUrl,
  lastVerifiedAt,
  className,
}: {
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  lastVerifiedAt?: string | null;
  className?: string;
}) {
  const verified = lastVerifiedAt
    ? new Date(lastVerifiedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <p className={cn("meta", className)}>
      {sourceUrl ? (
        <>
          Source:{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-org-primary"
          >
            {sourceLabel ?? new URL(sourceUrl).hostname.replace(/^www\./, "")}
          </a>
        </>
      ) : (
        <>Source: {sourceLabel ?? "—"}</>
      )}
      {verified ? <> · Last verified: {verified}</> : null}
    </p>
  );
}
