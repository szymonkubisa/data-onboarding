import { describe, expect, it } from "vitest";
import { buildDataset } from "./build";
import { collectSamples, looksLikePhone, looksLikeUrl, profileColumns } from "./profile";
import type { SourceDataset } from "./types";

function dataset(matrix: string[][]): SourceDataset {
  const result = buildDataset({ id: "d", fileName: "f.csv", fileType: "csv", matrix });
  if (!result.ok) throw new Error(result.error.message);
  return result.dataset;
}

describe("profileColumns", () => {
  const ds = dataset([
    ["Mail", "Site", "Land", "Tel", "Notes"],
    ["a@x.com", "x.com", "UK", "+44 20 7946 0000", ""],
    ["b@y.org", "https://y.org", "Germany", "020 7946 0001", ""],
    ["not-an-email", "", "Narnia", "call me", "x"],
    ["a@x.com", "www.z.io/path", "pl", "", ""],
  ]);
  const [mail, site, land, tel, notes] = profileColumns(ds);

  it("computes pattern ratios over non-empty values", () => {
    expect(mail?.patterns.email).toBe(0.75);
    expect(site?.patterns.url).toBe(1);
    expect(land?.patterns.countryLike).toBe(0.75);
    expect(tel?.patterns.phoneLike).toBe(0.67);
  });

  it("computes fill and distinct ratios", () => {
    expect(mail?.nonEmptyRatio).toBe(1);
    expect(mail?.distinctRatio).toBe(0.75);
    expect(notes?.nonEmptyRatio).toBe(0.25);
  });

  it("contains no raw values", () => {
    const serialized = JSON.stringify(profileColumns(ds));
    expect(serialized).not.toContain("a@x.com");
    expect(serialized).not.toContain("Narnia");
  });
});

describe("collectSamples", () => {
  it("returns distinct, trimmed, length-limited values", () => {
    const ds = dataset([["N"], [" a "], ["a"], [""], ["b".repeat(100)], ["c"], ["d"]]);
    const samples = collectSamples(ds, "c-001", 3, 10);
    expect(samples).toEqual(["a", "bbbbbbbbb…", "c"]);
  });
});

describe("value patterns", () => {
  it.each(["acme.com", "https://acme.com/x", "www.acme.co.uk"])("url: %s", (v) => {
    expect(looksLikeUrl(v)).toBe(true);
  });
  it.each(["12.5", "a@b.com", "hello", "acme"])("not url: %s", (v) => {
    expect(looksLikeUrl(v)).toBe(false);
  });
  it.each(["+48 22 123 45 67", "(020) 7946-0000", "555-1234"])("phone: %s", (v) => {
    expect(looksLikePhone(v)).toBe(true);
  });
  it.each(["12", "call me", "1234567890123456"])("not phone: %s", (v) => {
    expect(looksLikePhone(v)).toBe(false);
  });
});
