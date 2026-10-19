import { describe, expect, it } from "vitest";
import { runSupplier, VALID_SUPPLIER } from "../../../test/helpers/factories";
import { pendingFixIds } from "./pipeline";

const first = (rows: Record<string, string>[], overlays?: Parameters<typeof runSupplier>[1]) => {
  const report = runSupplier(rows, overlays);
  const record = report.records[0];
  if (!record) throw new Error("no record");
  return { report, record, codes: record.issues.map((i) => i.code) };
};

describe("runQualityPipeline", () => {
  it("passes a clean record", () => {
    const { record } = first([{ ...VALID_SUPPLIER }]);
    expect(record.status).toBe("valid");
    expect(record.issues).toEqual([]);
    expect(record.applied).toEqual([]);
  });

  it("applies and records auto transforms, keeping the original", () => {
    const { record } = first([
      {
        ...VALID_SUPPLIER,
        companyName: "  Acme   Ltd ",
        email: "Orders@ACME.example",
        country: " uk ",
      },
    ]);
    expect(record.values).toMatchObject({
      companyName: "Acme Ltd",
      email: "Orders@acme.example",
      country: "United Kingdom",
    });
    expect(record.original.country).toBe(" uk ");
    expect(record.applied.map((t) => [t.field, t.code, t.kind])).toEqual([
      ["companyName", "whitespace", "auto"],
      ["email", "email-normalize", "auto"],
      ["country", "whitespace", "auto"],
      ["country", "country-canonical", "auto"],
    ]);
    expect(record.status).toBe("valid");
  });

  it("treats null tokens as empty and then requires required fields", () => {
    const { record, codes } = first([{ ...VALID_SUPPLIER, email: "N/A", phone: "-" }]);
    expect(record.values.email).toBe("");
    expect(record.values.phone).toBe("");
    expect(codes).toEqual(["required-missing"]);
    expect(record.issues[0]).toMatchObject({ field: "email", severity: "error" });
    expect(record.status).toBe("error");
  });

  it.each([
    [{ email: "orders(at)acme" }, "invalid-email", "error"],
    [{ website: "not a site" }, "invalid-url", "error"],
    [{ website: "acme.example" }, "url-missing-scheme", "error"],
    [{ country: "Narnia" }, "unknown-country", "warning"],
    [{ country: "NA" }, "ambiguous-country", "warning"],
    [{ phone: "ask for Tom" }, "phone-has-letters", "warning"],
    [{ taxId: "gb 123 456 789" }, "tax-id-format", "warning"],
  ])("%j → %s (%s)", (patch, code, severity) => {
    const { record, codes } = first([{ ...VALID_SUPPLIER, ...patch }]);
    expect(codes).toEqual([code]);
    expect(record.status).toBe(severity);
  });

  it("keeps unrecognised countries unchanged", () => {
    const { record } = first([{ ...VALID_SUPPLIER, country: "Narnia" }]);
    expect(record.values.country).toBe("Narnia");
  });

  it("proposes suggested fixes and applies them only when accepted", () => {
    const rows = [{ ...VALID_SUPPLIER, website: "acme.example", taxId: "gb 123" }];
    const before = first(rows);
    const fixIds = pendingFixIds(before.report);
    expect(fixIds).toEqual(["r-0001:taxId:tax-id-format", "r-0001:website:url-missing-scheme"]);
    expect(before.record.values.website).toBe("acme.example");
    expect(before.report.summary.pendingFixes).toBe(2);

    const after = first(rows, {
      acceptedFixes: Object.fromEntries(fixIds.map((id) => [id, true])),
    });
    expect(after.record.values).toMatchObject({ website: "https://acme.example", taxId: "GB123" });
    expect(after.record.applied.filter((t) => t.kind === "suggested").map((t) => t.code)).toEqual([
      "tax-id-compact",
      "url-add-scheme",
    ]);
    expect(after.record.status).toBe("valid");
    expect(after.report.summary.pendingFixes).toBe(0);
  });

  it("overlays manual corrections, records them, and still normalizes the corrected value", () => {
    const { record } = first([{ ...VALID_SUPPLIER, email: "broken" }], {
      corrections: { "r-0001:email": " fixed@ACME.example " },
    });
    expect(record.values.email).toBe("fixed@acme.example");
    expect(record.original.email).toBe("broken");
    expect(record.applied[0]).toMatchObject({
      kind: "manual",
      from: "broken",
      to: " fixed@ACME.example ",
    });
    expect(record.status).toBe("valid");
  });

  it("flags duplicates across rows without merging anything", () => {
    const report = runSupplier([
      { ...VALID_SUPPLIER, taxId: "GB1" },
      { ...VALID_SUPPLIER, companyName: "Other", email: "x@other.example", taxId: "gb1" },
      { ...VALID_SUPPLIER, companyName: "Third", email: "z@third.example" },
    ]);
    expect(report.records).toHaveLength(3);
    expect(report.duplicateGroups.map((g) => g.rowIds)).toEqual([["r-0001", "r-0002"]]);
    const issue = report.records[0]?.issues.find((i) => i.code === "possible-duplicate");
    expect(issue).toMatchObject({ severity: "warning", relatedRowIds: ["r-0002"] });
    expect(issue?.message).toMatch(/Possible duplicate of r-0002 \(same tax id\)/);
    expect(report.summary.duplicates).toBe(2);
  });

  it("drops excluded rows from duplicate detection and from status counts", () => {
    const rows = [
      { ...VALID_SUPPLIER, taxId: "GB1" },
      { ...VALID_SUPPLIER, companyName: "Other", email: "x@o.example", taxId: "GB1" },
    ];
    const report = runSupplier(rows, { excludedRowIds: { "r-0002": true } });
    expect(report.duplicateGroups).toEqual([]);
    expect(report.records[1]?.excluded).toBe(true);
    expect(report.summary).toMatchObject({ total: 2, valid: 1, excluded: 1, duplicates: 0 });
  });

  it("is deterministic and never mutates its input", () => {
    const rows = [{ ...VALID_SUPPLIER, country: "uk" }];
    expect(runSupplier(rows)).toEqual(runSupplier(rows));
    expect(rows[0]?.country).toBe("uk");
  });

  it("summarizes counts by status and issue code", () => {
    const report = runSupplier([
      { ...VALID_SUPPLIER },
      { ...VALID_SUPPLIER, email: "bad", companyName: "B" },
      { ...VALID_SUPPLIER, country: "Narnia", companyName: "C", email: "c@c.example" },
    ]);
    expect(report.summary).toMatchObject({
      total: 3,
      valid: 1,
      errors: 1,
      warnings: 1,
      issuesByCode: { "invalid-email": 1, "unknown-country": 1 },
    });
  });
});

describe("previewField", () => {
  it("shows what a value becomes and what it would raise", async () => {
    const { supplierSchema } = await import("../schema/supplier");
    const { previewField } = await import("./pipeline");
    const field = (key: string) => supplierSchema.fields.find((f) => f.key === key)!;
    expect(previewField(field("country"), " uk ")).toEqual({
      from: " uk ",
      to: "United Kingdom",
      changed: true,
      issue: null,
    });
    expect(previewField(field("email"), "nope").issue).toMatchObject({ severity: "error" });
    expect(previewField(field("website"), "acme.example").issue?.message).toMatch(
      /https:\/\/acme\.example/,
    );
  });
});
