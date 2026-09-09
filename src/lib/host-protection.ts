/**
 * Recognising a site whose own firewall refuses automated reads.
 *
 * This is deliberately narrow. It fires only on the signatures we captured from
 * real failing hosts on 2026-09-09, so an ordinary slow or broken page is never
 * mistaken for a protected one:
 *
 *   Amazon (CloudFront / AWS WAF) — HTTP 202 with `x-amzn-waf-action: challenge`,
 *   answered in about 0.07s, body a ~2KB challenge shell.
 *
 *   Cloudflare — HTTP 403 or 503 from `server: cloudflare`, with `cf-mitigated:
 *   challenge` or the "Just a moment…" / `cf-chl` interstitial in the body.
 *
 * Once a host is known to be protected we stop paying for stealth renders
 * against it and mark its pages "blocked by the site", which is a state of its
 * own: not missing, not unreadable, and never a reason to change or clear a
 * stored address.
 */

export type ProtectionKind = "aws_waf" | "cloudflare" | "akamai" | "perimeterx";

export type ProtectionSignal = { kind: ProtectionKind; evidence: string };

type HeaderBag = { get(name: string): string | null };

const header = (headers: HeaderBag, name: string) => (headers.get(name) ?? "").toLowerCase();

export function detectHostProtection(input: {
  status: number | null;
  headers: HeaderBag;
  body?: string | null;
}): ProtectionSignal | null {
  const { status, headers } = input;
  const body = (input.body ?? "").slice(0, 4_000);

  const wafAction = header(headers, "x-amzn-waf-action");
  if (wafAction) {
    return { kind: "aws_waf", evidence: `HTTP ${status ?? "?"} x-amzn-waf-action: ${wafAction}` };
  }
  if (status === 202 && /cloudfront/i.test(header(headers, "via") + header(headers, "server") + header(headers, "x-cache"))) {
    return { kind: "aws_waf", evidence: "HTTP 202 challenge from CloudFront" };
  }

  const server = header(headers, "server");
  const mitigated = header(headers, "cf-mitigated");
  const cloudflare = server.includes("cloudflare") || Boolean(header(headers, "cf-ray"));
  if (cloudflare && (mitigated.includes("challenge") || (status === 403 || status === 503) && /just a moment|cf-chl|challenge-platform|attention required/i.test(body))) {
    return { kind: "cloudflare", evidence: `HTTP ${status ?? "?"} Cloudflare challenge${mitigated ? ` (cf-mitigated: ${mitigated})` : ""}` };
  }

  if (/akamai/i.test(server) && (status === 403 || status === 503) && /reference #\d|access denied/i.test(body)) {
    return { kind: "akamai", evidence: `HTTP ${status ?? "?"} Akamai access denied` };
  }
  if (header(headers, "x-px-block") || /perimeterx|px-captcha/i.test(body)) {
    return { kind: "perimeterx", evidence: `HTTP ${status ?? "?"} PerimeterX challenge` };
  }

  return null;
}

/** Plain-language wording for a protection kind, safe to show anywhere. */
export function protectionLabel(kind: string): string {
  if (kind === "aws_waf") return "Amazon firewall challenge";
  if (kind === "cloudflare") return "Cloudflare human check";
  if (kind === "akamai") return "Akamai access denied";
  if (kind === "perimeterx") return "PerimeterX human check";
  return "bot protection";
}
