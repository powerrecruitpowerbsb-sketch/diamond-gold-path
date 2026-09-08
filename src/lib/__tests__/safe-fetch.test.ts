import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetSafeFetchQueue, htmlToText, looksEmpty, safeFetch } from "@/lib/safe-fetch.server";
import { normalizeSchoolName } from "@/lib/link-audit.server";

const page = (body: string) => `<html><body>${body}</body></html>`;
const bulk = page(`<table>${"<tr><td>Player Name</td><td>Pitcher</td><td>Junior</td></tr>".repeat(60)}</table>`);

afterEach(() => {
  __resetSafeFetchQueue();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("safeFetch", () => {
  it("reads a page directly and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bulk, { status: 200 })),
    );
    const result = await safeFetch("https://example.edu/roster");
    expect(result.ok).toBe(true);
    expect(result.fetch_method).toBe("direct");
    expect(result.markdown).toContain("Player Name");
    expect(result.attempts).toBe(1);
  });

  it("records a missing page at once and does not retry it", async () => {
    const spy = vi.fn(async () => new Response("gone", { status: 404 }));
    vi.stubGlobal("fetch", spy);
    const result = await safeFetch("https://example.edu/missing");
    expect(result.ok).toBe(false);
    expect(result.failure_category).toBe("not_found");
    expect(result.attempts).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps requests to one host one at a time", { timeout: 20_000 }, async () => {
    let live = 0;
    let maxLive = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        live += 1;
        maxLive = Math.max(maxLive, live);
        await new Promise((resolve) => setTimeout(resolve, 5));
        live -= 1;
        return new Response(bulk, { status: 200 });
      }),
    );
    await Promise.all([
      safeFetch("https://one.edu/roster"),
      safeFetch("https://one.edu/coaches"),
      safeFetch("https://one.edu/schedule"),
    ]);
    expect(maxLive).toBe(1);
  });

  it("falls back to the rendering service when the host refuses the plain request", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: any) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("connector-gateway")) {
          return new Response(JSON.stringify({ markdown: bulk.repeat(2) }), { status: 200 });
        }
        return new Response("no", { status: 403 });
      }),
    );
    process.env["LOVABLE_API_KEY"] = "test";
    process.env["FIRECRAWL_API_KEY_1"] = "test";
    const result = await safeFetch("https://blocked.edu/roster");
    expect(result.ok).toBe(true);
    expect(result.fetch_method).toBe("rendered");
    expect(calls.some((url) => url.includes("connector-gateway"))).toBe(true);
  });

  it("treats an empty shell page as worth rendering", () => {
    expect(looksEmpty(htmlToText(page("<div>Please enable JavaScript</div>")))).toBe(true);
    expect(looksEmpty(htmlToText(bulk))).toBe(false);
  });
});

describe("school name matching", () => {
  it("treats en dashes and hyphens as the same", () => {
    expect(normalizeSchoolName("Linn–Benton Community College")).toBe(
      normalizeSchoolName("Linn-Benton Community College"),
    );
    expect(normalizeSchoolName("Texas A&M University–San Antonio")).toBe(
      normalizeSchoolName("Texas A&M University - San Antonio"),
    );
  });
});
