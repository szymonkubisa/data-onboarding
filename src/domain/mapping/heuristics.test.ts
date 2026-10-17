import { describe, expect, it } from "vitest";
import type { ColumnProfile } from "../dataset/profile";
import { SUPPLIER_FIELDS } from "../schema/supplier";
import { diceSimilarity, exactHeaderHits, matchName, suggestByHeuristics } from "./heuristics";

const field = (key: string) => {
  const f = SUPPLIER_FIELDS.find((x) => x.key === key);
  if (!f) throw new Error(key);
  return f;
};

function profile(patterns: Partial<ColumnProfile["patterns"]>): ColumnProfile {
  return {
    columnId: "x",
    name: "x",
    nonEmptyRatio: 1,
    distinctRatio: 1,
    avgLength: 10,
    patterns: { email: 0, url: 0, numeric: 0, phoneLike: 0, countryLike: 0, ...patterns },
  };
}

describe("matchName", () => {
  it.each([
    ["E-mail", "email", "exact"],
    ["VAT No.", "taxId", "exact"],
    ["Zip", "postalCode", "exact"],
    ["Contact Person", "contactName", "exact"],
    ["companyname", "companyName", "compact"],
    ["Primary contact email address", "email", "phrase"],
  ])("%s → %s (%s)", (header, key, how) => {
    expect(matchName(header, field(key))).toMatchObject({ how });
  });

  it("weakens a match when the header is qualified by an id-like token", () => {
    const plain = matchName("Supplier", field("companyName"));
    const qualified = matchName("Supplier ID", field("companyName"));
    expect(plain?.score).toBeGreaterThan(0.9);
    expect(qualified?.score ?? 0).toBeLessThan(0.4);
  });

  it("tolerates typos", () => {
    expect(matchName("Emial", field("email"))?.how).toBe("fuzzy");
  });
});

describe("diceSimilarity", () => {
  it("is 1 for equal strings and symmetric", () => {
    expect(diceSimilarity("country", "country")).toBe(1);
    expect(diceSimilarity("night", "nacht")).toBe(diceSimilarity("nacht", "night"));
  });
});

describe("suggestByHeuristics", () => {
  const columns = [
    { id: "c-001", name: "Supplier Name" },
    { id: "c-002", name: "E-mail", profile: profile({ email: 0.97 }) },
    { id: "c-003", name: "Contact", profile: profile({ email: 0.95 }) },
    { id: "c-004", name: "Land", profile: profile({ countryLike: 0.9 }) },
    { id: "c-005", name: "Col X", profile: profile({ url: 0.88 }) },
    { id: "c-006", name: "Internal notes" },
  ];
  const suggestions = suggestByHeuristics(columns, SUPPLIER_FIELDS);
  const target = (id: string) => suggestions.find((s) => s.sourceColumnId === id)?.targetField;

  it("returns one suggestion per column, in order, all heuristic", () => {
    expect(suggestions.map((s) => s.sourceColumnId)).toEqual(columns.map((c) => c.id));
    expect(new Set(suggestions.map((s) => s.origin))).toEqual(new Set(["heuristic"]));
  });

  it("maps by header", () => {
    expect(target("c-001")).toBe("companyName");
    expect(target("c-004")).toBe("country");
  });

  it("uses values when the header is unhelpful", () => {
    expect(target("c-005")).toBe("website");
  });

  it("never assigns a field twice; the stronger match wins", () => {
    expect(target("c-002")).toBe("email");
    expect(target("c-003")).not.toBe("email");
    const used = suggestions.map((s) => s.targetField).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it("leaves unmatched columns unmapped with a reason", () => {
    const notes = suggestions.find((s) => s.sourceColumnId === "c-006");
    expect(notes).toMatchObject({ targetField: null, confidence: 0 });
    expect(notes?.reasoning).toMatch(/No field matched/);
  });

  it("explains each match", () => {
    expect(suggestions[1]?.reasoning).toMatch(/E-mail.*97% of values look like email addresses/);
  });

  it("is deterministic", () => {
    expect(suggestByHeuristics(columns, SUPPLIER_FIELDS)).toEqual(suggestions);
  });
});

describe("exactHeaderHits", () => {
  it("lists only exact or compact header matches", () => {
    const hits = exactHeaderHits(
      [
        { id: "a", name: "Email" },
        { id: "b", name: "Contact email address" },
        { id: "c", name: "Zip" },
      ],
      SUPPLIER_FIELDS,
    );
    expect(hits).toEqual([
      { columnId: "a", field: "email" },
      { columnId: "c", field: "postalCode" },
    ]);
  });
});
