import { describe, expect, it } from "vitest";
import { athleticsHomeFor, classifyLink, junkSectionPath } from "@/lib/link-quality";

const school = "https://www.sewanee.edu";

describe("athletics site links that land on one team's page", () => {
  it("trims a single-sport page back to the athletics home page", () => {
    expect(athleticsHomeFor("https://mutigers.com/sports/cross-country", "https://missouri.edu"))
      .toBe("https://mutigers.com");
    expect(athleticsHomeFor("https://calvinknights.com/sports/msoc", "https://calvin.edu"))
      .toBe("https://calvinknights.com");
  });

  it("keeps the athletics site but saves the home page for a softball path", () => {
    const verdict = classifyLink({
      kind: "athletic_website",
      url: "https://sewaneetigers.com/sports/sball/index",
      schoolWebsite: school,
    });
    expect(verdict.action).toBe("approve");
    expect(verdict.normalizedUrl).toBe("https://sewaneetigers.com");
  });

  it("leaves a plain athletics home page alone", () => {
    const verdict = classifyLink({
      kind: "athletic_website",
      url: "https://sewaneetigers.com",
      schoolWebsite: school,
    });
    expect(verdict.action).toBe("approve");
    expect(verdict.normalizedUrl).toBeUndefined();
  });

  it("does not trim an athletics section hosted on the school's own site", () => {
    expect(
      athleticsHomeFor("https://pima.edu/community/community-services/athletics.html", "https://pima.edu"),
    ).toBeNull();
  });

  it("rejects news, tag, store and jobs pages", () => {
    for (const url of [
      "https://springarbor.edu/news-and-stories/athletics",
      "https://eac.edu/tag/athletics",
      "https://www.huntington.edu/blog/category/athletics",
      "https://www.bkstr.com/nauathleticsstore/home",
    ]) {
      expect(
        classifyLink({ kind: "athletic_website", url, schoolWebsite: "https://example.edu" }).action,
      ).toBe("reject");
    }
  });

  it("spots inside-section paths", () => {
    expect(junkSectionPath("https://x.edu/news/athletics")).toBe(true);
    expect(junkSectionPath("https://xtigers.com/sports/baseball")).toBe(false);
  });

  it("still refuses a wrong-sport page for a roster link", () => {
    const verdict = classifyLink({
      kind: "roster_page",
      url: "https://mutigers.com/sports/cross-country/roster",
      sport: "baseball",
    });
    expect(verdict.action).toBe("reject");
  });
});
