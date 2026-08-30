# Switch scraping to your own Firecrawl account

Today the pipeline scrapes through a Lovable-managed Firecrawl connection, so scrape credits come out of the managed allowance (1,000/month) rather than your own Firecrawl plan. A full 3,000-program pass needs roughly 12,000 scrapes, so scraping should bill to your account.

## What changes

1. **New Firecrawl connection using your own API key.** A connect card appears in chat — choose **New connection** and pick the "use your own credentials" option, then paste your Firecrawl key (`fc-...`). The existing managed connection stays in the workspace but gets unlinked from this project, so nothing scrapes on the managed allowance any more. The managed connection can't be converted in place; a new connection is the only path.

2. **Point the scraper at Firecrawl directly.** With your own key, calls go straight to Firecrawl's API instead of through Lovable's connector gateway. Only the scrape call changes — URL collection, AI extraction, diffing, auto-apply and the review queue are untouched. AI extraction keeps running on the Lovable AI Gateway (about 0.023 credits per program), which is the cheap half of the cost.

3. **Make credit failures readable.** If your Firecrawl balance runs out mid-pull, the run log currently just shows a raw HTTP error. It will instead say plainly that the Firecrawl account is out of credits, so a stalled quarterly pass is obvious rather than looking like a scrape bug.

4. **Verify on one program.** Re-run the pull on Coastal Carolina baseball and confirm the 4 scrapes land, the same fields are proposed, and the 4 credits show up in your own Firecrawl dashboard rather than the managed one.

## Technical notes

- `src/lib/ingest.server.ts`: replace the `connector-gateway.lovable.dev/firecrawl/v2` base and the `X-Connection-Api-Key` + `LOVABLE_API_KEY` header pair with `https://api.firecrawl.dev/v2` and `Authorization: Bearer ${FIRECRAWL_API_KEY}`. `LOVABLE_API_KEY` is still needed for the AI extraction call, just not for scraping.
- The two auth modes are mutually exclusive — an `fc-` key sent to the gateway, or a `lovc_` key sent to Firecrawl, both fail auth. So the key swap and the code swap must land together.
- Firecrawl `402` responses map to a clear "out of Firecrawl credits" message in `UrlResult.detail` and in the `ingestion_runs.error_message`.
- No database or schema changes.

## Cost picture after the switch

| | Per program | 3,000-program pass |
|---|---|---|
| Firecrawl scrapes (your account) | 4 credits | ~12,000 credits |
| AI extraction (Lovable credits) | ~0.023 | ~70 |
