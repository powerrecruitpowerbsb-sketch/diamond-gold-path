import { scrape } from "../src/lib/ingest.server";
for (const url of [
  "https://gobearcats.com/sports/baseball/coaches",
  "https://gobearcats.com/staff-directory/department/baseball",
]) {
  try {
    const md = await scrape(url);
    console.log("==", url, md.length);
    console.log(md.split("\n").filter((l) => /head coach/i.test(l)).slice(0, 6).join("\n"));
    await Bun.write(`/tmp/cincy-${url.split("/").pop()}.md`, md);
  } catch (error) {
    console.log("==", url, "FAILED", (error as Error).message.slice(0, 200));
  }
}
