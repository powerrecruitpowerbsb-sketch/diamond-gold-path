/**
 * safeFetch — the ONE way anything in this codebase reads an athletics or school
 * web page. Every scraper, audit and recheck path must call it.
 *
 * WHY THE PER-HOST QUEUE AND DELAY EXIST — do not "optimise" this away:
 * on 2026-09-08 the page audit fetched a school's roster page and staff page at
 * the same moment (logs show them 0.098s apart on the same host). The host
 * dropped both. That produced 157 FALSE timeouts — pages that were perfectly
 * fine were recorded as unreadable. Small college and JUCO athletics sites are
 * single-server and rate-limited; one request at a time per host, with a couple
 * of seconds between them, is the difference between real data and noise.
 * Concurrency across DIFFERENT hosts is where the speed comes from, and that is
 * kept high.
 *
 * The host queue is a module-level singleton on purpose: two different callers
 * reading the same host must still serialise against each other.
 */

export type FailureCategory =
  | "timeout"
  | "connection_blocked"
  | "http_error"
  | "empty_content"
  | "not_found";

export type FetchMethod = "direct" | "rendered";

export type SafeFetchResult = {
  ok: boolean;
  status: number | null;
  /** Raw HTML when the direct path succeeded, otherwise null. */
  html: string | null;
  /** Readable text/markdown for extraction. Present whenever ok is true. */
  markdown: string | null;
  failure_category: FailureCategory | null;
  fetch_method: FetchMethod | null;
  /** Every path tried, in order — present even when all of them failed. */
  attempted_methods: FetchMethod[];
  /** Did any attempt run through the stealth proxy? */
  stealth_used: boolean;
  attempts: number;

  error: string | null;
};

const REQUEST_TIMEOUT_MS = 30_000;
const BACKOFF_MS = [5_000, 15_000, 45_000];
const HOST_GAP_MS = 2_500;
const GLOBAL_CONCURRENCY = 12;
const MAX_TEXT = 90_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------- scheduling */

/** Tail of the queue for each host, plus when that host was last touched. */
const hostChain = new Map<string, Promise<unknown>>();
const hostLastAt = new Map<string, number>();

let inFlight = 0;
const globalWaiters: Array<() => void> = [];

async function takeGlobalSlot(): Promise<void> {
  if (inFlight < GLOBAL_CONCURRENCY) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => globalWaiters.push(resolve));
  inFlight += 1;
}

function releaseGlobalSlot(): void {
  inFlight -= 1;
  const next = globalWaiters.shift();
  if (next) next();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Run `task` with only one request in flight per host and a gap between
 * consecutive requests to that same host. Different hosts run side by side up to
 * the global limit.
 */
function queueByHost<T>(url: string, task: () => Promise<T>): Promise<T> {
  const host = hostOf(url);
  const previous = hostChain.get(host) ?? Promise.resolve();

  const run = previous.then(async () => {
    const since = Date.now() - (hostLastAt.get(host) ?? 0);
    if (since < HOST_GAP_MS) await sleep(HOST_GAP_MS - since);
    await takeGlobalSlot();
    try {
      return await task();
    } finally {
      releaseGlobalSlot();
      hostLastAt.set(host, Date.now());
    }
  });

  // Keep the chain alive even when a task throws, so one failure cannot wedge a host.
  hostChain.set(
    host,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/* ------------------------------------------------------------- html to text */

/**
 * Turn HTML into the pipe-separated, line-per-row text the extractors already
 * expect from the scraping service, so both paths look the same downstream.
 */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  text = text
    .replace(/<\/(t[dh])>\s*/gi, " | ")
    .replace(/<\/(tr|p|div|li|h[1-6]|section|article|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/ \| $/, "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
}

/**
 * Did the page actually come back with something worth reading? A shell page
 * whose content is drawn by its own scripts lands here, and gets the rendered
 * retry rather than being called unreadable.
 */
export function looksEmpty(text: string): boolean {
  if (text.trim().length < 600) return true;
  const wordy = text.replace(/[^a-z]/gi, "").length;
  if (wordy < 400) return true;
  if (/enable javascript|javascript is required|please enable js/i.test(text) && wordy < 3000) return true;
  return false;
}

/* -------------------------------------------------------------- the two paths */

const BLOCKED_HINTS =
  /connection closed|econnreset|tunnel|socket hang ?up|epipe|ecconn|econnrefused|certificate|ssl|tls|enotfound|eai_again|fetch failed|network|terminated/i;

function classifyThrown(failure: unknown): { category: FailureCategory; message: string } {
  const name = failure instanceof Error ? failure.name : "";
  const message = failure instanceof Error ? failure.message : String(failure);
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out/i.test(message)) {
    return { category: "timeout", message: message || "the page took too long to answer" };
  }
  if (BLOCKED_HINTS.test(message)) return { category: "connection_blocked", message };
  return { category: "connection_blocked", message: message || "the site refused the connection" };
}

type Attempt = {
  ok: boolean;
  status: number | null;
  html: string | null;
  text: string | null;
  category: FailureCategory | null;
  error: string | null;
};

async function directAttempt(url: string): Promise<Attempt> {
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404 || response.status === 410) {
      return { ok: false, status: response.status, html: null, text: null, category: "not_found", error: `page not found (${response.status})` };
    }
    // Amazon's firewall answers a bot with a 202 "challenge" and no page. That is
    // a block, not a slow site, and calling it a timeout hid the real reason.
    if (response.headers.get("x-amzn-waf-action") || response.status === 202) {
      return {
        ok: false,
        status: response.status,
        html: null,
        text: null,
        category: "connection_blocked",
        error: "the site's bot protection blocked the request (firewall challenge)",
      };
    }
    if (response.status === 403 || response.status === 401 || response.status === 429) {
      return {
        ok: false,
        status: response.status,
        html: null,
        text: null,
        category: "connection_blocked",
        error: `the site refused the request (${response.status})`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        html: null,
        text: null,
        category: "http_error",
        error: `the site answered with an error (${response.status})`,
      };
    }

    const html = await response.text();
    const text = htmlToText(html);
    if (looksEmpty(text)) {
      return { ok: false, status: response.status, html, text, category: "empty_content", error: "page returned no readable content" };
    }
    return { ok: true, status: response.status, html, text, category: null, error: null };
  } catch (failure) {
    const { category, message } = classifyThrown(failure);
    return { ok: false, status: null, html: null, text: null, category, error: message };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/**
 * The rendering service. Used whenever the plain request fails for any reason
 * other than a confirmed 404.
 *
 * WHY STEALTH MODE IS ON THE FALLBACK PATH — do not trim it:
 * on 2026-09-08, 94 pages were logged as timeouts. A raw capture on 2026-09-09
 * showed what actually arrives from those hosts: HTTP 202 from CloudFront with
 * `x-amzn-waf-action: challenge`, in 0.07s. That is a bot firewall, not a slow
 * site, and a plain render never clears it, so the fallback goes through the
 * rendering service's stealth proxy instead.
 *
 * WHY THE CEILING IS 58s AND NOT HIGHER: the request goes through the shared
 * connector gateway, which cuts every scrape off at 60s and answers 502. Asking
 * for 90s produced a 502 at exactly 60.1s, three times out of three. A higher
 * ceiling needs a direct scraping-service key, not a bigger number here.
 */
async function renderedAttempt(url: string, stealth = false): Promise<Attempt> {
  try {
    const response = await fetch(`${GATEWAY_FIRECRAWL}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": requireEnv("FIRECRAWL_API_KEY_1"),
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: stealth ? 8000 : 4000,
        ...(stealth ? { proxy: "stealth", timeout: 55_000 } : {}),
      }),
      signal: AbortSignal.timeout(58_000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Rendered read failed [${response.status}] ${url}: ${body.slice(0, 300)}`);
      if (response.status === 402 || /credit limit reached|not enough credits/i.test(body)) {
        throw new Error("the page-reading account is out of credits — top it up before running more pulls");
      }
      if (/404|not found/i.test(body)) {
        return { ok: false, status: 404, html: null, text: null, category: "not_found", error: "page not found" };
      }
      // The gateway gives up on the render at 60s and answers 502/504. Calling
      // that a "timeout" is what hid 94 bot-firewall blocks behind a slow-site
      // label, so it is reported as the block it is.
      if (response.status === 502 || response.status === 504 || /upstream_request_failed|bad gateway/i.test(body)) {
        return {
          ok: false,
          status: response.status,
          html: null,
          text: null,
          category: "connection_blocked",
          error: "the site's bot protection did not release the page within the rendering time limit",
        };
      }
      return {
        ok: false,
        status: response.status,
        html: null,
        text: null,
        category: "http_error",

        error: `rendered read returned ${response.status}`,
      };
    }

    const payload = (await response.json()) as any;
    const markdown: string | undefined = payload?.markdown ?? payload?.data?.markdown;
    if (!markdown || !markdown.trim() || looksEmpty(markdown)) {
      return { ok: false, status: 200, html: null, text: markdown ?? null, category: "empty_content", error: "page returned no readable content" };
    }
    return { ok: true, status: 200, html: null, text: markdown.slice(0, MAX_TEXT), category: null, error: null };
  } catch (failure) {
    if (failure instanceof Error && /out of credits/.test(failure.message)) throw failure;
    const { category, message } = classifyThrown(failure);
    return { ok: false, status: null, html: null, text: null, category, error: message };
  }
}

/* ------------------------------------------------------------------ the door */

export type SafeFetchOptions = {
  /** Skip the plain request for hosts already known to need rendering. */
  preferRendered?: boolean;
  /** Attempts including the first. Default 3. */
  tries?: number;
};

/**
 * Read one web page. Never throws for an unreachable page — the caller gets a
 * structured result and never has to read error wording to know what happened.
 *
 * The rendering fallback fires on ANY failure except a confirmed 404. It used to
 * be limited to blocked/empty answers, which meant a page recorded as a timeout
 * never got the second path at all — the single biggest cause of false failures
 * in the 2026-09-08 pass.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const tries = Math.min(Math.max(options.tries ?? 3, 1), 3);
  let attempts = 0;
  let last: Attempt = { ok: false, status: null, html: null, text: null, category: "timeout", error: "not attempted" };
  let method: FetchMethod = options.preferRendered ? "rendered" : "direct";
  let stealthUsed = false;
  const attemptedMethods: FetchMethod[] = [];

  for (let round = 0; round < tries; round += 1) {
    attempts += 1;
    const useRendered = method === "rendered";
    // Every rendered attempt reached from a failed direct read is a fallback, so
    // it runs through the stealth proxy with the raised ceiling.
    const stealth = useRendered;
    if (stealth) stealthUsed = true;
    attemptedMethods.push(useRendered ? "rendered" : "direct");
    last = await queueByHost(url, () => (useRendered ? renderedAttempt(url, stealth) : directAttempt(url)));

    if (last.ok) {
      return {
        ok: true,
        status: last.status,
        html: last.html,
        markdown: last.text,
        failure_category: null,
        fetch_method: useRendered ? "rendered" : "direct",
        attempted_methods: attemptedMethods,
        stealth_used: stealthUsed,
        attempts,
        error: null,
      };
    }

    // A missing page is a real dead link, not a flaky read. Report it at once.
    if (last.category === "not_found") break;

    // Any other failure of the plain request earns the rendering service — a
    // timeout included, because a bot firewall answers instantly and still ends
    // up looking like a hang further down the chain.
    if (!useRendered) {
      method = "rendered";
      continue;
    }

    // A stealth render that ran out of time will not do better on a second go,
    // and each go is minutes of paid rendering. Report it rather than retry.
    if (last.category === "timeout") break;

    if (round < tries - 1) await sleep(BACKOFF_MS[round] ?? 45_000);
  }

  return {
    ok: false,
    status: last.status,
    html: last.html,
    markdown: last.text,
    failure_category: last.category ?? "timeout",
    fetch_method: null,
    attempted_methods: attemptedMethods,
    stealth_used: stealthUsed,
    attempts,
    error: last.error,
  };
}


/** Reset the shared queue. Tests only. */
export function __resetSafeFetchQueue(): void {
  hostChain.clear();
  hostLastAt.clear();
}
