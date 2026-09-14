import { scrapePage } from "@/lib/ingest.server";
const page:any = await scrapePage("https://goutsa.com/sports/baseball/roster");
const md = page.markdown ?? page.content ?? "";
const lines = md.split("\n").map((l:string)=>l.replace(/\s+/g," ").trim()).filter(Boolean);
const i = lines.findIndex((l:string)=>/Outfielder 5 9 180/.test(l));
console.log(JSON.stringify(lines.slice(i-6,i+8),null,1));
