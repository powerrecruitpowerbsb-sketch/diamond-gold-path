import { useOrgBranding } from "@/hooks/use-org-branding";
import { cn } from "@/lib/utils";

/**
 * The organization's mark, wherever one belongs. One upload, one source: the
 * logo saved on the branding screen. Falls back to a lettermark built from the
 * organization name in the organization's own accent color.
 */
export function OrgMark({
  className,
  size = 32,
  fallbackLetter = "P",
  name,
  logoUrl,
}: {
  className?: string | undefined;
  size?: number;
  fallbackLetter?: string;
  /** Override when the caller already has branding (e.g. a themed shell). */
  name?: string | null;
  logoUrl?: string | null;
}) {
  const { branding } = useOrgBranding();
  const url = logoUrl !== undefined ? logoUrl : branding?.logoUrl;
  const label = name !== undefined ? name : branding?.name;
  const letter = (label ?? "").trim().charAt(0).toUpperCase() || fallbackLetter;

  if (url) {
    return (
      <img
        src={url}
        alt={label ? `${label} logo` : "Organization logo"}
        style={{ width: size, height: size }}
        className={cn("rounded-md object-contain", className)}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      className={cn(
        "grid place-items-center rounded-md bg-org-accent font-display font-bold text-org-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {letter}
    </span>
  );
}
