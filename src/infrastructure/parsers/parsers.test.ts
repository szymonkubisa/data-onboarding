import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv";
import { detectFileType, parseFile, precheckFile } from "./parse-file";
import { readWorkbook } from "./xlsx";

const FIXTURES = join(process.cwd(), "test/fixtures");
const SAMPLE = join(process.cwd(), "public/samples/suppliers-messy.csv");

const fileFrom = (content: BlobPart, name: string, type = "") =>
  Object.assign(new Blob([content], { type }), { name });

describe("parseCsvText", () => {
  it("detects semicolons and strips the BOM", () => {
    const result = parseCsvText("﻿Name;City\r\nAcme;Łódź\r\n");
    expect(result).toMatchObject({ ok: true, delimiter: ";" });
    if (result.ok) expect(result.matrix[0]).toEqual(["Name", "City"]);
  });

  it("handles quoted delimiters, quotes and newlines inside values", () => {
    const result = parseCsvText('Name,Address\n"Acme ""Blue"" Ltd","Unit 3,\nHigh St"\n');
    expect(result.ok && result.matrix[1]).toEqual(['Acme "Blue" Ltd', "Unit 3,\nHigh St"]);
  });

  it("detects tabs", () => {
    expect(parseCsvText("a\tb\n1\t2").ok && parseCsvText("a\tb\n1\t2")).toMatchObject({
      delimiter: "\t",
    });
  });

  it("fails clearly on an unclosed quote", () => {
    const result = parseCsvText('Name,City\n"Acme,Leeds\nBeta,York\n');
    expect(result).toMatchObject({ ok: false, error: { code: "parse-failed" } });
    if (!result.ok) expect(result.error.message).toMatch(/unclosed quote/);
  });

  it("warns when the text looks mis-decoded", () => {
    const result = parseCsvText("Name\nM�ller\n");
    expect(result.ok && result.warnings[0]?.code).toBe("encoding-suspect");
  });

  it("rejects empty input", () => {
    expect(parseCsvText(" \n ")).toMatchObject({ ok: false, error: { code: "empty-file" } });
  });
});

describe("precheckFile", () => {
  it.each([
    ["a.csv", "csv"],
    ["A.TSV", "csv"],
    ["b.xlsx", "xlsx"],
    ["c.xls", "xls"],
    ["d.pdf", "unknown"],
  ])("detects %s as %s", (name, type) => {
    expect(detectFileType(name)).toBe(type);
  });

  it("rejects legacy xls, unknown types, empty and oversized files", () => {
    expect(precheckFile({ name: "a.xls", size: 10 })?.code).toBe("unsupported-type");
    expect(precheckFile({ name: "a.pdf", size: 10 })?.code).toBe("unsupported-type");
    expect(precheckFile({ name: "a.csv", size: 0 })?.code).toBe("empty-file");
    expect(precheckFile({ name: "a.csv", size: 11 * 1024 * 1024 })).toMatchObject({
      code: "file-too-large",
      message: expect.stringMatching(/11\.0 MB.*10\.0 MB/),
    });
    expect(precheckFile({ name: "a.csv", size: 10 })).toBeNull();
  });
});

describe("parseFile", () => {
  it("parses the sample CSV into the documented shape", async () => {
    const outcome = await parseFile(fileFrom(readFileSync(SAMPLE), "suppliers-messy.csv"), "id-1");
    expect(outcome.kind).toBe("dataset");
    if (outcome.kind !== "dataset") return;
    const { dataset } = outcome;
    expect(dataset.rows).toHaveLength(184);
    expect(dataset.columns).toHaveLength(14);
    expect(dataset.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(["E-mail", "E-mail (2)", "Column 13"]),
    );
    expect(dataset.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["header-renamed", "header-generated", "empty-rows-skipped"]),
    );
  });

  it("asks for a sheet when the workbook has several, then builds from the chosen one", async () => {
    const outcome = await parseFile(
      fileFrom(readFileSync(join(FIXTURES, "suppliers.xlsx")), "suppliers.xlsx"),
      "id-2",
    );
    expect(outcome.kind).toBe("choose-sheet");
    if (outcome.kind !== "choose-sheet") return;
    expect(outcome.sheets).toEqual([
      { name: "Suppliers", nonEmptyRows: 41 },
      { name: "Read me", nonEmptyRows: 2 },
    ]);
    const picked = outcome.pick("Suppliers");
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(picked.dataset).toMatchObject({ fileType: "xlsx", sheetName: "Suppliers" });
    expect(picked.dataset.rows).toHaveLength(40);
    expect(picked.dataset.columns[0]?.name).toBe("Company");
    expect(picked.dataset.warnings.map((w) => w.code)).toContain("multiple-sheets");
  });

  it("reports unreadable workbooks", async () => {
    const outcome = await parseFile(fileFrom("not a zip", "broken.xlsx"), "id-3");
    expect(outcome).toMatchObject({ kind: "error", error: { code: "parse-failed" } });
  });
});

describe("readWorkbook", () => {
  it("keeps numbers as the stored string", async () => {
    const result = await readWorkbook(
      readFileSync(join(FIXTURES, "suppliers.xlsx")).buffer as ArrayBuffer,
    );
    expect(result.ok).toBe(true);
  });
});
