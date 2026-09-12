import { writeFileSync } from "node:fs";
import { safeFetch } from "@/lib/safe-fetch.server";
const targets: [string,string][] = [
  ["ucf-baseball-roster.txt","https://ucfknights.com/sports/baseball/roster"],
  ["lsu-softball-staff-directory.txt","https://lsusports.net/staff-directory/"],
  ["eckerd-baseball-roster.txt","https://eckerdtritons.com/sports/baseball/roster"],
  ["stetson-softball-roster.txt","https://gohatters.com/sports/softball/roster"],
];
for (const [name,url] of targets) {
  try {
    const r: any = await safeFetch(url);
    const body = r?.html ?? r?.text ?? r?.content ?? "";
    console.log(name, url, String(body).length);
    if (body) writeFileSync(`/tmp/cap-${name}`, String(body));
  } catch (e:any) { console.log(name, "FAIL", e?.message); }
}
