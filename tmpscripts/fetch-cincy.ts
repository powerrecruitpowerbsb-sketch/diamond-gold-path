const key = process.env.FIRECRAWL_API_KEY_1!;
for (const url of ["https://gobearcats.com/sports/baseball/coaches", "https://gobearcats.com/staff-directory/department/baseball"]) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const json: any = await res.json();
  const md = json?.data?.markdown ?? "";
  console.log("==", url, res.status, md.length);
  const lines = md.split("\n").filter((l: string) => /head coach/i.test(l));
  console.log(lines.slice(0, 6).join("\n"));
  if (md) await Bun.write(`/tmp/cincy-${url.split("/").pop()}.md`, md);
}
