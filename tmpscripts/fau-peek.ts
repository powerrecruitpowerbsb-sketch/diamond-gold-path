import { scrapePage } from "@/lib/ingest.server";
const url = process.argv[2]!;
const page = await scrapePage(url);
const md = (page as any).markdown ?? "";
const lines = md.split("\n");
const i = lines.findIndex((l: string) => /B\/T/i.test(l));
console.log(JSON.stringify(lines.slice(Math.max(0, i - 3), i + 6), null, 1));
