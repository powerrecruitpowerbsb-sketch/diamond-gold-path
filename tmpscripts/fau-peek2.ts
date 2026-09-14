import { scrapePage } from "@/lib/ingest.server";
const page = await scrapePage(process.argv[2]!);
const md = (page as any).markdown ?? "";
const lines = md.split("\n");
const i = lines.findIndex((l: string) => /B\/T/i.test(l));
console.log(lines.slice(i, i + 60).map((l: string, n: number) => `${i + n}: ${l}`).join("\n"));
