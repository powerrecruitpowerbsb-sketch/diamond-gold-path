import { describe, expect, it } from "vitest";

import { pageOwnership, registrableDomain, resolveSharedDomain, schoolAcronym } from "@/lib/program-ownership";

const UCF = {
  schoolName: "University of Central Florida",
  schoolWebsite: "https://www.ucf.edu",
};
const CENTRAL_FLORIDA_JUCO = {
  schoolName: "College of Central Florida",
  schoolWebsite: "https://www.cf.edu",
};

describe("does this page belong to this school?", () => {
  it("trusts the school's own domain, including athletics subdomains", () => {
    expect(pageOwnership({ url: "https://athletics.ucf.edu/roster", ...UCF }).strength).toBe("own_domain");
  });

  it("recognises a nickname domain that uses the school's initials", () => {
    expect(pageOwnership({ url: "https://ucfknights.com/sports/baseball", ...UCF }).strength).toBe(
      "named_in_domain",
    );
  });

  it("does not let the Ocala junior college claim UCF's athletics site", () => {
    const claim = pageOwnership({ url: "https://ucfknights.com/sports/baseball", ...CENTRAL_FLORIDA_JUCO });
    expect(claim.strength).toBe("unproven");

    const { winner, losers } = resolveSharedDomain([
      { schoolId: "ucf", verdict: pageOwnership({ url: "https://ucfknights.com", ...UCF }) },
      { schoolId: "cf", verdict: claim },
    ]);
    expect(winner?.schoolId).toBe("ucf");
    expect(losers.map((row) => row.schoolId)).toEqual(["cf"]);
  });

  it("leaves a genuine tie alone rather than guessing", () => {
    const verdict = pageOwnership({ url: "https://gobearcats.com", schoolName: "Nowhere State" });
    const { winner, losers } = resolveSharedDomain([
      { schoolId: "a", verdict },
      { schoolId: "b", verdict },
    ]);
    expect(winner).toBeNull();
    expect(losers).toEqual([]);
  });

  it("reduces hosts to the domain that identifies the owner", () => {
    expect(registrableDomain("athletics.ucf.edu")).toBe("ucf.edu");
    expect(registrableDomain("ucfknights.com")).toBe("ucfknights.com");
    expect(schoolAcronym("University of Central Florida")).toBe("ucf");
  });
});

describe("near-identical school names", () => {
  const claim = (schoolId: string, schoolName: string, url: string, schoolWebsite?: string) => ({
    schoolId,
    verdict: pageOwnership({ url, schoolName, schoolWebsite }),
  });

  it("settles nothing when both schools' names appear in the address", () => {
    const url = "https://bethanybison.com";
    const { winner, losers } = resolveSharedDomain([
      claim("a", "Bethany College", url),
      claim("b", "Bethany College (West Virginia)", url),
    ]);
    expect(winner).toBeNull();
    expect(losers).toHaveLength(0);
  });

  it("clears only the school with no claim at all on the address", () => {
    const url = "https://ucfknights.com";
    const { winner, losers } = resolveSharedDomain([
      claim("jc", "College of Central Florida", url),
      claim("ucf", "University of Central Florida", url, "https://ucf.edu"),
    ]);
    expect(winner?.schoolId).toBe("ucf");
    expect(losers.map((l) => l.schoolId)).toEqual(["jc"]);
  });

  it("does not let a rival keep an address just because its own site was overwritten", () => {
    // duhawks.com is Loras'; nothing in the address names either school.
    const url = "https://duhawks.com";
    const { winner } = resolveSharedDomain([
      claim("loras", "Loras College", url),
      claim("dbq", "University of Dubuque", url),
    ]);
    expect(winner).toBeNull();
  });
});
