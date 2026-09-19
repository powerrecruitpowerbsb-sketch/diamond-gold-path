import { SPORTS, SPORT_LABEL, type Sport } from "@/lib/sport";
import { cn } from "@/lib/utils";

/**
 * The one sport the app is showing. Sits in the header, and only appears once
 * an organization actually has players in both sports — a baseball-only club
 * never sees a control it would never touch.
 */
export function SportSwitch({
  sport,
  onChange,
  className,
}: {
  sport: Sport;
  onChange: (next: Sport) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Sport"
      className={cn("inline-flex rounded border border-white/25 bg-white/10 p-0.5", className)}
    >
      {SPORTS.map((option) => {
        const active = option === sport;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-sm px-3 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-sport-strong text-sport-foreground"
                : "text-white/70 hover:text-white",
            )}
          >
            {SPORT_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}
