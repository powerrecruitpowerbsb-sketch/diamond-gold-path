import { parseRoster } from "@/lib/roster-extract";
const page = `
| # | Name | Pos. | Cl. |
| --- | --- | --- | --- |
| 5 | Jaden Santiago | C/INF | JR |
| 7 | Anthony Temesvary | C/ | SO |
`;
console.log(parseRoster(page, "baseball").players.map((p) => [p.name, p.position, p.position_raw]));
