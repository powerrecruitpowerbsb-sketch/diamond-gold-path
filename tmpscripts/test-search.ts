const r = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/search", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": process.env.FIRECRAWL_API_KEY_1! },
  body: JSON.stringify({ query: "Benedictine University at Mesa Arizona tuition cost of attendance", limit: 5 }),
});
const j = await r.json() as any;
console.log(r.status, JSON.stringify(j).slice(0, 1200));
