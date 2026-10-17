import { describe, expect, it } from "vitest";
import { countryCount, resolveCountry } from "./countries";

const nameOf = (value: string) => {
  const result = resolveCountry(value);
  return result.status === "match" ? result.country.name : result.status;
};

describe("resolveCountry", () => {
  it.each([
    ["UK", "United Kingdom"],
    ["GB", "United Kingdom"],
    ["GBR", "United Kingdom"],
    [" United Kingdom ", "United Kingdom"],
    ["u.k.", "United Kingdom"],
    ["Great Britain", "United Kingdom"],
    ["USA", "United States"],
    ["U.S.A.", "United States"],
    ["United States of America", "United States"],
    ["de", "Germany"],
    ["Deutschland", "Germany"],
    ["POLSKA", "Poland"],
    ["Czech Republic", "Czechia"],
    ["the Netherlands", "Netherlands"],
    ["Holland", "Netherlands"],
    ["Cote d'Ivoire", "Côte d'Ivoire"],
    ["côte d’ivoire", "Côte d'Ivoire"],
    ["Turkey", "Türkiye"],
    ["Bosnia & Herzegovina", "Bosnia and Herzegovina"],
    ["españa", "Spain"],
  ])("%s → %s", (input, expected) => {
    expect(nameOf(input)).toBe(expected);
  });

  it.each(["Narnia", "", "  ", "XX", "Europe"])("%s is unknown", (input) => {
    expect(resolveCountry(input).status).toBe("unknown");
  });

  it("treats NA as ambiguous instead of guessing Namibia", () => {
    expect(resolveCountry("NA").status).toBe("ambiguous");
    expect(nameOf("Namibia")).toBe("Namibia");
    expect(nameOf("NAM")).toBe("Namibia");
  });

  it("reports how the value matched", () => {
    expect(resolveCountry("Poland")).toMatchObject({ matchedBy: "name" });
    expect(resolveCountry("Polska")).toMatchObject({ matchedBy: "alias" });
    expect(resolveCountry("PL")).toMatchObject({ matchedBy: "alpha2" });
    expect(resolveCountry("POL")).toMatchObject({ matchedBy: "alpha3" });
  });

  it("covers every ISO 3166-1 entry", () => {
    expect(countryCount()).toBe(249);
  });
});
