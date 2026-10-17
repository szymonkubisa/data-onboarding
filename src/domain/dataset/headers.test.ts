import { describe, expect, it } from "vitest";
import { normalizeHeaders } from "./headers";

const names = (raw: string[]) => normalizeHeaders(raw).map((h) => h.name);

describe("normalizeHeaders", () => {
  it("trims and collapses whitespace, including NBSP and BOM", () => {
    expect(names(["﻿ Company   Name ", "E-mail address"])).toEqual([
      "Company Name",
      "E-mail address",
    ]);
  });

  it("names empty headers by position", () => {
    expect(names(["Name", "", "  "])).toEqual(["Name", "Column 2", "Column 3"]);
  });

  it("suffixes case-insensitive duplicates", () => {
    expect(names(["Email", "email", "EMAIL"])).toEqual(["Email", "email (2)", "EMAIL (3)"]);
  });

  it("does not let a suffix collide with a real header", () => {
    expect(names(["Email", "Email", "Email (2)"])).toEqual(["Email", "Email (3)", "Email (2)"]);
  });

  it("does not let a generated name collide with a real header later in the row", () => {
    expect(names(["", "Column 1"])).toEqual(["Column 1 (2)", "Column 1"]);
  });

  it("cuts long headers and flags them", () => {
    const [header] = normalizeHeaders(["x".repeat(250)], 200);
    expect(header?.name).toHaveLength(200);
    expect(header?.truncated).toBe(true);
  });

  it("reports what changed", () => {
    const result = normalizeHeaders(["Email", "Email", ""]);
    expect(result.map((h) => [h.renamed, h.generated])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
    expect(result[1]?.originalName).toBe("Email");
  });
});
