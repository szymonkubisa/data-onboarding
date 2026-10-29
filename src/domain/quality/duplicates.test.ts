import { describe, expect, it } from "vitest";
import { customerSchema } from "../schema/customer";
import { companyKey, findDuplicateGroups } from "./duplicates";

const record = (rowId: string, values: Record<string, string>) => ({ rowId, values });

describe("companyKey", () => {
  it.each([
    ["Acme Ltd", "acme"],
    ["ACME Limited", "acme"],
    ["The Acme Company", "acme"],
    ["Acme Sp. z o.o.", "acme"],
    ["Łódź Logistics GmbH", "lodz logistics"],
    ["Ltd", "ltd"],
  ])("%s → %s", (input, expected) => {
    expect(companyKey(input)).toBe(expected);
  });
});

describe("findDuplicateGroups", () => {
  it("links rows by normalized tax id, email, or name + country", () => {
    const groups = findDuplicateGroups(
      [
        record("r-1", { taxId: "GB 123 456 789", email: "a@acme.com" }),
        record("r-2", { taxId: "gb123456789", email: "x@other.com" }),
        record("r-3", { companyName: "Beta GmbH", country: "Germany", email: "B@beta.de" }),
        record("r-4", { companyName: "BETA", country: "DE" }),
        record("r-5", { companyName: "Gamma", email: "b@beta.de" }),
        record("r-6", { companyName: "Unique Ltd", country: "France" }),
      ],
      customerSchema,
    );
    expect(groups).toEqual([
      { id: "dup-r-1", rowIds: ["r-1", "r-2"], reasons: ["Same tax ID"] },
      {
        id: "dup-r-3",
        rowIds: ["r-3", "r-4", "r-5"],
        reasons: expect.arrayContaining(["Same email", "Same name and country"]),
      },
    ]);
  });

  it("ignores empty key parts", () => {
    const groups = findDuplicateGroups(
      [
        record("r-1", { companyName: "Acme", country: "" }),
        record("r-2", { companyName: "Acme", country: "" }),
      ],
      customerSchema,
    );
    expect(groups).toEqual([]);
  });
});
