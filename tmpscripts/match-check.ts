import { findFederalRecord } from "../src/lib/federal-data.server";
const cases: [string, string | null][] = [
  ["The Ohio State University","OH"],["Regis College (Massachusetts)","MA"],
  ["State University of New York at Brockport","NY"],["North Carolina A&T State University","NC"],
  ["Rutgers, The State University of New Jersey, New Brunswick","NJ"],
  ["Texas A&M University, College Station","TX"],["Pomona-Pitzer Colleges","CA"],
  ["Batten University","VA"],["Simon Fraser University",null],
  ["The University of North Carolina at Charlotte","NC"],["Wesleyan University (Connecticut)","CT"],
  ["Pennsylvania Western University, California","PA"],["The Citadel","SC"],
  ["Vermont State University Castleton","VT"],["Penn State Berks College","PA"],
];
for (const [name, state] of cases) {
  try {
    const m = await findFederalRecord(name, state);
    console.log(m.status.padEnd(10), name, "=>", m.row ? m.row["school.name"] : m.candidates.slice(0,3).map(c=>c.name).join(" | ") || "-");
  } catch (e) { console.log("ERROR", name, (e as Error).message); }
}
