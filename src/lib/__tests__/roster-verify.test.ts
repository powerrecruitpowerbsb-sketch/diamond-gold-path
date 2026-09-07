import { describe, expect, it } from "vitest";

import { hasRosterSignal, verifyAgainstSource } from "@/lib/ingest.server";
import { rosterKeepable, rosterVerdict } from "@/lib/data-quality";

const PAGE = `
| 12 | Jorge Ramírez | RHP | JR | Tampa, FL |
| 4 | Danny O'Connell | INF | FR | Omaha, NE |
Sam Carter
Freshman
`;

describe("hasRosterSignal", () => {
  it("keeps a chunk that lists players", () => {
    expect(hasRosterSignal(PAGE)).toBe(true);
  });

  it("skips a menu/footer chunk", () => {
    expect(hasRosterSignal("Home | Tickets | Shop | Privacy Policy | Contact Us")).toBe(false);
  });
});

describe("verifyAgainstSource", () => {
  it("keeps names written on the page, accents and apostrophes included", () => {
    const { kept, dropped } = verifyAgainstSource(
      [{ name: "Jorge Ramirez" }, { name: "Danny OConnell" }, { name: "Sam Carter" }],
      PAGE,
    );
    expect(kept.map((p) => p.name)).toEqual(["Jorge Ramirez", "Danny OConnell", "Sam Carter"]);
    expect(dropped).toEqual([]);
  });

  it("drops invented players", () => {
    const { kept, dropped } = verifyAgainstSource(
      [{ name: "Jorge Ramirez" }, { name: "Wyatt Nobody" }],
      PAGE,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toEqual(["Wyatt Nobody"]);
  });

  it("does not let scattered words vouch for a player", () => {
    const { dropped } = verifyAgainstSource([{ name: "Sam Ramirez" }], PAGE);
    expect(dropped).toEqual(["Sam Ramirez"]);
  });
});

describe("oversized rosters", () => {
  const players = Array.from({ length: 61 }, (_, i) => ({ name: `Player ${i}` }));

  it("never applies automatically above 60 players", () => {
    expect(rosterVerdict({ season_year: 2026, players }, "https://x.edu/roster").auto).toBe(false);
    expect(rosterKeepable({ season_year: 2026, players }).keep).toBe(false);
  });
});
