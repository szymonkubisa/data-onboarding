import { describe, expect, it } from "vitest";
import { runCustomer, VALID_CUSTOMER } from "../../../test/helpers/factories";
import { DEFAULT_FILTERS, filterRecords, statusCounts } from "./filter";

const report = runCustomer(
  [
    { ...VALID_CUSTOMER },
    { ...VALID_CUSTOMER, companyName: "Broken Mail", email: "nope" },
    { ...VALID_CUSTOMER, companyName: "Odd Land", email: "x@odd.example", country: "Narnia" },
    { ...VALID_CUSTOMER, companyName: "Twin", email: "t@twin.example", taxId: "GB1" },
    { ...VALID_CUSTOMER, companyName: "Twin Two", email: "t2@twin.example", taxId: "gb1" },
    { ...VALID_CUSTOMER, companyName: "Gone", email: "g@gone.example" },
  ],
  { excludedRowIds: { "r-0006": true } },
);
const ids = (filters: Partial<typeof DEFAULT_FILTERS>) =>
  filterRecords(report.records, { ...DEFAULT_FILTERS, ...filters }).map((r) => r.rowId);

describe("filterRecords", () => {
  it("filters by status, keeping excluded rows out of status buckets", () => {
    expect(ids({})).toHaveLength(6);
    expect(ids({ status: "valid" })).toEqual(["r-0001"]);
    expect(ids({ status: "error" })).toEqual(["r-0002"]);
    expect(ids({ status: "warning" })).toEqual(["r-0003", "r-0004", "r-0005"]);
    expect(ids({ status: "duplicates" })).toEqual(["r-0004", "r-0005"]);
    expect(ids({ status: "excluded" })).toEqual(["r-0006"]);
  });

  it("filters by field and issue type", () => {
    expect(ids({ field: "email" })).toEqual(["r-0002"]);
    expect(ids({ code: "unknown-country" })).toEqual(["r-0003"]);
  });

  it("searches values case-insensitively, and row ids or numbers", () => {
    expect(ids({ query: "twin" })).toEqual(["r-0004", "r-0005"]);
    expect(ids({ query: "r-0003" })).toEqual(["r-0003"]);
    expect(ids({ query: "7" })).toEqual(["r-0006"]);
  });

  it("counts every bucket", () => {
    expect(statusCounts(report)).toEqual({
      all: 6,
      valid: 1,
      warning: 3,
      error: 1,
      duplicates: 2,
      excluded: 1,
    });
  });
});
