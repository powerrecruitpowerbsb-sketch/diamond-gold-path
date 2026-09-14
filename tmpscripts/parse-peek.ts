import { parseRoster } from "@/lib/roster-extract";
const md = `| Pos.
| Ht.
| Wt.
| B/T
| Academic Year
| Hometown
1 | Danny Baez
| OF | 6' 1'' | 200 | L/R | Sr. | Oviedo, Fla. | Indian River
2 | Brett Patten
| OF | 6' 2'' | 200 | L/L | Jr. | Manasquan, N.J. | Indian River
`;
console.log(JSON.stringify(parseRoster(md, "baseball").players, null, 1));
