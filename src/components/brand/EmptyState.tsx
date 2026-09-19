import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A first-five-minutes moment, not an apology. Headline, one line of context,
 * one real action. Brand-tinted icon well follows the organization's colors.
 */
export function EmptyState({
  icon: Icon,
  headline,
  children,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  headline: string;
  /** One short line. Optional. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-5 grid size-14 place-items-center rounded-full bg-org-accent-tint">
          <Icon className="size-6 text-org-accent-strong" />
        </span>
      ) : null}
      <h3 className="font-display text-2xl leading-tight font-bold text-org-primary">{headline}</h3>
      {children ? (
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-steel">{children}</p>
      ) : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
