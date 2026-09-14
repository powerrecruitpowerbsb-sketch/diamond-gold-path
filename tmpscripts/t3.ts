import { cardLines } from "@/lib/roster-extract";
const page=`
2026 Baseball Roster
48 Zane Kelly
Senior 6 2 200 lbs
RHP Las Vegas, Nev. Faith Lutheran HS
12 Jabin Trosky
Freshman 6 0 170 lbs
IF Carmel, Calif. Palma HS
`;
const lines = cardLines(page.split("\n").map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean));
lines.forEach((l,i)=>console.log(i,JSON.stringify(l)));
