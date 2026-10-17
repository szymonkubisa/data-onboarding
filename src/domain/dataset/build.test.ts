import { describe, expect, it } from "vitest";
import { buildDataset, cellToString } from "./build";

const build = (matrix: unknown[][], limits?: { maxRows?: number; maxColumns?: number }) =>
  buildDataset({ id: "d1", fileName: "f.csv", fileType: "csv", matrix, limits });

function ok(result: ReturnType<typeof buildDataset>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.dataset;
}

describe("buildDataset", () => {
  it("uses the first non-empty row as header and assigns stable ids", () => {
    const ds = ok(
      build([
        ["", ""],
        ["Name", "Email"],
        ["Acme", "a@acme.test"],
      ]),
    );
    expect(ds.columns.map((c) => [c.id, c.name])).toEqual([
      ["c-001", "Name"],
      ["c-002", "Email"],
    ]);
    expect(ds.rows).toEqual([
      { id: "r-0001", sourceRowNumber: 3, values: { "c-001": "Acme", "c-002": "a@acme.test" } },
    ]);
  });

  it("keeps raw values untouched", () => {
    const ds = ok(build([["Name"], ["  Acme  "]]));
    expect(ds.rows[0]?.values["c-001"]).toBe("  Acme  ");
  });

  it("skips empty rows and reports them", () => {
    const ds = ok(build([["Name"], ["A"], ["", " "], ["B"]]));
    expect(ds.rows.map((r) => r.id)).toEqual(["r-0001", "r-0002"]);
    expect(ds.rows[1]?.sourceRowNumber).toBe(4);
    expect(ds.warnings).toContainEqual(
      expect.objectContaining({ code: "empty-rows-skipped", count: 1 }),
    );
  });

  it("removes columns with no header and no values, keeps headerless columns with values", () => {
    const ds = ok(
      build([
        ["Name", "", "", "City"],
        ["A", "", "x", "Leeds"],
      ]),
    );
    expect(ds.columns.map((c) => c.name)).toEqual(["Name", "Column 2", "City"]);
    expect(ds.columns[1]?.index).toBe(2);
    expect(ds.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["empty-columns-removed", "header-generated"]),
    );
  });

  it("pads ragged rows", () => {
    const ds = ok(build([["A", "B", "C"], ["1"]]));
    expect(ds.rows[0]?.values).toEqual({ "c-001": "1", "c-002": "", "c-003": "" });
  });

  it("truncates rows over the limit and says how many were dropped", () => {
    const ds = ok(build([["N"], ["1"], ["2"], ["3"]], { maxRows: 2 }));
    expect(ds.rows).toHaveLength(2);
    expect(ds.warnings).toContainEqual(
      expect.objectContaining({ code: "rows-truncated", count: 1 }),
    );
  });

  it("truncates columns over the limit and flags rows with values in dropped columns", () => {
    const ds = ok(
      build(
        [
          ["A", "B", "C"],
          ["1", "2", "3"],
        ],
        { maxColumns: 2 },
      ),
    );
    expect(ds.columns.map((c) => c.name)).toEqual(["A", "B"]);
    expect(ds.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["columns-truncated", "extra-cells"]),
    );
  });

  it("renames duplicate headers and reports it", () => {
    const ds = ok(
      build([
        ["Email", "Email"],
        ["a", "b"],
      ]),
    );
    expect(ds.columns.map((c) => c.name)).toEqual(["Email", "Email (2)"]);
    expect(ds.warnings).toContainEqual(expect.objectContaining({ code: "header-renamed" }));
  });

  it("rejects empty files and header-only files", () => {
    expect(build([])).toMatchObject({ ok: false, error: { code: "empty-file" } });
    expect(build([[""], [" "]])).toMatchObject({ ok: false, error: { code: "empty-file" } });
    expect(build([["Name"]])).toMatchObject({ ok: false, error: { code: "no-data-rows" } });
  });
});

describe("cellToString", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [42, "42"],
    [-12.5, "-12.5"],
    [Number.NaN, ""],
    [true, "TRUE"],
    [new Date("2024-03-01T00:00:00.000Z"), "2024-03-01"],
    [new Date("2024-03-01T10:30:00.000Z"), "2024-03-01T10:30:00.000Z"],
    ["text", "text"],
  ])("%s → %s", (input, expected) => {
    expect(cellToString(input)).toBe(expected);
  });
});
