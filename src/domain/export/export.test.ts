import { describe, expect, it } from "vitest";
import { runCustomer, customerDataset, VALID_CUSTOMER } from "../../../test/helpers/factories";
import { customerSchema } from "../schema/customer";
import { buildExport, DEFAULT_EXPORT_OPTIONS } from "./build-export";
import { escapeFormula, needsFormulaEscape } from "./formula";
import { buildExportReport } from "./report";

describe("formula escaping", () => {
  it.each([
    ["=1+2", true],
    ['=HYPERLINK("http://evil","x")', true],
    ["@SUM(1+1)", true],
    ["+Plus Supplies", true],
    ["-cmd|' /C calc'!A0", true],
    ["\tTabbed", true],
    ["\rReturn", true],
    ["-12.5", false],
    ["+44 20 7946 0000", false],
    ["-(1)", false],
    ["Acme", false],
    ["", false],
    ["a=b", false],
  ])("%j → %s", (value, escaped) => {
    expect(needsFormulaEscape(value)).toBe(escaped);
    expect(escapeFormula(value)).toBe(escaped ? `'${value}` : value);
  });
});

describe("buildExport", () => {
  const rows = [
    { ...VALID_CUSTOMER },
    { ...VALID_CUSTOMER, companyName: "Warn Co", email: "w@w.example", country: "Narnia" },
    { ...VALID_CUSTOMER, companyName: "Err Co", email: "broken" },
    { ...VALID_CUSTOMER, companyName: "Excluded Co", email: "e@e.example" },
  ];

  it("leaves out error rows by default and lists every exclusion with a reason", () => {
    const report = runCustomer(rows, { excludedRowIds: { "r-0004": true } });
    const plan = buildExport(report, customerSchema, DEFAULT_EXPORT_OPTIONS);
    expect(plan.columns).toEqual(customerSchema.fields.map((f) => f.key));
    expect(plan.includedRowIds).toEqual(["r-0001", "r-0002"]);
    expect(plan.excluded).toEqual([
      { rowId: "r-0003", sourceRowNumber: 4, reason: "has-errors" },
      { rowId: "r-0004", sourceRowNumber: 5, reason: "user-excluded" },
    ]);
    expect(plan.counts).toEqual({
      included: 2,
      excludedByUser: 1,
      excludedForErrors: 1,
      includedWithWarnings: 1,
      includedWithErrors: 0,
    });
  });

  it("includes error rows only when asked, and counts them", () => {
    const report = runCustomer(rows);
    const plan = buildExport(report, customerSchema, {
      ...DEFAULT_EXPORT_OPTIONS,
      includeErrorRows: true,
    });
    expect(plan.counts.included).toBe(4);
    expect(plan.counts.includedWithErrors).toBe(1);
  });

  it("exports final values in schema field order", () => {
    const report = runCustomer([{ ...VALID_CUSTOMER, country: "uk", city: " Leeds " }]);
    const plan = buildExport(report, customerSchema, DEFAULT_EXPORT_OPTIONS);
    const row = Object.fromEntries(plan.columns.map((c, i) => [c, plan.rows[0]?.[i]]));
    expect(row).toMatchObject({ country: "United Kingdom", city: "Leeds", phone: "" });
  });
});

describe("buildExportReport", () => {
  it("records mapping provenance, changes, unresolved issues and exclusions", () => {
    const rows = [
      { ...VALID_CUSTOMER, country: "uk" },
      { ...VALID_CUSTOMER, companyName: "Err", email: "broken" },
    ];
    const { dataset, mapping } = customerDataset(rows);
    const report = runCustomer(rows);
    const plan = buildExport(report, customerSchema, DEFAULT_EXPORT_OPTIONS);
    const json = buildExportReport({
      dataset,
      schema: customerSchema,
      mapping,
      suggestions: [
        {
          sourceColumnId: "c-001",
          targetField: "companyName",
          confidence: 0.93,
          reasoning: "r",
          origin: "llm",
        },
      ],
      report,
      plan,
      generatedAt: "2026-10-17T00:00:00.000Z",
    });
    expect(json.mapping[0]).toMatchObject({
      sourceColumn: "companyName",
      targetField: "companyName",
      decision: "accepted",
      suggestion: { origin: "llm", confidence: 0.93 },
    });
    expect(json.transformations.counts).toEqual({ "country-canonical": 1 });
    expect(json.transformations.changes[0]).toMatchObject({
      rowId: "r-0001",
      from: "uk",
      to: "United Kingdom",
    });
    expect(json.exclusions).toEqual([
      { rowId: "r-0002", sourceRowNumber: 3, reason: "has-errors" },
    ]);
    expect(json.unresolvedIssues).toEqual([]);
    expect(json.summary).toMatchObject({ exportedRows: 1, excludedForErrors: 1, valuesChanged: 1 });
  });
});
