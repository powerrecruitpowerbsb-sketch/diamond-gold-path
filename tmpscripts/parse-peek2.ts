import { parseRoster } from "@/lib/roster-extract";
const md = `| Pos.
| Ht.
| Wt.
| B/T
| Academic Year
| Hometown
| Previous Team
| Instagram
| Twitter
1 | Danny Baez
| OF | 6' 1'' | 200 | L/R | Sr. | Oviedo, Fla. | Indian River | DaniBaez3 | danibaez24
`;
const p = parseRoster(md, "baseball").players[0]!;
console.log(p.name, "bats", p.bats, "raw", p.bats_raw, "prev", p.previous_school);
