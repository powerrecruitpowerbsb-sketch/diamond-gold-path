import type React from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type ActionTone = "primary" | "secondary" | "tertiary" | "destructive";
export type ActionSize = "sm" | "md" | "lg";

/**
 * The one action treatment in the product.
 *
 * Every color here resolves from the organization's own uploaded brand colors
 * through the --org-accent family. Nothing is hardcoded to a particular brand.
 */
export function actionClass(
  tone: ActionTone = "primary",
  size: ActionSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-md font-semibold",
    "transition-[background-color,color,border-color,box-shadow,transform] duration-150",
    "outline-none focus-visible:ring-2 focus-visible:ring-org-accent/60 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px",
    size === "sm" && "h-9 px-3 text-[13px]",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-12 px-7 text-base",
    tone === "primary" &&
      cn(
        "bg-org-accent text-org-accent-foreground shadow-[0_1px_0_rgba(18,35,58,0.18)]",
        "hover:bg-org-accent-strong active:bg-org-accent-pressed active:shadow-none",
      ),
    tone === "secondary" &&
      "border border-org-accent bg-card text-org-accent-strong hover:bg-org-accent-tint",
    tone === "tertiary" && "px-1 text-org-accent-strong hover:underline",
    tone === "destructive" && "bg-seam-red text-white hover:bg-seam-red/90",
    className,
  );
}

type BaseProps = {
  tone?: ActionTone;
  size?: ActionSize;
  children: ReactNode;
  className?: string;
};

export function ActionButton({
  tone = "primary",
  size = "md",
  className,
  children,
  ...rest
}: BaseProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button type="button" className={actionClass(tone, size, className)} {...rest}>
      {children}
    </button>
  );
}

/** Same treatment for navigation. */
export function ActionLink({
  tone = "primary",
  size = "md",
  className,
  children,
  ...rest
}: BaseProps & Record<string, unknown>) {
  const LinkAny = Link as unknown as React.ComponentType<Record<string, unknown>>;
  return (
    <LinkAny {...rest} className={actionClass(tone, size, className)}>
      {children}
    </LinkAny>
  );
}

/**
 * A disclosure control ("More filters", stage picker). Deliberately not a form
 * input: brand-tinted, brand-bordered, with a live count when something is set
 * behind it.
 */
export function DisclosureButton({
  open,
  count,
  children,
  className,
  ...rest
}: {
  open?: boolean;
  count?: number;
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-md border px-4 text-sm font-semibold",
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-org-accent/60",
        open
          ? "border-org-accent bg-org-accent text-org-accent-foreground"
          : "border-org-accent bg-org-accent-tint text-org-accent-strong hover:bg-org-accent/25",
        className,
      )}
      {...rest}
    >
      {children}
      {count ? (
        <span className="grid size-5 place-items-center rounded-full bg-org-accent-strong text-[11px] font-bold text-org-accent-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      <span
        className={cn("transition-transform duration-150", open && "rotate-180")}
        aria-hidden
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  );
}
