import { describe, expect, it } from "vitest";
import { filterMapPrograms, type CollegeMapProgram, type CollegeMapFilters } from "../college-map";

const programs: CollegeMapProgram[] = [
  { id: "a", school: "Rollins College", city: "Winter Park", state: "FL", sport: "baseball", body: "NCAA", division: "D2", conference: "SSC", coordinates: [-81.35, 28.59] },
  { id: "b", school: "Rollins College", city: "Winter Park", state: "FL", sport: "softball", body: "NCAA", division: "D2", conference: "SSC", coordinates: [-81.35, 28.59] },
  { id: "c", school: "Unlocated College", city: null, state: "FL", sport: "baseball", body: "NJCAA", division: "D1", conference: null, coordinates: null },
];
const filters: CollegeMapFilters = { q: "", sport: "baseball", state: "", body: "", division: "", conference: "" };
describe("college map results", () => {
  it("keeps baseball and softball separate", () => {
    expect(filterMapPrograms(programs, filters).map((p) => p.id)).toEqual(["a", "c"]);
    expect(filterMapPrograms(programs, { ...filters, sport: "softball" }).map((p) => p.id)).toEqual(["b"]);
  });
  it("applies name, state, association, division, and conference together", () => {
    expect(filterMapPrograms(programs, { ...filters, q: "ROLLINS", state: "FL", body: "NCAA", division: "D2", conference: "SSC" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterMapPrograms(programs, { ...filters, state: "CA" })).toEqual([]);
  });
  it("lists unlocated schools without inventing map points", () => {
    expect(filterMapPrograms(programs, filters).map((p) => p.id)).toContain("c");
    expect(filterMapPrograms(programs, filters, [-82, 28, -81, 29]).map((p) => p.id)).toEqual(["a"]);
    expect(filterMapPrograms(programs, filters, [-100, 30, -90, 40])).toEqual([]);
  });
});