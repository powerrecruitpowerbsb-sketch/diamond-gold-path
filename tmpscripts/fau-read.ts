import { scrapePage } from "@/lib/ingest.server";
import { readRoster } from "@/lib/roster-read.server";
const page = await scrapePage(process.argv[2]!);
const md = (page as any).markdown ?? "";
const read = await readRoster(md, process.argv[3] ?? "baseball");
console.log("reader", read.reader, "players", read.players.length);
console.log(JSON.stringify(read.players.slice(0, 3), null, 1));
