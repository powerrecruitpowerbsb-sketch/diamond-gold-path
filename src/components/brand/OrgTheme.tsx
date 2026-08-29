import type { CSSProperties, ReactNode } from "react";

/**
 * Applies per-organization branding.
 *
 * Only --org-primary and --org-accent are ever emitted here. The fixed
 * platform semantics (--seam-red for "Our Intelligence", --diamond-green for
 * "Verified Data") are deliberately absent and must stay that way: they encode
 * fact vs. opinion, not decoration.
 */
export function OrgTheme({
  primaryColor,
  accentColor,
  children,
}: {
  primaryColor?: string | null;
  accentColor?: string | null;
  children: ReactNode;
}) {
  const style: CSSProperties = {};
  if (primaryColor) (style as Record<string, string>)["--org-primary"] = primaryColor;
  if (accentColor) (style as Record<string, string>)["--org-accent"] = accentColor;

  return (
    <div style={style} className="contents">
      {children}
    </div>
  );
}
