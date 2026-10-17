import { normalizeHeaders } from "./headers";
import { LIMITS } from "./limits";
import type { DatasetResult, DatasetWarning, FileType, SourceColumn, SourceRow } from "./types";

export interface BuildDatasetInput {
  id: string;
  fileName: string;
  fileType: FileType;
  sheetName?: string;
  /** Rows of cells as produced by a parser. Cells may be any primitive; they are stringified here. */
  matrix: readonly (readonly unknown[])[];
  /** Warnings produced by the parser itself (e.g. sheet selection). */
  extraWarnings?: readonly DatasetWarning[];
  limits?: { maxRows?: number; maxColumns?: number };
}

/** Stringify a parsed cell without locale-dependent formatting. */
export function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return "";
    const iso = cell.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  return String(cell);
}

const isBlank = (value: string) => value.trim() === "";

const columnId = (index: number) => `c-${String(index + 1).padStart(3, "0")}`;
const rowId = (index: number) => `r-${String(index + 1).padStart(4, "0")}`;

function examples(items: readonly string[], max = 3): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/**
 * Build a dataset from a parsed matrix. Shared by the CSV and XLSX parsers so both
 * formats get identical header handling, limits and warnings.
 *
 * The first non-empty row is the header. Fully empty rows are skipped. Columns with
 * no header and no values are removed. Every adjustment is reported as a warning.
 */
export function buildDataset(input: BuildDatasetInput): DatasetResult {
  const maxRows = input.limits?.maxRows ?? LIMITS.maxRows;
  const maxColumns = input.limits?.maxColumns ?? LIMITS.maxColumns;
  const warnings: DatasetWarning[] = [...(input.extraWarnings ?? [])];

  const matrix = input.matrix.map((row) => row.map(cellToString));
  // Blank rows at the very end (a trailing newline, Excel's formatted-but-empty rows) are
  // not data the person typed, so they are dropped without a warning.
  while (matrix.length > 0 && matrix[matrix.length - 1]!.every(isBlank)) matrix.pop();
  const headerIndex = matrix.findIndex((row) => row.some((cell) => !isBlank(cell)));
  if (headerIndex === -1) {
    return { ok: false, error: { code: "empty-file", message: "The file is empty." } };
  }

  const headerCells = matrix[headerIndex] ?? [];
  const dataMatrix = matrix.slice(headerIndex + 1);
  const width = Math.max(headerCells.length, ...dataMatrix.map((row) => row.length));

  // Keep a column if it has a header or at least one value.
  const keptIndexes: number[] = [];
  let removedEmpty = 0;
  for (let c = 0; c < width; c += 1) {
    const hasHeader = !isBlank(headerCells[c] ?? "");
    if (hasHeader || dataMatrix.some((row) => !isBlank(row[c] ?? ""))) keptIndexes.push(c);
    else removedEmpty += 1;
  }
  if (removedEmpty > 0) {
    warnings.push({
      code: "empty-columns-removed",
      count: removedEmpty,
      message: `Removed ${removedEmpty} empty column${removedEmpty === 1 ? "" : "s"} with no header and no values.`,
    });
  }
  if (keptIndexes.length > maxColumns) {
    warnings.push({
      code: "columns-truncated",
      count: keptIndexes.length - maxColumns,
      message: `The file has ${keptIndexes.length} columns. Only the first ${maxColumns} were kept.`,
    });
    keptIndexes.length = maxColumns;
  }

  const headers = normalizeHeaders(keptIndexes.map((c) => headerCells[c] ?? ""));
  const columns: SourceColumn[] = headers.map((header, i) => ({
    id: columnId(i),
    index: keptIndexes[i] ?? i,
    name: header.name,
    originalName: header.originalName,
  }));

  const renamed = headers.filter((h) => h.renamed);
  if (renamed.length > 0) {
    warnings.push({
      code: "header-renamed",
      count: renamed.length,
      message: `Renamed duplicate headers: ${examples(renamed.map((h) => `“${h.name}”`))}.`,
    });
  }
  const generated = headers.filter((h) => h.generated);
  if (generated.length > 0) {
    warnings.push({
      code: "header-generated",
      count: generated.length,
      message: `Named columns with an empty header: ${examples(generated.map((h) => `“${h.name}”`))}.`,
    });
  }
  const truncatedHeaders = headers.filter((h) => h.truncated);
  if (truncatedHeaders.length > 0) {
    warnings.push({
      code: "header-truncated",
      count: truncatedHeaders.length,
      message: `Shortened ${truncatedHeaders.length} header${truncatedHeaders.length === 1 ? "" : "s"} longer than ${LIMITS.maxHeaderLength} characters.`,
    });
  }

  const keptSet = new Set(keptIndexes);
  const rows: SourceRow[] = [];
  let skippedEmpty = 0;
  let extraCellRows = 0;
  let totalDataRows = 0;

  dataMatrix.forEach((cells, offset) => {
    const values: Record<string, string> = {};
    let empty = true;
    columns.forEach((column) => {
      const value = cells[column.index] ?? "";
      values[column.id] = value;
      if (!isBlank(value)) empty = false;
    });
    if (empty) {
      skippedEmpty += 1;
      return;
    }
    if (cells.some((cell, c) => !keptSet.has(c) && !isBlank(cell))) extraCellRows += 1;
    totalDataRows += 1;
    if (rows.length >= maxRows) return;
    rows.push({
      id: rowId(rows.length),
      sourceRowNumber: headerIndex + offset + 2,
      values,
    });
  });

  if (skippedEmpty > 0) {
    warnings.push({
      code: "empty-rows-skipped",
      count: skippedEmpty,
      message: `Skipped ${skippedEmpty} empty row${skippedEmpty === 1 ? "" : "s"}.`,
    });
  }
  if (extraCellRows > 0) {
    warnings.push({
      code: "extra-cells",
      count: extraCellRows,
      message: `${extraCellRows} row${extraCellRows === 1 ? " has" : "s have"} values in columns that were dropped.`,
    });
  }
  if (totalDataRows > maxRows) {
    warnings.push({
      code: "rows-truncated",
      count: totalDataRows - maxRows,
      message: `The file has ${totalDataRows.toLocaleString("en-US")} data rows. Only the first ${maxRows.toLocaleString("en-US")} were imported.`,
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: { code: "no-data-rows", message: "The file has a header row but no data rows." },
    };
  }

  return {
    ok: true,
    dataset: {
      id: input.id,
      fileName: input.fileName,
      fileType: input.fileType,
      ...(input.sheetName !== undefined ? { sheetName: input.sheetName } : {}),
      columns,
      rows,
      warnings,
    },
  };
}
