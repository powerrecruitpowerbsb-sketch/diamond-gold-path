import { describe, expect, it } from "vitest";

import {
  looksLikeIndividualBio,
  pathNamesOtherSport,
  replacementDecision,
  verifyPagePurpose,
} from "@/lib/page-purpose";

const ROSTER = Array.from({ length: 12 }, (_, i) => `| ${i + 1} | Player Number${i} | RHP | Jr. | Tampa, FL |`).join(
  "\n",
);

describe("addresses", () => {
  it("rejects another sport outright", () => {
    expect(pathNamesOtherSport("https://fscmocs.com/sports/esports", null)).toBe("esports");
    expect(pathNamesOtherSport("https://saintleolions.com/sports/pom", "baseball")).toBe("pom");
    expect(pathNamesOtherSport("https://x.com/sports/baseball/roster", "softball")).toBe("baseball");
    expect(pathNamesOtherSport("https://x.com/sports/softball/roster", "softball")).toBeNull();
  });

  it("spots an individual bio page", () => {
    expect(looksLikeIndividualBio("https://x.com/sports/pom-squad/roster/coaches/kimesha-norris/785")).toBe(true);
    expect(looksLikeIndividualBio("https://x.com/sports/baseball/coaches")).toBe(false);
    expect(looksLikeIndividualBio("https://x.com/sports/baseball/roster/2024")).toBe(false);
  });
});

describe("athletics index", () => {
  const args = { kind: "athletic_website" as const, schoolWebsite: "https://www.ucf.edu" };

  it("refuses the school homepage", () => {
    expect(verifyPagePurpose({ ...args, url: "https://www.ucf.edu", text: "x".repeat(500) }).code).toBe(
      "school_homepage",
    );
  });

  it("refuses giving and visit sections", () => {
    expect(verifyPagePurpose({ ...args, url: "https://giving.utexas.edu", text: null }).code).toBe(
      "not_athletics_section",
    );
    expect(verifyPagePurpose({ ...args, url: "https://visit.stetson.edu", text: null }).code).toBe(
      "not_athletics_section",
    );
  });

  it("accepts a page that lists the teams", () => {
    const text = "Athletics | Baseball | Softball | Basketball | Soccer | Schedule".repeat(20);
    expect(verifyPagePurpose({ ...args, url: "https://ucfknights.com", text }).ok).toBe(true);
  });
});

describe("roster and staff", () => {
  it("needs several players for a roster", () => {
    expect(
      verifyPagePurpose({ kind: "roster_page", url: "https://x.com/sports/baseball/roster", sport: "baseball", text: ROSTER + "\nBaseball Roster" }).ok,
    ).toBe(true);
    expect(
      verifyPagePurpose({ kind: "roster_page", url: "https://x.com/sports/baseball/roster", sport: "baseball", text: "Baseball roster coming soon. " + "x".repeat(400) }).code,
    ).toBe("no_roster_found");
  });

  it("needs more than one coach for a staff listing", () => {
    const staff = "Head Coach Jim Smith. Assistant Coach Amy Lee. Pitching Coach Bo Ray. " + "x".repeat(300);
    expect(verifyPagePurpose({ kind: "coaching_staff_page", url: "https://x.com/sports/baseball/coaches", sport: "baseball", text: staff }).ok).toBe(true);
    expect(
      verifyPagePurpose({ kind: "coaching_staff_page", url: "https://x.com/sports/baseball/coaches", sport: "baseball", text: "Head Coach Jim Smith bio. " + "x".repeat(400) }).code,
    ).toBe("not_a_staff_listing");
  });

  it("an unread page never passes", () => {
    expect(verifyPagePurpose({ kind: "roster_page", url: "https://x.com/sports/baseball/roster", sport: "baseball", text: null }).code).toBe(
      "page_not_read",
    );
  });
});

describe("replacement", () => {
  it("never overwrites on an unread or unverified page", () => {
    expect(replacementDecision({ storedValue: "https://a", proposedRead: false, proposedVerified: false, storedFails: true }).action).toBe("keep_stored");
    expect(replacementDecision({ storedValue: "https://a", proposedRead: true, proposedVerified: false, storedFails: true }).action).toBe("keep_stored");
  });

  it("only replaces when the stored value demonstrably fails", () => {
    expect(replacementDecision({ storedValue: "https://a", proposedRead: true, proposedVerified: true, storedFails: false }).action).toBe("review");
    expect(replacementDecision({ storedValue: "https://a", proposedRead: true, proposedVerified: true, storedFails: true }).action).toBe("replace");
  });

  it("fills an empty field when the page checks out", () => {
    expect(replacementDecision({ storedValue: null, proposedRead: true, proposedVerified: true, storedFails: false }).action).toBe("fill_empty");
  });
});
