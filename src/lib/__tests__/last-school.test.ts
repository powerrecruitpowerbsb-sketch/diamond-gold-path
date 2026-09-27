import { afterEach, describe, expect, it } from "vitest";
import { parseRoster, setKnownColleges } from "@/lib/roster-extract";

const card = (n: number, name: string, place: string) =>
  [`#${n}`, name, "RHP 6 3 215 lbs", place].join("\n");

describe("unlabelled and last-school transfers", () => {
  afterEach(() => setKnownColleges(null));

  it("reads a college between hometown and class (Clemson layout)", () => {
    setKnownColleges(["University of Georgia", "Mercer University"]);
    const page = [
      card(1, "Drew Titsworth", "Frankenmuth, Mich. Frankenmuth HS Jr."),
      card(2, "Bryce Clavon", "Stockbridge, Ga. Georgia So."),
      card(3, "Ty Dalley", "Vidalia, Ga. Mercer Sr."),
      card(4, "Tryston McCladdie", "Harlem, Ga. Harlem HS Jr."),
    ].join("\n");
    const byName = Object.fromEntries(parseRoster(page, "baseball").players.map((p) => [p.name, p.is_transfer]));
    expect(byName).toMatchObject({ "Drew Titsworth": false, "Bryce Clavon": true, "Ty Dalley": true, "Tryston McCladdie": false });
  });

  it("never treats a bare unknown name as a college", () => {
    setKnownColleges(["University of Georgia"]);
    const page = card(1, "Avery Noel", "Ridgeley, W.Va. Central So.");
    expect(parseRoster(page, "softball").players[0]?.is_transfer).toBe(false);
  });
});
