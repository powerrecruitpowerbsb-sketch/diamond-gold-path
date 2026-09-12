import { readFileSync } from "node:fs";
import { parseRoster } from "../src/lib/roster-extract";
import { normalizePosition } from "../src/lib/data-quality";
const dir = "src/lib/__tests__/fixtures/";
for (const [f, sport] of [["ucf-baseball-roster.txt","baseball"],["eckerd-baseball-roster.txt","baseball"],["stetson-softball-roster.txt","softball"],["lsu-baseball-roster.txt","baseball"]] as const) {
  let text: string; try { text = readFileSync(dir+f,"utf8"); } catch { console.log(f,"— no fixture"); continue; }
  const shape = parseRoster(text, sport);
  const p = shape.players as any[];
  const n = (k:string)=>p.filter(x=>x[k]!==null&&x[k]!==undefined&&x[k]!=="").length;
  const groups = [...new Set(p.map(x=>normalizePosition(String(x.position??""))).filter(Boolean))];
  console.log(f, `players=${p.length} state=${n("home_state")} country=${n("home_country")} transfer=${p.filter(x=>x.is_transfer).length} juco=${p.filter(x=>x.is_juco_transfer).length} prevSchool=${n("previous_school")} positions=${groups.join("/")}`);
}
