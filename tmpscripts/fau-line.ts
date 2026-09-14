import { scrapePage } from "@/lib/ingest.server";
const page = await scrapePage("https://fausports.com/sports/baseball/roster");
const md = (page as any).markdown ?? "";
const lines = md.split("\n");
const i = lines.findIndex((l: string) => /Danny Baez/.test(l));
console.log(JSON.stringify(lines.slice(i - 1, i + 2)));
