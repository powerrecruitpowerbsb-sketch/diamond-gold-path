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
  return l > 0.4 ? "#0a0f18" : "#f1f5f9";
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

  // The two brand colors as uploaded, with the platform defaults as a stand-in
  // so the sport swap still reads when nothing has been uploaded yet.
  const brandPrimary = primaryColor || "#d3a94e";
  const brandAccent = accentColor || "#4f86c6";

  /*
   * Softball flips the club's own two colors: the accent becomes the dominant
   * color of the whole app and the primary steps back to the accent role. A
   * light accent (gold, yellow, white) is deepened against the club's dark tone
   * first, so filled surfaces keep readable text everywhere.
   */
  const swap = sport === "softball";
  let effPrimary = brandPrimary;
  let effAccent = brandAccent;
  if (swap) {
    effPrimary = brandAccent;
    effAccent = brandPrimary;
  }

  /*
   * On the midnight canvas a very dark brand color would disappear, so anything
   * below a readable luminance is lifted toward chalk until it carries. The hue
   * the club uploaded is preserved — only its brightness moves.
   */
  const lift = (hex: string) => {
    const l = luminance(hex);
    if (l === null) return hex;
    if (l >= 0.22) return hex;
    const weight = l < 0.08 ? 0.5 : 0.68;
    return blend(hex, "#f1f5f9", weight) ?? hex;
  };
  effPrimary = lift(effPrimary);
  effAccent = lift(effAccent);

  // Tints are mixed into the card surface, not white: on midnight a white-based
  // tint would blow a hole in the page.
  const SURFACE = "#121c2c";

  style["--org-primary"] = effPrimary;
  style["--org-primary-tint"] = `color-mix(in oklab, ${effPrimary} 16%, ${SURFACE})`;
  // Brand primary as readable text on midnight.
  style["--org-primary-strong"] = `color-mix(in oklab, ${effPrimary} 82%, white)`;
  style["--org-primary-foreground"] = readableOn(effPrimary) ?? "#0a0f18";
  style["--navy-deep"] = blend(effPrimary, "#080d15", 0.1) ?? "#0b1422";

  style["--org-accent"] = effAccent;
  style["--org-accent-strong"] = `color-mix(in oklab, ${effAccent} 88%, white)`;
  style["--org-accent-pressed"] = `color-mix(in oklab, ${effAccent} 76%, white)`;
  style["--org-accent-tint"] = `color-mix(in oklab, ${effAccent} 18%, ${SURFACE})`;
  const accentFg = readableOn(effAccent);
  if (accentFg) style["--org-accent-foreground"] = accentFg;

  // The active-sport marks follow the dominant color of that sport.
  style["--sport-strong"] = effPrimary;
  style["--sport-tint"] = `color-mix(in oklab, ${effPrimary} 18%, ${SURFACE})`;
  style["--sport-line"] = `color-mix(in oklab, ${effPrimary} 55%, ${SURFACE})`;
  style["--sport-foreground"] = readableOn(effPrimary) ?? "#0a0f18";



  return (
    <div style={style as CSSProperties} className="contents">
      {children}
    </div>
  );
}
