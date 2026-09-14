import { parseRoster, cardLines } from "@/lib/roster-extract";
const page=`
2026 Baseball Roster
48 Zane Kelly
Senior 6 2 200 lbs
RHP Las Vegas, Nev. Faith Lutheran HS
12 Jabin Trosky
Freshman 6 0 170 lbs
IF Carmel, Calif. Palma HS
`;
console.log(cardLines(page.split("\n").map(l=>l.trim()).filter(Boolean)));
console.log(parseRoster(page,"baseball").players);
