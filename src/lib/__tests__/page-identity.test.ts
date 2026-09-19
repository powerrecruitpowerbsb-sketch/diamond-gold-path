import { describe, expect, it } from "vitest";

import { nonVarsityPage, pageNamesSchool, verifyPageIdentity } from "@/lib/page-identity";

const page = (body: string) => `${body}\n`.padEnd(120, " .");

describe("pageNamesSchool", () => {
  it("accepts the page that spells out the school", () => {
    expect(pageNamesSchool(page("Alfred University Saxons Baseball Roster"), "Alfred University")).toBe(true);
  });

  it("rejects a look-alike that shares no distinctive word", () => {
    expect(pageNamesSchool(page("Campbellsville University Tigers Baseball"), "Campbell University")).toBe(false);
  });

  it("leaves closer look-alikes to the full check", () => {
    // "Alfred" alone is shared, so only verifyPageIdentity can separate these two.
    expect(
      verifyPageIdentity({ text: page("Alfred State College Pioneers Baseball"), schoolName: "Alfred University" })
        .verdict,
    ).toBe("wrong_school");
  });


  it("accepts initials-only branding", () => {
    expect(pageNamesSchool(page("UCF Knights Baseball Coaching Staff"), "University of Central Florida")).toBe(true);
  });
});

describe("verifyPageIdentity", () => {
  const cases: { name: string; text: string; school: string; expected: string; names?: string }[] = [
    {
      name: "Florida State holding Jacksonville's roster",
      text: page("Florida State College at Jacksonville Blue Wave Baseball Roster"),
      school: "Florida State University",
      expected: "wrong_school",
    },
    {
      name: "Portland State holding Penn State's page",
      text: page("Penn State Nittany Lions Baseball 2026 Roster"),
      school: "Portland State University",
      // An unrelated school's name alone is not proof: it goes on the exception list.
      expected: "unclear",
    },
    {
      name: "Campbell holding Campbellsville",
      text: page("Campbellsville University Tigers Softball Coaches"),
      school: "Campbell University",
      expected: "wrong_school",
    },
    {
      name: "Georgetown University holding Georgetown College",
      text: page("Georgetown College Tigers Baseball Roster Kentucky"),
      school: "Georgetown University",
      expected: "wrong_school",
    },
    {
      name: "Chaminade University holding a high school JV team",
      text: page("Chaminade High School JV Baseball Roster Mineola New York"),
      school: "Chaminade University of Honolulu",
      expected: "non_varsity",
    },
    {
      name: "a real match",
      text: page("Gonzaga University Bulldogs Baseball 2026 Roster"),
      school: "Gonzaga University",
      expected: "confirmed",
    },
  ];

  for (const item of cases) {
    it(item.name, () => {
      const result = verifyPageIdentity({ text: item.text, schoolName: item.school });
      expect(result.verdict).toBe(item.expected);
    });
  }

  it("trusts a page on the school's own website even when unnamed", () => {
    const result = verifyPageIdentity({
      text: page("Baseball Roster 2026 Pitchers Catchers Infielders"),
      url: "https://athletics.alvernia.edu/sports/baseball/roster",
      schoolName: "Alvernia University",
      schoolWebsite: "https://www.alvernia.edu",
    });
    expect(result.verdict).toBe("confirmed");
  });

  it("never guesses when the page names nobody", () => {
    const result = verifyPageIdentity({
      text: page("Baseball Roster Pitchers Catchers Infielders Outfielders"),
      url: "https://gogriffs.com/sports/bsb/roster",
      schoolName: "Canisius University",
    });
    expect(result.verdict).toBe("unclear");
  });

  it("ignores skip-to-content furniture attached to the school's own name", () => {
    const result = verifyPageIdentity({
      text: page("College of the Desert Skip To Main Content Roar Baseball Roster"),
      url: "https://codathletics.com/sports/baseball/roster",
      schoolName: "College of the Desert",
    });
    expect(result.verdict).toBe("confirmed");
  });

  it("ignores carousel furniture in a header", () => {
    const result = verifyPageIdentity({
      text: page("All Rotators Playing Millersville University Marauders Baseball Roster"),
      url: "https://millersvilleathletics.com/sports/baseball/roster",
      schoolName: "Millersville University",
    });
    expect(result.verdict).toBe("confirmed");
  });

  it("trusts a page on the school's athletics domain without reading any name", () => {
    const result = verifyPageIdentity({
      text: page("Rotators Playing Louisiana Tech University Athletics Skip To"),
      url: "https://latechsports.com/sports/baseball/roster/2026",
      schoolName: "Louisiana Tech University",
      athleticsSite: "https://latechsports.com",
    });
    expect(result.verdict).toBe("confirmed");
    expect(result.reason).toContain("athletics domain");
  });

  it("does not let a stored roster address vouch for the page being tested", () => {
    const result = verifyPageIdentity({
      text: page("Georgetown College Tigers Baseball Roster Skip To Main Content"),
      url: "https://gohoyas.com/sports/baseball/roster",
      schoolName: "Georgetown University",
      // The very value under test used to be handed in as proof of itself.
      ownDomains: ["https://gohoyas.com/sports/baseball/roster"],
    });
    expect(result.verdict).toBe("wrong_school");
  });

  it("still refuses a genuine look-alike on an unrelated domain", () => {
    const result = verifyPageIdentity({
      text: page("Georgetown College Tigers Baseball Roster Skip To Main Content"),
      url: "https://gohoyas.com/sports/baseball/roster",
      schoolName: "Georgetown University",
      athleticsSite: "https://guhoyas.com",
    });
    expect(result.verdict).toBe("wrong_school");
  });

  it("says nothing about a page that came back empty", () => {
    expect(verifyPageIdentity({ text: "", schoolName: "Rollins College" }).verdict).toBe("unclear");
  });
});


describe("nonVarsityPage", () => {
  it("catches club-sports subdomains", () => {
    expect(nonVarsityPage("Baseball roster", "https://clubsports.fairfield.edu/baseball")).toBeTruthy();
  });

  it("catches developmental and JV squads by name", () => {
    expect(nonVarsityPage(page("Barry Buccaneers Developmental Team Softball"))).toBeTruthy();
    expect(nonVarsityPage(page("Junior Varsity Baseball Coaching Staff"))).toBeTruthy();
  });

  it("leaves a varsity page alone", () => {
    expect(nonVarsityPage(page("Barry University Buccaneers Baseball Coaching Staff"))).toBeNull();
  });
});

describe("non-varsity menu links", () => {
  it("does not treat a site-menu JV link as the page's own team", () => {
    const body =
      "Corban University Warriors Baseball 2026 Roster " +
      "Pitchers Catchers Infielders Outfielders ".repeat(6) +
      "More Sports JV Baseball Club Sports Intramural";
    expect(nonVarsityPage(body, "https://corbanwarriors.com/sports/baseball/roster")).toBeNull();
    expect(
      verifyPageIdentity({
        text: body,
        url: "https://corbanwarriors.com/sports/baseball/roster",
        schoolName: "Corban University",
        athleticsSite: "https://corbanwarriors.com",
      }).verdict,
    ).toBe("confirmed");
  });

  it("still catches a JV page by its own headline or address", () => {
    expect(nonVarsityPage(page("JV Baseball Roster 2026 Lancaster"))).toBeTruthy();
    expect(nonVarsityPage("Baseball Roster", "https://x.com/sports/club-softball/roster")).toBeTruthy();
  });
});
