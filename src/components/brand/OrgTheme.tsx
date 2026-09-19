import type { CSSProperties, ReactNode } from "react";

/**
 * Applies per-organization branding.
 *
 * Only --org-primary and --org-accent (plus shades derived from them) are ever
 * emitted here. The fixed platform semantics (--seam-red for "Our
 * Intelligence", --diamond-green for "Verified Data") are deliberately absent
 * and must stay that way: they encode fact vs. opinion, not decoration.
 *
 * Nothing in the UI hardcodes a brand color. An organization that uploads blue
 * and white re-themes every button, chip, nav marker and bar automatically.
 */

/** Relative luminance of a hex color, or null when it isn't parseable. */
function luminance(hex: string): number | null {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const channel = (pair: string) => {
    const srgb = parseInt(pair, 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(full.slice(0, 2)) +
    0.7152 * channel(full.slice(2, 4)) +
    0.0722 * channel(full.slice(4, 6))
  );
}

/** Readable text color to sit on a filled brand swatch. */
function readableOn(hex: string): string | null {
  const l = luminance(hex);
  if (l === null) return null;
  return l > 0.45 ? "#12233a" : "#ffffff";
}

export function OrgTheme({
  primaryColor,
  accentColor,
  children,
}: {
  primaryColor?: string | null;
  accentColor?: string | null;
  children: ReactNode;
}) {
  const style = {} as Record<string, string>;
  if (primaryColor) {
    style["--org-primary"] = primaryColor;
    style["--org-primary-tint"] = `color-mix(in oklab, ${primaryColor} 10%, white)`;
  }
  if (accentColor) {
    style["--org-accent"] = accentColor;
    style["--org-accent-strong"] = `color-mix(in oklab, ${accentColor} 88%, black)`;
    style["--org-accent-pressed"] = `color-mix(in oklab, ${accentColor} 76%, black)`;
    style["--org-accent-tint"] = `color-mix(in oklab, ${accentColor} 14%, white)`;
    const fg = readableOn(accentColor);
    if (fg) style["--org-accent-foreground"] = fg;
  }

  return (
    <div style={style as CSSProperties} className="contents">
      {children}
    </div>
  );
}
