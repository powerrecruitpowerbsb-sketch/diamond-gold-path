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

/** Blend two hex colors in sRGB so the result's readability can be measured. */
function blend(a: string, b: string, weight: number): string | null {
  const parse = (hex: string) => {
    const value = hex.trim().replace("#", "");
    const full =
      value.length === 3
        ? value
            .split("")
            .map((c) => c + c)
            .join("")
        : value;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  const mixed = left.map((channel, i) =>
    Math.round(channel * weight + right[i]! * (1 - weight)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function OrgTheme({
  primaryColor,
  accentColor,
  sport,
  children,
}: {
  primaryColor?: string | null;
  accentColor?: string | null;
  /** The sport the app is currently showing; marks derive from the brand colors. */
  sport?: "baseball" | "softball" | null;
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

  // Softball gets a companion tone of the same two brand colors, so both
  // sports stay unmistakably the club's. Baseball keeps the primary itself.
  if (sport === "softball") {
    const base = primaryColor && accentColor ? blend(primaryColor, accentColor, 0.55) : null;
    const tone = base ?? "color-mix(in oklab, var(--org-primary) 55%, var(--org-accent))";
    style["--sport-strong"] = tone;
    style["--sport-tint"] = `color-mix(in oklab, ${tone} 12%, white)`;
    style["--sport-line"] = `color-mix(in oklab, ${tone} 55%, white)`;
    const fg = base ? readableOn(base) : null;
    style["--sport-foreground"] = fg ?? "#ffffff";
  } else if (primaryColor) {
    style["--sport-strong"] = primaryColor;
    style["--sport-tint"] = `color-mix(in oklab, ${primaryColor} 12%, white)`;
    style["--sport-line"] = `color-mix(in oklab, ${primaryColor} 55%, white)`;
    style["--sport-foreground"] = readableOn(primaryColor) ?? "#ffffff";
  }


  return (
    <div style={style as CSSProperties} className="contents">
      {children}
    </div>
  );
}
