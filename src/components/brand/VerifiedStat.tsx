import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single Verified Data card: green tint, circular checkmark seal, VERIFIED label.
 * Fixed diamond green — never themed.
 */
export function VerifiedStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl bg-diamond-green-tint p-4 shadow-[0_1px_2px_rgba(18,35,58,0.04)]",
        className,
      )}
    >
      <span
        className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-diamond-green"
        aria-hidden
      >
        <Check className="size-3 text-white" strokeWidth={3} />
      </span>
      <p className="meta text-diamond-green">{label.toUpperCase()}</p>
      <p className="tabular mt-2 font-display text-2xl leading-none font-bold text-graphite">
        {value}
      </p>
      <p className="meta mt-2 text-diamond-green/80">{hint ? hint : "VERIFIED"}</p>
    </div>
  );
}

/** Stitched-seam divider between verified fact and staff opinion. */
export function StitchDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-8", className)} aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <span key={index} className="h-3 w-0.5 -skew-x-[28deg] rounded-full bg-seam-red/70" />
        ))}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
